from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import FileResponse

from ..schemas.jobs import (
    CorrectionResponse,
    CorrectionRequest,
    ArtifactsResponse,
    CodeCatalogResponse,
    CodeInput,
    CodeUpdate,
    ConfirmSegmentationRequest,
    CreateJobRequest,
    CropEvidence,
    DeletePreviewResponse,
    DeleteResponse,
    DocumentsResponse,
    EngineCheckResponse,
    EnginesResponse,
    EventsResponse,
    JobIdsRequest,
    JobResponse,
    ManualCropRequest,
    ProviderProfilesResponse,
    ReportsResponse,
    RerunRequest,
    StateResponse,
    SystemMetricsResponse,
    UploadResponse,
)
from ..services.codes import CodeCatalog
from ..services.jobs import DELETABLE, MAX_BYTES, MAX_FILES, TERMINAL, JobStore, now
from ..services.ocr_runner import PROMPT_VERSION, configured
from ..services.system_metrics import system_metrics as read_system_metrics
from ..settings import settings

router = APIRouter()
store = JobStore(settings.ocr_data_dir)
codes = CodeCatalog(settings.ocr_data_dir)


def fail(status: int, code: str) -> None:
    raise HTTPException(status_code=status, detail={"code": code, "message": code})


def job_or_404(job_id: str) -> dict:
    try:
        return store.read(job_id)
    except (FileNotFoundError, ValueError):
        fail(404, "not_found")


def public_job(job: dict) -> dict:
    return {**job, "logs": safe_events([job])[-200:]}


def confidence_average(documents: list[dict]) -> float | None:
    values = [
        float(field["confidence"])
        for document in documents
        for field in document.get("fields", {}).values()
        if isinstance(field, dict) and isinstance(field.get("confidence"), (int, float))
    ]
    return round(sum(values) / len(values), 3) if values else None


def scalar_field(document: dict, *names: str) -> str | None:
    fields = document.get("fields", {})
    for name in names:
        field = fields.get(name) if isinstance(fields, dict) else None
        value = field.get("value") if isinstance(field, dict) else None
        if isinstance(value, (str, int, float, bool)) and str(value).strip():
            return str(value)[:200]
    return None


def elapsed_seconds(job: dict) -> float | None:
    try:
        value = (datetime.fromisoformat(str(job["completed_at"])) - datetime.fromisoformat(str(job["started_at"]))).total_seconds()
        return value if value >= 0 else None
    except (KeyError, TypeError, ValueError):
        return None


def safe_events(jobs: list[dict]) -> list[dict]:
    events = []
    for job in jobs:
        first = len(events)
        job_id = str(job.get("id", ""))
        if job.get("created_at"):
            events.append({
                "timestamp": job["created_at"], "severity": "info", "category": "lifecycle",
                "code": "job_created", "job_id": job_id, "message": "job_created",
            })
        current = str(job.get("status", ""))
        if current and current != "uploading" and job.get("updated_at"):
            severity = "error" if current in {"error", "interrupted"} else "warning" if current == "completed_with_warnings" else "info"
            raw_code = str(job.get("error", ""))
            code = raw_code if severity == "error" and re.fullmatch(r"[a-z][a-z0-9_]{1,63}", raw_code) else f"job_{current}"
            events.append({
                "timestamp": job["updated_at"], "severity": severity, "category": "lifecycle",
                "code": code, "job_id": job_id, "message": code,
            })
        for document in job.get("documents", []):
            if not isinstance(document, dict):
                continue
            document_id = str(document.get("id", "")) or None
            if document.get("approved_at"):
                events.append({
                    "timestamp": str(document["approved_at"]), "severity": "info", "category": "review",
                    "code": "document_approved", "job_id": job_id, "document_id": document_id,
                    "message": "document_approved",
                })
            for evidence in document.get("crop_evidence", []):
                if isinstance(evidence, dict) and evidence.get("created_at"):
                    events.append({
                        "timestamp": str(evidence["created_at"]), "severity": "info", "category": "review",
                        "code": "manual_crop_created", "job_id": job_id, "document_id": document_id,
                        "page_index": evidence.get("page_index"), "message": "manual_crop_created",
                    })
        for item in job.get("events", []):
            if isinstance(item, dict) and item.get("code") in {"segmentation_proposed", "segmentation_confirmed", "extraction_dispatched"}:
                events.append({
                    "timestamp": str(item.get("timestamp", "")), "severity": "info", "category": "lifecycle",
                    "code": item["code"], "job_id": job_id, "message": item["code"],
                    "source_pdf_id": item.get("source_pdf_id"), "revision": item.get("revision"),
                })
        profile_id = str(job.get("provider_profile_id") or job.get("provider") or job.get("ocr_method") or "") or None
        for event in events[first:]:
            event["provider_profile_id"] = profile_id
    return sorted(events, key=lambda event: event["timestamp"], reverse=True)


