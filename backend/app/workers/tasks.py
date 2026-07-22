from __future__ import annotations

import asyncio
import os
from pathlib import Path
from threading import Thread

from celery import Celery
from celery.signals import worker_ready

from ..services.jobs import ACTIVE, MAX_PAGES, JobStore, now
from ..services.ocr_runner import request_page

celery_app = Celery(
    "ocr",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6380/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6380/1"),
)
celery_app.conf.task_always_eager = os.getenv("CELERY_TASK_ALWAYS_EAGER", "").lower() == "true"
SAFE_ERRORS = {
    "encrypted_pdf", "invalid_model_json", "invalid_pdf", "ocr_failed",
    "pdf_page_limit_exceeded", "provider_timeout", "provider_unavailable",
    "unsupported_file", "worker_interrupted",
}


def safe_error(error: Exception) -> str:
    code = str(error).split(":", 1)[0]
    return code if code in SAFE_ERRORS else "ocr_failed"


def render_pdf(pdf: Path, output: Path) -> list[Path]:
    import fitz

    output.mkdir(parents=True, exist_ok=True)
    pages = []
    with fitz.open(pdf) as document:
        if not 1 <= len(document) <= MAX_PAGES:
            raise ValueError("pdf_page_limit_exceeded")
        for index, page in enumerate(document):
            image = page.get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72), alpha=False)
            target = output / f"page-{index + 1}.png"
            image.save(target)
            pages.append(target)
    return pages


def cancelled(store: JobStore, job_id: str) -> bool:
    if not (store.path(job_id) / "cancel").exists():
        return False
    store.update(job_id, status="cancelled", error=None, completed_at=now())
    return True


def plan_pages(page_count: int, mode: str, max_pages: int = 0) -> list[int]:
    if mode == "all":
        planned = list(range(page_count))
    elif mode == "first,last":
        planned = [0, page_count - 1]
    else:
        planned = [0, page_count - 2, page_count - 1]
    planned = list(dict.fromkeys(index for index in planned if 0 <= index < page_count))
    return planned[:max_pages] if max_pages else planned


def propose_segments(pages: list[dict]) -> list[dict]:
    segments: list[dict] = []
    for page in pages:
        page_index = page["source_page_index"]
        classification = page["classification"]
        kind = {
            "cover": "dossier_cover", "document_start": "administrative_document",
            "blank": "excluded", "separator": "excluded",
        }.get(classification, "unclassified")
        extend = classification == "continuation" and segments and segments[-1]["logical_document_type"] == "administrative_document"
        if extend:
            segments[-1]["end_page"] = page_index
            continue
        if classification == "continuation":
            kind = "unclassified"
        if segments and kind in {"excluded", "dossier_cover", "unclassified"} and segments[-1]["logical_document_type"] == kind:
            segments[-1]["end_page"] = page_index
            continue
        segments.append({"id": f"segment-{len(segments) + 1}", "logical_document_type": kind, "start_page": page_index, "end_page": page_index})
    return segments


def reused_classification(segment: dict, page_index: int) -> str:
    kind = segment["logical_document_type"]
    if kind == "dossier_cover":
        return "cover"
    if kind == "excluded":
        return "blank"
    if kind == "unclassified":
        return "unclassified"
    return "document_start" if page_index == segment["start_page"] else "continuation"


