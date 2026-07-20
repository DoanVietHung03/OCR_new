from __future__ import annotations

import os
from pathlib import Path

from celery import Celery

from .jobs import JobStore, TERMINAL, now
from .runner import request_page

celery_app = Celery(
    "ocr",
    broker=os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0"),
    backend=os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1"),
)


def _render(pdf: Path, output: Path) -> list[Path]:
    import fitz

    output.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf)
    if len(document) > 100:
        raise ValueError("pdf_page_limit_exceeded")
    pages = []
    for index, page in enumerate(document):
        image = page.get_pixmap(matrix=fitz.Matrix(200 / 72, 200 / 72), alpha=False)
        target = output / f"page-{index + 1}.png"
        image.save(target)
        pages.append(target)
    document.close()
    return pages


@celery_app.task(name="ocr.process_job")
def process_job(job_id: str) -> dict:
    store = JobStore(os.getenv("OCR_DATA_DIR", "data/jobs"))
    store.update(job_id, status="running")
    job = store.read(job_id)
    successes = 0
    failures = 0
    documents = []
    for pdf in sorted((store.path(job_id) / "uploads").glob("*.pdf")):
        document = {"id": pdf.stem, "file_name": pdf.name, "status": "processing", "fields": {}, "pages": []}
        try:
            pages = _render(pdf, store.path(job_id) / "artifacts" / pdf.stem)
            document["pages"] = [{"page_index": i, "image_url": f"/api/jobs/{job_id}/artifacts/{pdf.stem}/page-{i + 1}.png"} for i in range(len(pages))]
            page_successes = 0
            for index, page in enumerate(pages):
                if (store.path(job_id) / "cancel").exists():
                    store.update(job_id, status="cancelled", documents=documents)
                    return store.read(job_id)
                try:
                    result = request_page(page.read_bytes(), base_url=os.getenv("OCR_BASE_URL", ""), api_key=os.getenv("OCR_API_KEY", ""), model=job.get("model") or os.getenv("OCR_MODEL", ""), timeout=float(os.getenv("OCR_TIMEOUT_SECONDS", "120")))
                    for name, field in result["fields"].items():
                        if name not in document["fields"] or float(field.get("confidence", 0)) > float(document["fields"][name].get("confidence", 0)):
                            document["fields"][name] = field
                    page_successes += 1
                except Exception as exc:
                    failures += 1
                    document.setdefault("errors", []).append(str(exc))
                store.update(job_id, page_count=sum(len(item.get("pages", [])) for item in documents) + index + 1, failed_pages=failures, documents=documents)
            if page_successes:
                document["status"] = "completed" if not document.get("errors") else "completed_with_warnings"
                successes += 1
            else:
                document["status"] = "error"
                document["error"] = "No page produced valid OCR JSON."
        except Exception as exc:
            failures += 1
            document["status"] = "error"
            document["error"] = str(exc)
        documents.append(document)
        store.update(job_id, documents=documents)
    status = "completed" if successes and not failures else "completed_with_warnings" if successes else "error"
    return store.update(job_id, status=status, documents=documents, report_url=f"/jobs/{job_id}")


def dispatch(job_id: str) -> None:
    process_job.delay(job_id)