def paginated(items: list[dict], page: int, page_size: int) -> dict:
    offset = max(0, (page - 1) * page_size)
    return {
        "items": items[offset:offset + page_size],
        "pagination": {"page": page, "page_size": page_size, "total": len(items),
                       "pages": max(1, (len(items) + page_size - 1) // page_size)},
    }


def provider_profiles() -> list[dict]:
    return [{
        "id": settings.ocr_provider,
        "label": settings.ocr_provider.replace("_", " ").title(),
        "external": settings.ocr_endpoint_external,
        "status": "configured" if configured(settings.ocr_base_url, settings.ocr_model) else "not_configured",
        "tasks": ["full_ocr", "metadata"],
        "page_modes": ["all", "auto", "first,last"],
        "max_pages": 100,
        "processing_modes": ["administrative_document", "dossier_cover", "combined_dossier"],
    }]


def engines() -> list[dict]:
    return provider_profiles()


def metrics(jobs: list[dict]) -> dict:
    return {
        "total_jobs": len(jobs),
        "active_jobs": sum(job.get("status") in {"starting", "queued", "running", "cancelling"} for job in jobs),
        "completed_jobs": sum(job.get("status") in {"completed", "completed_with_warnings"} for job in jobs),
        "documents": sum(len(job.get("documents", [])) for job in jobs),
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
    sort: str = Query("created_desc", pattern=r"^(created_desc|created_asc|updated_desc|updated_asc)$"),
):
    jobs = [
        job for job in store.list()
        if (status == "all" or job.get("status") == status)
        and (method == "all" or job.get("ocr_method") == method)
        and (not query or query.lower() in json.dumps(job, ensure_ascii=False).lower())
    ]
    key = "updated_at" if sort.startswith("updated") else "created_at"
    jobs.sort(key=lambda job: str(job.get(key, "")), reverse=sort.endswith("desc"))
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
    profile_id = payload.provider_profile_id or settings.ocr_provider
    if profile_id not in {profile["id"] for profile in provider_profiles()}:
        fail(400, "invalid_provider_profile")
    options.update(
        provider_profile_id=profile_id,
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


def dispatch_extraction(job_id: str) -> dict:
    if not configured(settings.ocr_base_url, settings.ocr_model):
        return store.read(job_id)
    job, should_dispatch = store.begin_extraction(job_id)
    if not should_dispatch:
        return job
    try:
        from ..workers.tasks import dispatch

        dispatch(job_id)
        store.add_event(job_id, "extraction_dispatched")
    except Exception:
        store.update(job_id, status="segmentation_confirmed")
        fail(503, "worker_unavailable")
    return store.read(job_id)


@router.post("/jobs/{job_id}/source-pdfs/{source_pdf_id}/segmentation/confirm", response_model=JobResponse)
async def confirm_segmentation(job_id: str, source_pdf_id: str, payload: ConfirmSegmentationRequest):
    try:
        job = store.confirm_segmentation(job_id, source_pdf_id, payload.revision, [item.model_dump() for item in payload.segments])
        store.add_event(job_id, "segmentation_confirmed", source_pdf_id=source_pdf_id, revision=payload.revision + 1)
    except FileNotFoundError:
        fail(404, "not_found")
    except ValueError as exc:
        fail(409, str(exc))
    return public_job(dispatch_extraction(job_id) if job.get("status") == "segmentation_confirmed" else job)


@router.post("/jobs/{job_id}/continue", response_model=JobResponse)
async def continue_job(job_id: str):
    job = job_or_404(job_id)
    if job.get("status") != "segmentation_confirmed":
        fail(409, "segmentation_not_confirmed")
    if not configured(settings.ocr_base_url, settings.ocr_model):
        fail(503, "ocr_not_configured")
    return public_job(dispatch_extraction(job_id))


@router.post("/jobs/{job_id}/cancel", response_model=JobResponse)
async def cancel(job_id: str):
    try:
        return public_job(store.cancel(job_id))
    except (FileNotFoundError, ValueError):
        fail(404, "not_found")


@router.post("/jobs/{job_id}/rerun", response_model=JobResponse)
async def rerun(job_id: str, payload: RerunRequest):
    source = job_or_404(job_id)
    if source.get("status") not in TERMINAL:
        fail(409, "job_active")
    pdfs = sorted((store.path(job_id) / "uploads").glob("*.pdf"))
    if len(pdfs) != source.get("expected_files"):
        fail(409, "source_files_incomplete")
    if source.get("provider_profile_id") not in {profile["id"] for profile in provider_profiles()}:
        fail(409, "provider_profile_unavailable")
    reuse = source.get("processing_mode") == "combined_dossier" and payload.rerun_mode == "reuse_segmentation" and all(
        item.get("confirmed_segments") for item in source.get("source_pdfs", [])
    )
    new = store.create({
        "file_count": source["expected_files"],
        "upload_name": source.get("upload_name", ""),
        "cloud_data_confirmed": payload.cloud_data_confirmed,
        "provider_profile_id": source.get("provider_profile_id"),
        "provider": source.get("provider", settings.ocr_provider),
        "model": settings.ocr_model,
        "prompt_version": PROMPT_VERSION,
        "endpoint_external": settings.ocr_endpoint_external,
        "processing_mode": source.get("processing_mode", "administrative_document"),
        "vlm_task": source.get("vlm_task", "full_ocr"),
        "vlm_pages": source.get("vlm_pages", "all"),
        "vlm_max_pages": source.get("vlm_max_pages", 0),
        "reuse_segmentation": reuse,
    })
    for pdf in pdfs:
        store.add_pdf(new["id"], pdf.name, pdf.read_bytes())
    if reuse:
        rerun_sources = store.read(new["id"])["source_pdfs"]
        for target, original in zip(rerun_sources, source["source_pdfs"], strict=True):
            target.update(proposal=original["confirmed_segments"], revision=1)
        store.update(new["id"], source_pdfs=rerun_sources, reuse_segmentation=True)
    return await start(new["id"])


@router.get("/engines", response_model=EnginesResponse)
async def get_engines():
    return {"engines": engines()}


@router.get("/provider-profiles", response_model=ProviderProfilesResponse)
async def get_provider_profiles():
    return {"profiles": provider_profiles()}


@router.get("/documents", response_model=DocumentsResponse)
async def get_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    query: str = "",
    review_status: str = "all",
    sort: str = Query("updated_desc", pattern=r"^(updated_desc|updated_asc|name_asc|name_desc)$"),
):
    # ponytail: O(n) filesystem projection; add an index only after measured scale requires one.
    items = []
    for job in store.list():
        for document in job.get("documents", []):
            errors = document.get("errors")
            warning_count = len(errors) if isinstance(errors, list) else int(bool(errors))
            warning_count += int(bool(document.get("error")))
            item = {
                "id": str(document.get("id", "")), "job_id": job["id"],
                "job_status": str(job.get("status", "")), "file_name": str(document.get("file_name", "")),
                "status": str(document.get("status", "")), "review_status": document.get("review_status"),
                "page_count": len(document.get("pages", [])), "confidence_average": confidence_average([document]),
                "document_type": scalar_field(document, "document_type", "loai_van_ban"),
                "warning_count": warning_count,
                "updated_at": str(job.get("updated_at", "")),
                "deep_link": f"/jobs/{job['id']}?document={quote(str(document.get('id', '')), safe='')}&view=review",
            }
            searchable = f"{item['file_name']} {item['id']} {item['job_id']}".lower()
            review_matches = review_status == "all" or item["review_status"] == review_status or (review_status == "unreviewed" and item["review_status"] != "approved")
            if (not query or query.lower() in searchable) and review_matches:
                items.append(item)
    key = "file_name" if sort.startswith("name") else "updated_at"
    items.sort(key=lambda item: str(item[key]).lower(), reverse=sort.endswith("desc"))
    return paginated(items, page, page_size)


@router.get("/events", response_model=EventsResponse)
async def get_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    job_id: str | None = None,
    severity: str = "all",
    category: str = "all",
    code: str = "",
    provider_profile_id: str | None = None,
    document_id: str | None = None,
    page_index: int | None = Query(None, ge=0),
):
    jobs = store.list()
    if job_id:
        jobs = [job for job in jobs if job.get("id") == job_id]
    events = [
        event for event in safe_events(jobs)
        if (severity == "all" or event["severity"] == severity)
        and (category == "all" or event["category"] == category)
        and (not code or event["code"] == code)
        and (provider_profile_id is None or event.get("provider_profile_id") == provider_profile_id)
        and (document_id is None or event.get("document_id") == document_id)
        and (page_index is None or event.get("page_index") == page_index)
    ]
    return paginated(events, page, page_size)


@router.get("/reports", response_model=ReportsResponse)
async def get_reports():
    jobs = store.list()
    documents = [document for job in jobs for document in job.get("documents", [])]
    timed_jobs = [(job, duration) for job in jobs if (duration := elapsed_seconds(job)) is not None]
    durations = [duration for _, duration in timed_jobs]
    timed_pages = sum(int(job.get("page_count", 0)) for job, _ in timed_jobs)
    total_seconds = sum(durations)
    failures: dict[str, int] = {}
    error_values = [job.get("error") for job in jobs] + [document.get("error") for document in documents]
    for document in documents:
        if isinstance(document.get("errors"), list):
            error_values.extend(document["errors"])
    for value in error_values:
        if isinstance(value, str) and re.fullmatch(r"[a-z][a-z0-9_]{1,63}", value):
            failures[value] = failures.get(value, 0) + 1
    fields = [field for document in documents for field in document.get("fields", {}).values() if isinstance(field, dict)]
    confidence_fields = sum(isinstance(field.get("confidence"), (int, float)) for field in fields)
    evidence_fields = sum(
        bool(field.get("evidence_candidates") or field.get("evidence_source") or field.get("crop_image") or field.get("decision_crop_image"))
        or any(isinstance(evidence, dict) and evidence.get("field") == name for evidence in document.get("crop_evidence", []))
        for document in documents for name, field in document.get("fields", {}).items() if isinstance(field, dict)
    )
    return {
        "operations": {
            "total_jobs": len(jobs),
            "active_jobs": sum(job.get("status") in {"starting", "queued", "running", "cancelling"} for job in jobs),
            "completed_jobs": sum(job.get("status") in {"completed", "completed_with_warnings"} for job in jobs),
            "error_jobs": sum(job.get("status") in {"error", "interrupted"} for job in jobs),
            "documents": len(documents),
            "pages": sum(int(job.get("page_count", 0)) for job in jobs),
            "duration_seconds_average": round(sum(durations) / len(durations), 3) if durations else None,
            "pages_per_minute": round(timed_pages * 60 / total_seconds, 3) if total_seconds else None,
            "failure_codes": failures,
        },
        "quality": {
            "documents": len(documents),
            "approved_documents": sum(document.get("review_status") == "approved" for document in documents),
            "corrected_fields": sum(int(job.get("correction_count", 0)) for job in jobs),
            "confidence_average": confidence_average(documents),
            "total_fields": len(fields),
            "confidence_coverage": round(confidence_fields / len(fields), 3) if fields else None,
            "evidence_coverage": round(evidence_fields / len(fields), 3) if fields else None,
            "warning_documents": sum(bool(document.get("error") or document.get("errors")) for document in documents),
        },
        "benchmark_samples": [],
    }


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


def code_error(exc: ValueError) -> None:
    code = str(exc)
    fail(409 if code in {"catalog_conflict", "code_exists"} else 404 if code == "code_not_found" else 500, code)


@router.get("/codes", response_model=CodeCatalogResponse)
async def get_codes():
    try:
        return codes.read()
    except ValueError as exc:
        code_error(exc)


@router.post("/codes", response_model=CodeCatalogResponse, status_code=status.HTTP_201_CREATED)
async def create_code(payload: CodeInput):
    try:
        return codes.create(payload.model_dump())
    except ValueError as exc:
        code_error(exc)


@router.put("/codes/{code}", response_model=CodeCatalogResponse)
async def update_code(code: str, payload: CodeUpdate):
    try:
        return codes.update(code, payload.revision, payload.model_dump(exclude={"revision"}))
    except ValueError as exc:
        code_error(exc)


@router.delete("/codes/{code}", response_model=CodeCatalogResponse)
async def delete_code(code: str, revision: int = Query(ge=0)):
    try:
        return codes.delete(code, revision)
    except ValueError as exc:
        code_error(exc)


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


@router.get("/jobs/{job_id}/artifacts", response_model=ArtifactsResponse)
async def artifacts(job_id: str):
    job_or_404(job_id)
    root = store.path(job_id) / "artifacts"
    items = []
    kinds = {".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".json": "json", ".txt": "text", ".md": "text"}
    for target in sorted(path for path in root.rglob("*") if path.is_file()):
        relative = target.relative_to(root)
        try:
            stat = target.stat()
        except OSError:
            continue
        page = re.search(r"(?:page|crop)[-_](\d+)", target.stem, re.IGNORECASE)
        encoded = "/".join(quote(part, safe="") for part in relative.parts)
        items.append({
            "name": target.name,
            "kind": kinds.get(target.suffix.lower(), "other"),
            "status": "available",
            "size_bytes": stat.st_size,
            "updated_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "document_id": relative.parts[0] if len(relative.parts) > 1 else None,
            "page_index": int(page.group(1)) - 1 if page else None,
            "download_url": f"/api/jobs/{job_id}/artifacts/{encoded}",
        })
    return {"items": items}


@router.get("/jobs/{job_id}/artifacts/{path:path}")
async def artifact(job_id: str, path: str):
    root = store.path(job_id) / "artifacts"
    target = (root / path).resolve()
    if root.resolve() not in target.parents or not target.is_file():
        fail(404, "not_found")
    return FileResponse(target)


@router.get("/system-metrics", response_model=SystemMetricsResponse)
async def system_metrics():
    result = read_system_metrics(settings.ocr_data_dir)
    states: dict[str, int] = {}
    for job in store.list():
        state = str(job.get("status", "unknown"))
        states[state] = states.get(state, 0) + 1
    return {**result, "operations": {"states": states}}