async def segment_job(store: JobStore, job: dict) -> dict:
    job = store.update(job["id"], status="segmenting", error=None)
    sources = job.get("source_pdfs", [])
    rendered = {}
    for source in sources:
        if cancelled(store, job["id"]):
            return store.read(job["id"])
        rendered[source["id"]] = render_pdf(store.path(job["id"]) / "uploads" / source["file_name"], store.path(job["id"]) / "artifacts" / source["id"])
    total = sum(map(len, rendered.values()))
    completed = 0
    store.update(job["id"], segmentation_total_pages=total)
    for source in sources:
        images = rendered[source["id"]]
        source["page_count"] = len(images)
        source["pages"] = []
        reused = bool(job.get("reuse_segmentation") and source.get("proposal"))
        for page_index, image in enumerate(images):
            if cancelled(store, job["id"]):
                return store.read(job["id"])
            error = ""
            segment = next((item for item in source.get("proposal", []) if item["start_page"] <= page_index <= item["end_page"]), None) if reused else None
            if segment:
                classification = reused_classification(segment, page_index)
            else:
                try:
                    result = await request_page(
                        image.read_bytes(), base_url=os.getenv("OCR_BASE_URL", ""), api_key=os.getenv("OCR_API_KEY", ""),
                        model=job.get("model", ""), timeout=float(os.getenv("OCR_TIMEOUT_SECONDS", "120")),
                        page_index=page_index, task="segmentation",
                    )
                    classification = result["classification"]
                except Exception as exc:
                    classification, error = "unclassified", safe_error(exc)
            source["pages"].append({
                "source_page_index": page_index,
                "image_url": f"/api/jobs/{job['id']}/artifacts/{source['id']}/page-{page_index + 1}.png",
                "classification": classification, "error": error,
            })
            completed += 1
            store.update(job["id"], source_pdfs=sources, segmentation_completed_pages=completed)
        if not reused:
            source["proposal"] = propose_segments(source["pages"])
            source["revision"] = int(source.get("revision", 0)) + 1
        store.update(job["id"], source_pdfs=sources)
        store.add_event(job["id"], "segmentation_proposed", source_pdf_id=source["id"], revision=source["revision"])
    return store.update(job["id"], status="awaiting_segmentation_review", source_pdfs=sources)


