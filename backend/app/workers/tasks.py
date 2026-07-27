from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from threading import Event, Thread

from celery import Celery
from celery.signals import worker_ready

from ..services.field_policy import ADMIN_FIELDS, SIGNATURE_FIELDS, annotate
from ..services.jobs import ACTIVE, MAX_PAGES, JobStore, failure, now
from ..services.ocr_runner import PROMPT_VERSION, request_page
from ..services.sizing import MeasurementStore, aggregate, atomic_json, checksum, utc_now

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


class ResourceSampler:
    def __init__(self, store: JobStore, job_id: str) -> None:
        self.store, self.job_id, self.stop_event = store, job_id, Event()
        self.peak_rss = 0
        self.cpu_seconds = 0.0
        self.thread = Thread(target=self.run, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def run(self) -> None:
        try:
            import psutil
            process = psutil.Process()
            while not self.stop_event.wait(1):
                processes = [process, *process.children(recursive=True)]
                self.peak_rss = max(self.peak_rss, sum(item.memory_info().rss for item in processes if item.is_running()))
                self.cpu_seconds = sum(sum(item.cpu_times()[:2]) for item in processes if item.is_running())
        except Exception:
            pass

    def stop(self) -> None:
        self.stop_event.set()
        self.thread.join(timeout=2)
        try:
            root = self.store.path(self.job_id)
            files = [path for path in root.rglob("*") if path.is_file()]
            source_pdf_bytes = sum(path.stat().st_size for path in (root / "uploads").glob("*.pdf"))
            rendered_page_bytes = sum(path.stat().st_size for path in (root / "artifacts").rglob("page-*.png"))
            evidence_bytes = sum(path.stat().st_size for path in (root / "artifacts").rglob("field-*.png"))
            measurement_bytes = sum(path.stat().st_size for path in (root / "provider_operations").rglob("*.json"))
            total_job_bytes = sum(path.stat().st_size for path in files)
            atomic_json(root / "resource_usage.json", {
                "schema_version": 1, "scope": "worker", "measured_at": utc_now(),
                "peak_worker_rss_bytes": self.peak_rss or None,
                "worker_cpu_seconds": round(self.cpu_seconds, 3) if self.cpu_seconds else None,
                "working_disk_bytes": total_job_bytes,
                "storage": {
                    "source_pdf_bytes": source_pdf_bytes, "rendered_page_bytes": rendered_page_bytes,
                    "evidence_bytes": evidence_bytes, "report_bytes": 0,
                    "measurement_bytes": measurement_bytes,
                    "other_safe_bytes": max(0, total_job_bytes - source_pdf_bytes - rendered_page_bytes - evidence_bytes - measurement_bytes),
                    "total_job_bytes": total_job_bytes,
                },
            })
        except (OSError, ValueError):
            pass


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


def crop_field_evidence(image: Path, bbox: list[float], output: Path) -> bool:
    import fitz

    if len(bbox) != 4:
        return False
    try:
        source = fitz.Pixmap(image)
        x0, y0, x1, y1 = (
            round(bbox[0] * source.width),
            round(bbox[1] * source.height),
            round(bbox[2] * source.width),
            round(bbox[3] * source.height),
        )
        pad_x, pad_y = max(6, round((x1 - x0) * 0.08)), max(6, round((y1 - y0) * 0.16))
        clip = fitz.IRect(max(0, x0 - pad_x), max(0, y0 - pad_y), min(source.width, x1 + pad_x), min(source.height, y1 + pad_y))
        if clip.width < 2 or clip.height < 2:
            return False
        crop = fitz.Pixmap(source, source.width, source.height, clip)
        channels = crop.n
        dark = sum(
            min(crop.samples[offset:offset + min(3, channels)]) < 210
            for offset in range(0, len(crop.samples), channels)
        )
        if dark / (crop.width * crop.height) < 0.01:
            return False
        crop.save(output)
        return True
    except (OSError, RuntimeError, ValueError):
        return False


def cancelled(store: JobStore, job_id: str) -> bool:
    if not (store.path(job_id) / "cancel").exists():
        return False
    store.update(job_id, status="cancelled", error=None, failure=None, progress_stage="cancelled", completed_at=now())
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
    measurements = MeasurementStore(store.root)
    job = store.update(job["id"], status="segmenting", error=None, failure=None, progress_stage="segmenting")
    sources = job.get("source_pdfs", [])
    rendered = {}
    for source in sources:
        if cancelled(store, job["id"]):
            return store.read(job["id"])
        rendered[source["id"]] = render_pdf(store.path(job["id"]) / "uploads" / source["file_name"], store.path(job["id"]) / "artifacts" / source["id"])
    total = sum(map(len, rendered.values()))
    completed = 0
    first_source_id = min(sources, key=lambda item: item["file_name"].casefold())["id"] if len(sources) > 1 else None
    store.update(job["id"], segmentation_total_pages=total, total_pages=total, completed_pages=0)
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
            elif first_source_id:
                classification = "cover" if source["id"] == first_source_id else "document_start" if page_index == 0 else "continuation"
            else:
                try:
                    result = await request_page(
                        image.read_bytes(), base_url=os.getenv("OCR_BASE_URL", ""), api_key=os.getenv("OCR_API_KEY", ""),
                        model=job.get("model", ""), timeout=float(os.getenv("OCR_TIMEOUT_SECONDS", "120")),
                        page_index=page_index, task="segmentation",
                        measurement_store=measurements,
                        measurement_context={
                            "job_id": job["id"], "provider_profile_id": job.get("provider_profile_id"),
                            "provider_config_version": os.getenv("OCR_PROVIDER_CONFIG_VERSION", "default"),
                            "model": job.get("model", ""), "task": "segmentation",
                            "processing_mode": job.get("processing_mode"), "source_pdf_id": source["id"],
                            "document_id": None, "page_index": page_index,
                            "segmentation_revision": source.get("revision"),
                            "measurement_fingerprint": checksum({
                                "provider_profile_id": job.get("provider_profile_id"), "model": job.get("model", ""),
                                "task": "segmentation", "processing_mode": job.get("processing_mode"),
                                "dpi": 200, "prompt_version": PROMPT_VERSION,
                                "provider_config_version": os.getenv("OCR_PROVIDER_CONFIG_VERSION", "default"),
                            }),
                        },
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
            store.update(job["id"], source_pdfs=sources, segmentation_completed_pages=completed, completed_pages=completed)
        if not reused:
            source["proposal"] = propose_segments(source["pages"])
            source["revision"] = int(source.get("revision", 0)) + 1
        store.update(job["id"], source_pdfs=sources)
        store.add_event(job["id"], "segmentation_proposed", source_pdf_id=source["id"], revision=source["revision"])
    return store.update(job["id"], status="awaiting_segmentation_review", source_pdfs=sources, progress_stage="awaiting_review")


async def process_job_async(job_id: str) -> dict:
    store = JobStore(os.getenv("OCR_DATA_DIR", "data/jobs"))
    measurements = MeasurementStore(store.root)
    job = store.read(job_id)
    if job.get("status") == "cancelling" and cancelled(store, job_id):
        return store.read(job_id)
    if job.get("status") not in {"starting", "extraction_starting"}:
        return job
    if job.get("processing_mode") == "combined_dossier" and job.get("status") == "starting":
        return await segment_job(store, job)
    extracting = job.get("status") == "extraction_starting"
    store.update(job_id, status="queued")
    if cancelled(store, job_id):
        return store.read(job_id)
    job = store.update(job_id, status="running", error=None, failure=None, progress_stage="extracting", started_at=job.get("started_at") or now())
    documents: list[dict] = job.get("documents", []) if extracting else []
    successes = 0

    def persist() -> None:
        pages = [page for item in documents for page in item.get("pages", [])]
        store.update(job_id, page_count=len(pages), failed_pages=sum(page.get("status") == "error" for page in pages), documents=documents)

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
            document = annotate({"id": pdf.stem, "file_name": pdf.name, "status": "processing", "fields": {}, "pages": [], "logical_document_type": logical_type, "source_pdf_id": source["id"]})
            documents.append(document)
            work.append((document, images))
        store.update(job_id, source_pdfs=job.get("source_pdfs", []))
    task = job.get("vlm_task", "full_ocr")
    page_mode = job.get("vlm_pages", "all")
    max_pages = int(job.get("vlm_max_pages", 0) or 0)
    total = sum(
        (len(pages) if task == "full_ocr" else 0)
        + (
            min(1, len(pages))
            if document.get("logical_document_type") == "administrative_document" and page_mode == "auto"
            else len(plan_pages(len(pages), page_mode, max_pages))
        )
        for document, pages in work
    )
    completed = 0
    store.update(job_id, completed_pages=0, total_pages=total)
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
                    "warnings": [],
                }
                for index in range(len(pages))
                ]
            adaptive = document.get("logical_document_type") == "administrative_document" and page_mode == "auto"

            def apply_fields(index: int, fields: dict, allowed: tuple[str, ...] | None = None) -> None:
                state = document["pages"][index]
                for name, field in fields.items():
                    if allowed is not None and name not in allowed:
                        continue
                    current = document["fields"].get(name)
                    if current is not None and (field.get("confidence") or -1) <= (current.get("confidence") or -1):
                        continue
                    evidence_name = f"field-{name}-page-{index + 1}.png"
                    if crop_field_evidence(pages[index], field.get("bbox", []), pages[index].with_name(evidence_name)):
                        if current and current.get("evidence_url"):
                            old_name = Path(current["evidence_url"]).name
                            if old_name != evidence_name:
                                (pages[index].parent / old_name).unlink(missing_ok=True)
                        field.update(
                            evidence_url=f"{state['image_url'].rsplit('/', 1)[0]}/{evidence_name}",
                            evidence_source="provider_bbox",
                            evidence_status="available",
                        )
                    else:
                        validation_warning = field.get("review_reason") == "validation_warning"
                        evidence_reason = field.get("evidence_reason") or (
                            "crop_blank" if len(field.get("bbox", [])) == 4 else "bbox_missing"
                        )
                        field.update(
                            confidence=None, raw_confidence=field.get("confidence"), bbox=[],
                            needs_review=True, evidence_status="unavailable",
                        )
                        if not validation_warning:
                            field.update(
                                review_reason="missing_evidence",
                                evidence_reason=evidence_reason,
                            )
                        if current is not None:
                            continue
                    document["fields"][name] = field

            async def run_pass(
                index: int, pass_task: str, expected_fields: tuple[str, ...], *, extra: bool = False,
            ) -> dict | None:
                nonlocal completed, total
                if extra:
                    total += 1
                    store.update(job_id, total_pages=total)
                if cancelled(store, job_id):
                    return None
                state = document["pages"][index]
                state.setdefault("warnings", [])
                state["ocr_scope"] = pass_task if state["ocr_scope"] == "none" else f'{state["ocr_scope"]}+{pass_task}'
                pass_error = ""
                warning_codes: list[str] = []
                pass_started = time.monotonic()
                try:
                    result = await request_page(
                        pages[index].read_bytes(),
                        base_url=os.getenv("OCR_BASE_URL", ""),
                        api_key=os.getenv("OCR_API_KEY", ""),
                        model=job.get("model", ""),
                        timeout=float(os.getenv("OCR_TIMEOUT_SECONDS", "120")),
                        page_index=index,
                        task=pass_task,
                        expected_fields=expected_fields,
                        ocr_text=state.get("text", "") if pass_task == "metadata" else "",
                        measurement_store=measurements,
                        measurement_context={
                            "job_id": job_id, "provider_profile_id": job.get("provider_profile_id"),
                            "provider_config_version": os.getenv("OCR_PROVIDER_CONFIG_VERSION", "default"),
                            "model": job.get("model", ""), "task": pass_task,
                            "processing_mode": job.get("processing_mode"),
                            "source_pdf_id": document.get("source_pdf_id"),
                            "document_id": document["id"], "page_index": index,
                            "segmentation_revision": next((
                                source.get("revision") for source in job.get("source_pdfs", [])
                                if source.get("id") == document.get("source_pdf_id")
                            ), None),
                            "measurement_fingerprint": checksum({
                                "provider_profile_id": job.get("provider_profile_id"), "model": job.get("model", ""),
                                "task": pass_task, "processing_mode": job.get("processing_mode"),
                                "page_scope": page_mode, "vlm_max_pages": max_pages, "dpi": 200,
                                "prompt_version": PROMPT_VERSION,
                                "provider_config_version": os.getenv("OCR_PROVIDER_CONFIG_VERSION", "default"),
                            }),
                        },
                    )
                    if pass_task == "full_ocr":
                        state["text"] = result["text"]
                        state["ocr_line_count"] = len(result["text"].splitlines())
                    warning_codes = list(dict.fromkeys(
                        warning for warning in result.get("warnings", [])
                        if warning in {"unknown_field", "incomplete_field", "invalid_field_value"}
                    ))
                    state["warnings"] = list(dict.fromkeys([*state["warnings"], *warning_codes]))
                    pass_error = next(iter(warning_codes), "")
                    state["error"] = state["error"] or pass_error
                    state["status"] = "completed_with_warnings" if state["error"] else "completed"
                except Exception as exc:
                    pass_error = safe_error(exc)
                    warning_codes = [pass_error]
                    state["error"] = pass_error
                    state["status"] = "completed_with_warnings" if state.get("text") else "error"
                completed += 1
                store.add_event(
                    job_id,
                    "page_pass_failed" if pass_error else "page_pass_completed",
                    category="document",
                    severity="warning" if pass_error else "info",
                    document_id=document["id"],
                    page_index=index,
                    ocr_pass=pass_task,
                    duration_seconds=round(time.monotonic() - pass_started, 3),
                    warning_codes=warning_codes,
                )
                store.update(job_id, completed_pages=completed, progress_detail=pass_task)
                persist()
                return result if not pass_error or pass_task == "metadata" else None

            expected = tuple(document.get("expected_fields", ()))
            if task == "full_ocr":
                for index in range(len(pages)):
                    await run_pass(index, "full_ocr", expected)
                    if cancelled(store, job_id):
                        return store.update(job_id, documents=documents)

            if adaptive and pages:
                first = await run_pass(0, "metadata", ADMIN_FIELDS)
                if first:
                    apply_fields(0, first.get("fields", {}), tuple(name for name in ADMIN_FIELDS if name not in SIGNATURE_FIELDS))
                best_index, best_fields = 0, {
                    name: field for name, field in (first or {}).get("fields", {}).items()
                    if name in SIGNATURE_FIELDS
                }
                candidates = list(reversed(range(1, len(pages))))
                if max_pages:
                    candidates = candidates[:max(0, max_pages - 1)]
                complete = all(best_fields.get(name, {}).get("value") not in (None, "") for name in ("chuc_vu_nguoi_ky", "nguoi_ky"))
                for index in candidates:
                    if complete:
                        break
                    candidate = await run_pass(index, "metadata", SIGNATURE_FIELDS, extra=True)
                    candidate_fields = (candidate or {}).get("fields", {})
                    if sum(name in candidate_fields for name in SIGNATURE_FIELDS) > sum(name in best_fields for name in SIGNATURE_FIELDS):
                        best_index, best_fields = index, candidate_fields
                    complete = all(candidate_fields.get(name, {}).get("value") not in (None, "") for name in ("chuc_vu_nguoi_ky", "nguoi_ky"))
                    if complete:
                        best_index, best_fields = index, candidate_fields
                apply_fields(best_index, best_fields, SIGNATURE_FIELDS)
            else:
                for index in plan_pages(len(pages), page_mode, max_pages):
                    result = await run_pass(index, "metadata", expected)
                    if result:
                        apply_fields(index, result.get("fields", {}))

            if task == "metadata":
                for state in document["pages"]:
                    if state["status"] == "pending":
                        state["status"] = "skipped"
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
        annotate(document)
        persist()
    failures = sum(page.get("status") == "error" for item in documents for page in item.get("pages", []))
    warnings = any(page.get("status") == "completed_with_warnings" for item in documents for page in item.get("pages", []))
    status = "completed" if successes and not failures and not warnings else "completed_with_warnings" if successes else "error"
    first_failure = next((page for item in documents for page in item.get("pages", []) if page.get("status") == "error"), None)
    store.add_event(job_id, "job_completed", severity="error" if status == "error" else "warning" if warnings else "info")
    resource_usage = aggregate(measurements.operations(job_id=job_id), sample_count=1)
    return store.update(
        job_id, status=status, documents=documents, report_url=None, completed_at=now(),
        progress_stage="failed" if status == "error" else "completed",
        failure=failure(first_failure["error"], first_failure.get("page_index")) if status == "error" and first_failure else None,
        dossier_cover_count=sum(item.get("logical_document_type") == "dossier_cover" for item in documents),
        administrative_document_count=sum(item.get("logical_document_type") == "administrative_document" for item in documents),
        resource_usage=resource_usage,
    )


@celery_app.task(name="ocr.process_job")
def process_job(job_id: str) -> dict:
    store = JobStore(os.getenv("OCR_DATA_DIR", "data/jobs"))
    sampler = ResourceSampler(store, job_id)
    sampler.start()
    try:
        return asyncio.run(process_job_async(job_id))
    except Exception as exc:
        try:
            if store.read(job_id).get("status") in ACTIVE:
                code = safe_error(exc)
                return store.update(job_id, status="error", error=code, failure=failure(code), progress_stage="failed", completed_at=now())
            return store.read(job_id)
        except (FileNotFoundError, ValueError):
            return {"id": job_id, "status": "error", "error": "ocr_failed"}
    finally:
        sampler.stop()


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
