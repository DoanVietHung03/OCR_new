from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse

from ..schemas.jobs import (
    CorrectionResponse,
    CorrectionRequest,
    CreateJobRequest,
    CropEvidence,
    DeletePreviewResponse,
    DeleteResponse,
    EngineCheckResponse,
    EnginesResponse,
    JobIdsRequest,
    JobResponse,
    ManualCropRequest,
    StateResponse,
    SystemMetricsResponse,
    UploadResponse,
)
from ..services.jobs import DELETABLE, MAX_BYTES, MAX_FILES, TERMINAL, JobStore, now
from ..services.ocr_runner import PROMPT_VERSION, configured
from ..settings import settings

router = APIRouter()
store = JobStore(settings.ocr_data_dir)


def fail(status: int, code: str) -> None:
    raise HTTPException(status_code=status, detail={"code": code, "message": code})


def job_or_404(job_id: str) -> dict:
    try:
        return store.read(job_id)
    except (FileNotFoundError, ValueError):
        fail(404, "not_found")


def public_job(job: dict) -> dict:
    return {**job, "logs": job.get("logs", [])[-200:]}


def engines() -> list[dict]:
    return [{
        "id": settings.ocr_provider,
        "label": settings.ocr_provider.replace("_", " ").title(),
        "external": settings.ocr_endpoint_external,
        "status": "configured" if configured(settings.ocr_base_url, settings.ocr_model) else "not_configured",
    }]


def metrics(jobs: list[dict]) -> dict:
    return {
        "total_jobs": len(jobs),
        "pages": sum(int(job.get("page_count", 0)) for job in jobs),
        "correction_count": sum(int(job.get("correction_count", 0)) for job in jobs),
        "error_jobs": sum(job.get("status") == "error" for job in jobs),
    }


@router.get("/state", response_model=StateResponse)
async def state(
    page: int = 1,
    page_size: int = Query(25, le=100),
    status: str = "all",
    method: str = "all",
    query: str = "",
):
    jobs = [
        job for job in store.list()
        if (status == "all" or job.get("status") == status)
        and (method == "all" or job.get("ocr_method") == method)
        and (not query or query.lower() in json.dumps(job, ensure_ascii=False).lower())
    ]
    offset = max(0, (page - 1) * page_size)
    return {
        "server_mode": True,
        "jobs": [public_job(job) for job in jobs[offset:offset + page_size]],
        "documents": [],
        "logs": [],
        "metrics": metrics(jobs),
        "ocr_methods": engines(),
        "limits": {"max_files_per_job": MAX_FILES, "max_job_upload_bytes": MAX_BYTES},
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": len(jobs),
            "pages": max(1, (len(jobs) + page_size - 1) // page_size),
        },
    }


@router.post("/jobs", response_model=JobResponse)
async def create_job(payload: CreateJobRequest):
    options = payload.model_dump()
    options.update(
        provider=settings.ocr_provider,
        model=settings.ocr_model,
        prompt_version=PROMPT_VERSION,
        endpoint_external=settings.ocr_endpoint_external,
    )
    try:
        return store.create(options)
    except ValueError as exc:
        fail(400, str(exc))


@router.put("/jobs/{job_id}/files", response_model=UploadResponse)
async def upload(job_id: str, request: Request, path: str = ""):
    job_or_404(job_id)
    try:
        return {"job": public_job(store.add_pdf(job_id, path, await request.body()))}
    except ValueError as exc:
        fail(400, str(exc))


@router.post("/jobs/{job_id}/start", response_model=JobResponse)
async def start(job_id: str):
    job = job_or_404(job_id)
    if job.get("status") != "ready":
        return public_job(job)
    if job["uploaded_files"] != job["expected_files"]:
        fail(409, "upload_incomplete")
    if job.get("endpoint_external", True) and not job.get("cloud_data_confirmed"):
        fail(400, "cloud_data_confirmation_required")
    if not configured(settings.ocr_base_url, settings.ocr_model):
        fail(503, "ocr_not_configured")
    try:
        job, should_dispatch = store.begin_start(job_id)
    except ValueError as exc:
        fail(409, str(exc))
    if not should_dispatch:
        return public_job(job)
    try:
        from ..workers.tasks import dispatch

        dispatch(job_id)
    except Exception:
        store.interrupt(job_id)
        fail(503, "worker_unavailable")
    return public_job(store.read(job_id))


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str):
    return public_job(job_or_404(job_id))


@router.post("/jobs/{job_id}/cancel", response_model=JobResponse)
async def cancel(job_id: str):
    try:
        return public_job(store.cancel(job_id))
    except (FileNotFoundError, ValueError):
        fail(404, "not_found")


