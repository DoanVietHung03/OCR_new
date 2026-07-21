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


async def process_job_async(job_id: str) -> dict:
    store = JobStore(os.getenv("OCR_DATA_DIR", "data/jobs"))
    job = store.read(job_id)
    if job.get("status") != "starting":
        return job
    store.update(job_id, status="queued")
    if cancelled(store, job_id):
        return store.read(job_id)
    job = store.update(job_id, status="running", error=None, started_at=job.get("started_at") or now())
    documents: list[dict] = []
    successes = failures = page_count = 0
    for pdf in sorted((store.path(job_id) / "uploads").glob("*.pdf")):
        document = {
            "id": pdf.stem,
            "file_name": pdf.name,
            "status": "processing",
            "fields": {},
            "pages": [],
        }
        documents.append(document)
        try:
            pages = render_pdf(pdf, store.path(job_id) / "artifacts" / pdf.stem)
            document["pages"] = [
                {
                    "page_index": index,
                    "image_url": f"/api/jobs/{job_id}/artifacts/{pdf.stem}/page-{index + 1}.png",
                }
                for index in range(len(pages))
            ]
            page_successes = 0
            for page in pages:
                if cancelled(store, job_id):
                    return store.update(job_id, documents=documents)
                try:
                    result = await request_page(
                        page.read_bytes(),
                        base_url=os.getenv("OCR_BASE_URL", ""),
                        api_key=os.getenv("OCR_API_KEY", ""),
                        model=job.get("model", ""),
                        timeout=float(os.getenv("OCR_TIMEOUT_SECONDS", "120")),
                    )
                    for name, field in result["fields"].items():
                        current = document["fields"].get(name)
                        if current is None or float(field.get("confidence", 0)) > float(current.get("confidence", 0)):
                            document["fields"][name] = field
                    page_successes += 1
                except Exception as exc:
                    failures += 1
                    document.setdefault("errors", []).append(safe_error(exc))
                page_count += 1
                store.update(
                    job_id,
                    page_count=page_count,
                    failed_pages=failures,
                    documents=documents,
                )
            if cancelled(store, job_id):
                return store.update(job_id, documents=documents)
            if page_successes:
                document["status"] = "completed_with_warnings" if document.get("errors") else "completed"
                successes += 1
            else:
                document.update(status="error", error="invalid_model_json")
        except Exception as exc:
            failures += 1
            document.update(status="error", error=safe_error(exc))
        store.update(job_id, documents=documents, failed_pages=failures)
    status = "completed" if successes and not failures else "completed_with_warnings" if successes else "error"
    return store.update(job_id, status=status, documents=documents, report_url=f"/jobs/{job_id}", completed_at=now())


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