async def process_job_async(job_id: str) -> dict:
    store = JobStore(os.getenv("OCR_DATA_DIR", "data/jobs"))
    job = store.read(job_id)
    if job.get("status") not in {"starting", "extraction_starting"}:
        return job
    if job.get("processing_mode") == "combined_dossier" and job.get("status") == "starting":
        return await segment_job(store, job)
    extracting = job.get("status") == "extraction_starting"
    store.update(job_id, status="queued")
    if cancelled(store, job_id):
        return store.read(job_id)
    job = store.update(job_id, status="running", error=None, started_at=job.get("started_at") or now())
    documents: list[dict] = job.get("documents", []) if extracting else []
    successes = 0

    def persist() -> None:
        pages = [page for item in documents for page in item.get("pages", [])]
        store.update(job_id, page_count=len(pages), failed_pages=sum(bool(page.get("error")) for page in pages), documents=documents)

    work: list[tuple[dict, list[Path]]] = []
    if documents:
        for document in documents:
            images = [store.path(job_id) / "artifacts" / document["source_pdf_id"] / f"page-{page['source_page_index'] + 1}.png" for page in document["pages"]]
            work.append((document, images))
    else:
        logical_type = "dossier_cover" if job.get("processing_mode") == "dossier_cover" else "administrative_document"
        for pdf in sorted((store.path(job_id) / "uploads").glob("*.pdf")):
            source = next((item for item in job.get("source_pdfs", []) if item.get("file_name") == pdf.name), {"id": pdf.stem})
            images = render_pdf(pdf, store.path(job_id) / "artifacts" / source["id"])
            source.update(page_count=len(images), pages=[{
                "source_page_index": index,
                "image_url": f"/api/jobs/{job_id}/artifacts/{source['id']}/page-{index + 1}.png",
                "classification": "cover" if logical_type == "dossier_cover" and index == 0 else "document_start" if index == 0 else "continuation",
                "error": "",
            } for index in range(len(images))])
            document = {"id": pdf.stem, "file_name": pdf.name, "status": "processing", "fields": {}, "pages": [], "logical_document_type": logical_type, "source_pdf_id": source["id"]}
            documents.append(document)
            work.append((document, images))
        store.update(job_id, source_pdfs=job.get("source_pdfs", []))
    for document, pages in work:
        document.update(status="processing", fields={})
        try:
            if not document.get("pages"):
                document["pages"] = [
                {
                    "page_index": index,
                    "image_url": f"/api/jobs/{job_id}/artifacts/{document.get('source_pdf_id', document['id'])}/page-{index + 1}.png",
                    "source_pdf_id": document.get("source_pdf_id"),
                    "source_page_index": index,
                    "ocr_scope": "none",
                    "status": "pending",
                    "error": "",
                }
                for index in range(len(pages))
                ]
            selected = plan_pages(len(pages), job.get("vlm_pages", "all"), int(job.get("vlm_max_pages", 0) or 0))
            task = job.get("vlm_task", "full_ocr")
            if task == "metadata":
                for index, state in enumerate(document["pages"]):
                    if index not in selected:
                        state["status"] = "skipped"
            passes = [(index, "full_ocr") for index in range(len(pages))] if task == "full_ocr" else []
            passes += [(index, "metadata") for index in selected]
            for index, pass_task in passes:
                if cancelled(store, job_id):
                    return store.update(job_id, documents=documents)
                state = document["pages"][index]
                state["ocr_scope"] = pass_task if state["ocr_scope"] == "none" else f'{state["ocr_scope"]}+{pass_task}'
                try:
                    result = await request_page(
                        pages[index].read_bytes(),
                        base_url=os.getenv("OCR_BASE_URL", ""),
                        api_key=os.getenv("OCR_API_KEY", ""),
                        model=job.get("model", ""),
                        timeout=float(os.getenv("OCR_TIMEOUT_SECONDS", "120")),
                        page_index=index,
                        task=pass_task,
                    )
                    if pass_task == "full_ocr":
                        state["text"] = result["text"]
                        state["ocr_line_count"] = len(result["text"].splitlines())
                    else:
                        for name, field in result["fields"].items():
                            current = document["fields"].get(name)
                            if current is None or (field.get("confidence") or -1) > (current.get("confidence") or -1):
                                document["fields"][name] = field
                    warning = next(iter(result.get("warnings", [])), "")
                    state["error"] = state["error"] or warning
                    state["status"] = "completed_with_warnings" if state["error"] else "completed"
                except Exception as exc:
                    state["error"] = safe_error(exc)
                    state["status"] = "completed_with_warnings" if state.get("text") else "error"
                persist()
            if cancelled(store, job_id):
                return store.update(job_id, documents=documents)
            document["errors"] = list(dict.fromkeys(page["error"] for page in document["pages"] if page.get("error")))
            usable = any(page.get("status") in {"completed", "completed_with_warnings"} for page in document["pages"])
            if usable:
                document["status"] = "completed_with_warnings" if document["errors"] else "completed"
                successes += 1
            else:
                document.update(status="error", error="invalid_model_json")
        except Exception as exc:
            document.update(status="error", error=safe_error(exc))
        persist()
    failures = sum(bool(page.get("error")) for item in documents for page in item.get("pages", []))
    status = "completed" if successes and not failures else "completed_with_warnings" if successes else "error"
    return store.update(
        job_id, status=status, documents=documents, report_url=f"/jobs/{job_id}", completed_at=now(),
        dossier_cover_count=sum(item.get("logical_document_type") == "dossier_cover" for item in documents),
        administrative_document_count=sum(item.get("logical_document_type") == "administrative_document" for item in documents),
    )


@celery_app.task(name="ocr.process_job")
def process_job(job_id: str) -> dict:
    try:
        return asyncio.run(process_job_async(job_id))
    except Exception as exc:
        store = JobStore(os.getenv("OCR_DATA_DIR", "data/jobs"))
        try:
            if store.read(job_id).get("status") in ACTIVE:
                return store.update(job_id, status="error", error=safe_error(exc), completed_at=now())
            return store.read(job_id)
        except (FileNotFoundError, ValueError):
            return {"id": job_id, "status": "error", "error": "ocr_failed"}


def dispatch(job_id: str) -> None:
    if celery_app.conf.task_always_eager:
        Thread(target=process_job.delay, args=(job_id,), daemon=True).start()
    else:
        process_job.delay(job_id)


def reconcile_interrupted() -> None:
    store = JobStore(os.getenv("OCR_DATA_DIR", "data/jobs"))
    for job in store.list():
        if job.get("status") in ACTIVE:
            store.interrupt(job["id"])


@worker_ready.connect
def reconcile_on_worker_start(**_: object) -> None:
    reconcile_interrupted()