@router.post("/jobs/{job_id}/rerun", response_model=JobResponse)
async def rerun(job_id: str, request: Request):
    source = job_or_404(job_id)
    if source.get("status") not in TERMINAL:
        fail(409, "job_active")
    options = await request.json()
    pdfs = sorted((store.path(job_id) / "uploads").glob("*.pdf"))
    if len(pdfs) != source.get("expected_files"):
        fail(409, "source_files_incomplete")
    new = store.create({
        "file_count": source["expected_files"],
        "upload_name": source.get("upload_name", ""),
        "cloud_data_confirmed": bool(options.get("cloud_data_confirmed")),
        "provider": settings.ocr_provider,
        "model": settings.ocr_model,
        "prompt_version": PROMPT_VERSION,
        "endpoint_external": settings.ocr_endpoint_external,
    })
    for pdf in pdfs:
        store.add_pdf(new["id"], pdf.name, pdf.read_bytes())
    return await start(new["id"])


@router.get("/engines", response_model=EnginesResponse)
async def get_engines():
    return {"engines": engines()}


@router.post("/engines/{engine_id}/check", response_model=EngineCheckResponse)
async def check_engine(engine_id: str):
    if engine_id not in {engine["id"] for engine in engines()}:
        fail(404, "invalid_ocr_method")
    configured_now = configured(settings.ocr_base_url, settings.ocr_model)
    return {
        "id": engine_id,
        "status": "configured" if configured_now else "not_configured",
        "summary": "Configuration is present." if configured_now else "OCR provider is not configured.",
    }


@router.post("/jobs/{job_id}/manual-crop", response_model=CropEvidence)
async def manual_crop(job_id: str, payload: ManualCropRequest):
    job = job_or_404(job_id)
    if job.get("status") not in TERMINAL:
        fail(409, "job_not_terminal")
    document = next((item for item in job.get("documents", []) if item.get("id") == payload.document_id), None)
    if document is None or payload.page_index >= len(document.get("pages", [])):
        fail(404, "not_found")
    if payload.field not in document.get("fields", {}):
        fail(400, "invalid_field")
    rect = payload.rect.model_dump()
    try:
        import fitz

        source = store.path(job_id) / "artifacts" / document["id"] / f"page-{payload.page_index + 1}.png"
        image = fitz.Pixmap(str(source))
        if rect["x"] + rect["width"] > image.width or rect["y"] + rect["height"] > image.height:
            fail(400, "invalid_crop_rectangle")
        target = source.parent / f"crop-{payload.field}-{payload.page_index + 1}-{uuid.uuid4().hex[:8]}.png"
        fitz.Pixmap(
            image,
            image.width,
            image.height,
            fitz.Rect(rect["x"], rect["y"], rect["x"] + rect["width"], rect["y"] + rect["height"]),
        ).save(str(target))
    except HTTPException:
        raise
    except Exception:
        fail(404, "not_found")
    evidence = {
        "crop_image": f"/api/jobs/{job_id}/artifacts/{document['id']}/{target.name}",
        "evidence_source": "manual_crop",
        "evidence_status": "trusted",
        "bbox": rect,
        "page_index": payload.page_index,
        "field": payload.field,
        "created_at": now(),
    }
    return store.add_crop_evidence(job_id, payload.document_id, evidence)


@router.post("/jobs/{job_id}/corrections", response_model=CorrectionResponse)
async def corrections(job_id: str, payload: CorrectionRequest):
    job_or_404(job_id)
    try:
        job, document = store.apply_review(
            job_id,
            payload.document_id,
            [item.model_dump() for item in payload.corrections],
        )
    except ValueError as exc:
        code = str(exc)
        fail(409 if code in {"correction_conflict", "job_not_terminal"} else 400, code)
    return {
        "saved_count": len(payload.corrections),
        "job": public_job(job),
        "document_status": {
            "review_status": {"value": document["review_status"], "risk_count": 0},
            "approved": True,
            "last_saved_at": document["approved_at"],
        },
    }


@router.post("/jobs/delete-preview", response_model=DeletePreviewResponse)
async def delete_preview(payload: JobIdsRequest):
    jobs = [job_or_404(job_id) for job_id in payload.job_ids]
    return {
        "deletable": [
            {"id": job["id"], "name": job.get("upload_name") or job["id"]}
            for job in jobs if job.get("status") in DELETABLE
        ],
        "skipped": [{"id": job["id"]} for job in jobs if job.get("status") not in DELETABLE],
    }


@router.post("/jobs/bulk-delete", response_model=DeleteResponse)
async def bulk_delete(payload: JobIdsRequest):
    deleted, skipped, failed = [], [], []
    for job_id in payload.job_ids:
        try:
            if store.read(job_id).get("status") not in DELETABLE:
                skipped.append(job_id)
                continue
            store.delete(job_id)
            deleted.append(job_id)
        except ValueError:
            skipped.append(job_id)
        except Exception:
            failed.append(job_id)
    return {"deleted": deleted, "skipped": skipped, "failed": failed}


@router.get("/jobs/{job_id}/artifacts/{path:path}")
async def artifact(job_id: str, path: str):
    root = store.path(job_id) / "artifacts"
    target = (root / path).resolve()
    if root.resolve() not in target.parents or not target.is_file():
        fail(404, "not_found")
    return FileResponse(target)


@router.get("/system-metrics", response_model=SystemMetricsResponse)
async def system_metrics():
    return {"cpu_percent": None, "memory_percent": None, "gpu": None}
