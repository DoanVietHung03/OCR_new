from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote

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
    ErrorResponse,
    EventsResponse,
    JobIdsRequest,
    JobResponse,
    ManualCropRequest,
    ProviderProfilesResponse,
    PriceSuggestionRequest,
    PriceSuggestionResponse,
    ReportsResponse,
    RerunRequest,
    DeleteSnapshotRequest,
    RetentionApplyRequest,
    RetentionPreviewRequest,
    SizingCalculateRequest,
    SizingCalculateResponse,
    SizingCatalogRequest,
    SizingCatalogResponse,
    SizingJobsResponse,
    SizingJobDetailResponse,
    SizingOperationsResponse,
    SizingOverviewResponse,
    SnapshotCreateRequest,
    SnapshotPatchRequest,
    SnapshotResponse,
    SnapshotsResponse,
    StateResponse,
    SystemMetricsResponse,
    UploadResponse,
)
from ..services.codes import CodeCatalog
from ..services.jobs import ACTIVE, ApprovalBlocked, DELETABLE, MAX_BYTES, MAX_FILES, TERMINAL, JobStore, now
from ..services.ocr_runner import probe_provider
from ..services.providers import ProfileSpec, default_profile, enabled_profiles, get_profile
from ..services.pricing import EXCHANGE_SOURCES, SuggestionError, exchange_quote, price_suggestion
from ..services.system_metrics import system_metrics as read_system_metrics
from ..services.sizing import (
    MeasurementStore, SizingCatalog, SnapshotStore, aggregate, atomic_json,
    calculate_scenario, checksum, merge_aggregates, price_for,
)
from ..settings import settings

router = APIRouter(responses={422: {"model": ErrorResponse}})
store = JobStore(settings.ocr_data_dir)
codes = CodeCatalog(settings.ocr_data_dir)
sizing_measurements = MeasurementStore(settings.ocr_data_dir, recover=False)
sizing_catalog = SizingCatalog(settings.ocr_data_dir)
sizing_snapshots = SnapshotStore(settings.ocr_data_dir)
_readiness_cache: dict[tuple[str, str], tuple[float, str, str]] | None = {}
_readiness_lock = asyncio.Lock()


def fail(status: int, code: str) -> None:
    raise HTTPException(status_code=status, detail={"code": code, "message": code})


def job_or_404(job_id: str) -> dict:
    try:
        return store.read(job_id)
    except (FileNotFoundError, ValueError):
        fail(404, "not_found")


def public_job(job: dict) -> dict:
    documents = job.get("documents", [])
    approved = sum(item.get("review_status") == "approved" for item in documents)
    review_status = None
    if documents:
        review_status = "approved" if approved == len(documents) else "partially_approved" if approved else "unreviewed"
    public = {key: value for key, value in job.items() if key not in {"provider_policy_fingerprint", "provider_config_version"}}
    return {**public, "review_status": review_status, "logs": safe_events([job])[:200]}


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
        has_status_history = any(
            isinstance(item, dict) and item.get("code") == "job_status_changed"
            for item in job.get("events", [])
        )
        if current and current != "uploading" and job.get("updated_at") and not has_status_history:
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
        allowed_events = {
            "segmentation_proposed", "segmentation_confirmed", "extraction_dispatched",
            "job_dispatched", "job_completed", "job_rerun_created", "job_rerun_from",
            "page_pass_completed", "page_pass_failed", "document_corrected",
            "document_approved", "manual_crop_created", "job_status_changed",
        }
        for item in job.get("events", []):
            if isinstance(item, dict) and item.get("code") in allowed_events:
                severity = item.get("severity") if item.get("severity") in {"info", "warning", "error"} else "info"
                category = item.get("category") if item.get("category") in {"lifecycle", "document", "review"} else "lifecycle"
                events.append({
                    "timestamp": str(item.get("timestamp", "")), "severity": severity, "category": category,
                    "code": item["code"], "job_id": job_id, "message": item["code"],
                    "source_pdf_id": item.get("source_pdf_id"), "revision": item.get("revision"),
                    "document_id": item.get("document_id"), "page_index": item.get("page_index"),
                    "related_job_id": item.get("related_job_id"), "ocr_pass": item.get("ocr_pass"),
                    "duration_seconds": item.get("duration_seconds"),
                    "status": item.get("status") if item.get("status") in {
                        "uploading", "ready", "starting", "queued", "running", "cancelling",
                        "segmenting", "awaiting_segmentation_review", "segmentation_confirmed",
                        "extraction_starting", "completed", "completed_with_warnings", "error",
                        "cancelled", "interrupted",
                    } else None,
                    "warning_codes": [
                        code for code in item.get("warning_codes", [])
                        if isinstance(code, str) and re.fullmatch(r"[a-z][a-z0-9_]{1,63}", code)
                    ],
                })
        profile_id = str(job.get("provider_profile_id") or job.get("provider") or job.get("ocr_method") or "") or None
        for event in events[first:]:
            event["provider_profile_id"] = profile_id
    unique = {
        (
            event["timestamp"], event["code"], event["job_id"], event.get("document_id"),
            event.get("page_index"), event.get("status"), event.get("ocr_pass"),
            event.get("source_pdf_id"), event.get("revision"),
        ): event
        for event in events
    }
    return sorted(unique.values(), key=lambda event: event["timestamp"], reverse=True)


def paginated(items: list[dict], page: int, page_size: int) -> dict:
    offset = max(0, (page - 1) * page_size)
    return {
        "items": items[offset:offset + page_size],
        "pagination": {"page": page, "page_size": page_size, "total": len(items),
                       "pages": max(1, (len(items) + page_size - 1) // page_size)},
    }


def document_triage(document: dict) -> dict:
    fields = document.get("fields", {}) if isinstance(document.get("fields"), dict) else {}
    blockers = document.get("approval_blockers", []) if isinstance(document.get("approval_blockers"), list) else []
    risks = document.get("review_risks", []) if isinstance(document.get("review_risks"), list) else []
    low = [name for name, field in fields.items() if isinstance(field, dict) and field.get("review_reason") == "low_confidence"]
    suggestions = [name for name, field in fields.items() if isinstance(field, dict) and field.get("suggested_value") not in (None, "")]
    crops = [item for item in document.get("crop_evidence", []) if isinstance(item, dict)]
    issue = next((item for item in blockers + risks if isinstance(item, dict)), {})
    target_field = issue.get("field") or next(iter(low or suggestions), None) or (crops[0].get("field") if crops else None)
    target_page = issue.get("page_index")
    if target_page is None and target_field in fields and isinstance(fields[target_field], dict):
        target_page = fields[target_field].get("page_index")
    if target_page is None and crops:
        target_page = crops[0].get("page_index")
    return {
        "needs_review": bool(blockers or risks or low or suggestions),
        "has_blocker": bool(blockers),
        "has_risk": bool(risks),
        "low_confidence": bool(low),
        "has_suggestion": bool(suggestions),
        "has_manual_crop": bool(crops),
        "blocker_count": len(blockers),
        "risk_count": int(document.get("review_risk_count", len(risks))),
        "low_confidence_count": len(low),
        "suggestion_count": len(suggestions),
        "manual_crop_count": len(crops),
        "target_page_index": target_page,
        "target_field": target_field,
    }


def provider_profiles() -> list[dict]:
    default = default_profile().id
    return [profile.public() for profile in sorted(enabled_profiles(), key=lambda item: item.id != default)]


def profile_supports(profile: ProfileSpec, options: dict) -> bool:
    return (
        options.get("vlm_task", "full_ocr") in profile.tasks
        and options.get("vlm_pages", "all") in profile.page_modes
        and int(options.get("vlm_max_pages", 0) or 0) <= profile.max_pages
        and options.get("processing_mode", "administrative_document") in profile.processing_modes
    )


def job_profile(job: dict) -> ProfileSpec:
    return get_profile(
        job.get("provider_profile_id") or default_profile().id,
        expected_fingerprint=job.get("provider_policy_fingerprint", ""),
    )


async def provider_readiness_detail(profile_id: str) -> tuple[str, str, bool]:
    global _readiness_cache
    profile = get_profile(profile_id)
    key = (profile.id, profile.fingerprint)
    cached_value = (_readiness_cache or {}).get(key)
    if cached_value and time.monotonic() - cached_value[0] < 30:
        return cached_value[1], cached_value[2], True
    async with _readiness_lock:
        if _readiness_cache is None:
            _readiness_cache = {}
        cached_value = _readiness_cache.get(key)
        if cached_value and time.monotonic() - cached_value[0] < 30:
            return cached_value[1], cached_value[2], True
        result = await probe_provider(
            profile=profile, timeout=min(profile.timeout_seconds, 10),
            measurement_store=sizing_measurements,
            measurement_context={
                "job_id": None, "provider_profile_id": profile.id,
                "provider_config_version": profile.provider_config_version,
                "model": profile.model, "task": "readiness_probe",
                "measurement_fingerprint": checksum({
                    "provider_profile_id": profile.id, "model": profile.model,
                    "task": "readiness_probe", "dpi": 200,
                    "provider_policy_fingerprint": profile.fingerprint,
                }),
            },
        )
        checked_at = now()
        _readiness_cache[key] = (time.monotonic(), result, checked_at)
        return result, checked_at, False


async def provider_readiness(job: dict) -> str:
    try:
        return (await provider_readiness_detail(job_profile(job).id))[0]
    except ValueError:
        return "not_configured"


async def require_provider_ready(job: dict) -> None:
    try:
        profile = job_profile(job)
    except ValueError:
        fail(409, "provider_profile_unavailable")
    readiness = (await provider_readiness_detail(profile.id))[0]
    if readiness != "ready":
        fail(503, {
            "not_configured": "ocr_not_configured",
            "unreachable": "ocr_unreachable",
        }.get(readiness, "ocr_not_ready"))


def engines() -> list[dict]:
    return provider_profiles()


def is_active(job: dict) -> bool:
    return job.get("status") in ACTIVE


def matches_status(job: dict, status: str) -> bool:
    if status == "all":
        return True
    return is_active(job) if status == "active" else job.get("status") == status


def metrics(jobs: list[dict]) -> dict:
    return {
        "total_jobs": len(jobs),
        "active_jobs": sum(is_active(job) for job in jobs),
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
        if matches_status(job, status)
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
    profile_id = payload.provider_profile_id or default_profile().id
    try:
        profile = get_profile(profile_id)
    except ValueError:
        fail(400, "invalid_provider_profile")
    if not profile.configured:
        fail(503, "ocr_not_configured")
    if not profile_supports(profile, options):
        fail(400, "unsupported_provider_capability")
    options.update(
        provider_profile_id=profile_id,
        provider=profile.id,
        model=profile.model,
        prompt_version=profile.prompt_version,
        endpoint_external=profile.endpoint_external,
        provider_policy_fingerprint=profile.fingerprint,
        provider_config_version=profile.provider_config_version,
    )
    try:
        return public_job(store.create(options))
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
    await require_provider_ready(job)
    try:
        job, should_dispatch = store.begin_start(job_id)
    except ValueError as exc:
        fail(409, str(exc))
    if not should_dispatch:
        return public_job(job)
    try:
        from ..workers.tasks import dispatch

        dispatch(job_id)
        store.add_event(job_id, "job_dispatched")
    except Exception:
        store.interrupt(job_id)
        fail(503, "worker_unavailable")
    return public_job(store.read(job_id))


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(job_id: str):
    return public_job(job_or_404(job_id))


def dispatch_extraction(job_id: str) -> dict:
    if not job_profile(store.read(job_id)).configured:
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
        job = store.add_event(job_id, "segmentation_confirmed", source_pdf_id=source_pdf_id, revision=payload.revision + 1)
    except FileNotFoundError:
        fail(404, "not_found")
    except ValueError as exc:
        fail(409, str(exc))
    if job.get("status") == "segmentation_confirmed" and await provider_readiness(job) == "ready":
        job = dispatch_extraction(job_id)
    return public_job(job)


@router.post("/jobs/{job_id}/continue", response_model=JobResponse)
async def continue_job(job_id: str):
    job = job_or_404(job_id)
    if job.get("status") != "segmentation_confirmed":
        fail(409, "segmentation_not_confirmed")
    await require_provider_ready(job)
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
    try:
        profile = get_profile(source.get("provider_profile_id", ""))
    except ValueError:
        profile = None
    if profile is None or not profile.configured or not profile_supports(profile, source):
        fail(409, "provider_profile_unavailable")
    reuse = source.get("processing_mode") == "combined_dossier" and payload.rerun_mode == "reuse_segmentation" and all(
        item.get("confirmed_segments") for item in source.get("source_pdfs", [])
    )
    new = store.create({
        "file_count": source["expected_files"],
        "upload_name": source.get("upload_name", ""),
        "cloud_data_confirmed": payload.cloud_data_confirmed,
        "provider_profile_id": source.get("provider_profile_id"),
        "provider": profile.id,
        "model": profile.model,
        "prompt_version": profile.prompt_version,
        "endpoint_external": profile.endpoint_external,
        "provider_policy_fingerprint": profile.fingerprint,
        "provider_config_version": profile.provider_config_version,
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
    store.add_event(job_id, "job_rerun_created", related_job_id=new["id"])
    store.add_event(new["id"], "job_rerun_from", related_job_id=job_id)
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
    triage: str = Query("all", pattern=r"^(all|needs_review|blocker|risk|low_confidence|suggestion|manual_crop)$"),
    sort: str = Query("updated_desc", pattern=r"^(updated_desc|updated_asc|name_asc|name_desc)$"),
):
    # ponytail: O(n) filesystem projection; add an index only after measured scale requires one.
    items = []
    for job in store.list():
        for document in job.get("documents", []):
            errors = document.get("errors")
            legacy_warnings = (
                len(errors) if isinstance(errors, list) else int(bool(errors))
            ) + int(bool(document.get("error")))
            warning_count = int(document.get("review_risk_count", legacy_warnings))
            triage_data = document_triage(document)
            target = f"&page={triage_data['target_page_index']}" if triage_data["target_page_index"] is not None else ""
            if triage_data["target_field"]:
                target += f"&field={quote(str(triage_data['target_field']), safe='')}"
            item = {
                "id": str(document.get("id", "")), "job_id": job["id"],
                "job_status": str(job.get("status", "")), "file_name": str(document.get("file_name", "")),
                "status": str(document.get("status", "")), "review_status": document.get("review_status"),
                "page_count": len(document.get("pages", [])), "confidence_average": confidence_average([document]),
                "document_type": scalar_field(document, "document_type", "loai_van_ban"),
                "warning_count": warning_count,
                **triage_data,
                "updated_at": str(job.get("updated_at", "")),
                "deep_link": f"/jobs/{job['id']}?document={quote(str(document.get('id', '')), safe='')}&view=review{target}",
            }
            searchable = f"{item['file_name']} {item['id']} {item['job_id']}".lower()
            review_matches = review_status == "all" or item["review_status"] == review_status or (review_status == "unreviewed" and item["review_status"] != "approved")
            if (not query or query.lower() in searchable) and review_matches:
                items.append(item)
    triage_counts = {"all": len(items)}
    for key, field in {
        "needs_review": "needs_review", "blocker": "has_blocker", "risk": "has_risk", "low_confidence": "low_confidence",
        "suggestion": "has_suggestion", "manual_crop": "has_manual_crop",
    }.items():
        triage_counts[key] = sum(bool(item[field]) for item in items)
    if triage != "all":
        field = {"blocker": "has_blocker", "risk": "has_risk", "suggestion": "has_suggestion", "manual_crop": "has_manual_crop"}.get(triage, triage)
        items = [item for item in items if item[field]]
    key = "file_name" if sort.startswith("name") else "updated_at"
    items.sort(key=lambda item: str(item[key]).lower(), reverse=sort.endswith("desc"))
    return {**paginated(items, page, page_size), "triage_counts": triage_counts}


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


def report_summary(jobs: list[dict]) -> dict:
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
            "active_jobs": sum(is_active(job) for job in jobs),
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
            "warning_documents": sum(
                bool(document.get("review_risk_count", document.get("error") or document.get("errors")))
                for document in documents
            ),
        },
    }


@router.get("/reports", response_model=ReportsResponse)
async def get_reports():
    jobs = store.list()
    grouped: dict[str, list[dict]] = {}
    for job in jobs:
        profile = str(job.get("provider_profile_id") or job.get("provider") or job.get("ocr_method") or "legacy")
        grouped.setdefault(profile, []).append(job)
    profiles = []
    for profile, items in sorted(grouped.items()):
        summary = report_summary(items)
        profiles.append({"provider_profile_id": profile, **summary, "recent_errors": list(summary["operations"]["failure_codes"])[:5]})
    return {
        **report_summary(jobs),
        "profiles": profiles,
        "benchmark_samples": None,
    }


@router.post("/engines/{engine_id}/check", response_model=EngineCheckResponse)
async def check_engine(engine_id: str):
    if engine_id not in {engine["id"] for engine in engines()}:
        fail(404, "invalid_ocr_method")
    readiness, checked_at, cached = await provider_readiness_detail(engine_id)
    return {
        "id": engine_id,
        "status": readiness,
        "summary": {
            "not_configured": "OCR provider is not configured.",
            "unreachable": "OCR provider is unreachable.",
            "reachable": "OCR provider responded but is not ready.",
            "ready": "OCR provider is ready.",
        }[readiness],
        "checked_at": checked_at,
        "cached": cached,
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
    page = next((item for item in document.get("pages", []) if item.get("page_index") == payload.page_index), None) if document else None
    if document is None or page is None:
        fail(404, "not_found")
    if payload.field not in document.get("fields", {}):
        fail(400, "invalid_field")
    rect = payload.rect.model_dump()
    try:
        import fitz

        source_owner = page.get("source_pdf_id") or document.get("source_pdf_id") or document["id"]
        source_page = page.get("source_page_index") if page.get("source_page_index") is not None else payload.page_index
        source = store.path(job_id) / "artifacts" / source_owner / f"page-{source_page + 1}.png"
        image = fitz.Pixmap(str(source))
        if rect["x"] + rect["width"] > image.width or rect["y"] + rect["height"] > image.height:
            fail(400, "invalid_crop_rectangle")
        target_dir = store.path(job_id) / "artifacts" / document["id"]
        target_dir.mkdir(exist_ok=True)
        target = target_dir / f"crop-{payload.field}-{payload.page_index + 1}-{uuid.uuid4().hex[:8]}.png"
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


@router.post("/jobs/{job_id}/corrections", response_model=CorrectionResponse, responses={409: {"model": ErrorResponse}})
async def corrections(job_id: str, payload: CorrectionRequest):
    job_or_404(job_id)
    try:
        job, document = store.apply_review(
            job_id,
            payload.document_id,
            [item.model_dump() for item in payload.corrections],
        )
    except ApprovalBlocked as exc:
        detail = {"code": "approval_blocked", "message": "approval_blocked", "blockers": exc.blockers}
        raise HTTPException(status_code=409, detail=detail) from exc
    except ValueError as exc:
        code = str(exc)
        fail(409 if code in {"correction_conflict", "job_not_terminal"} else 400, code)
    return {
        "saved_count": len(payload.corrections),
        "job": public_job(job),
        "document_status": {
            "review_status": {"value": document["review_status"], "risk_count": document.get("review_risk_count", 0)},
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
            sizing_measurements.rollup_job(job_id)
            store.delete(job_id)
            deleted.append(job_id)
        except ValueError:
            skipped.append(job_id)
        except Exception:
            failed.append(job_id)
    return {"deleted": deleted, "skipped": skipped, "failed": failed}


@router.get("/jobs/{job_id}/artifacts", response_model=ArtifactsResponse)
async def artifacts(job_id: str):
    job = job_or_404(job_id)
    root = store.path(job_id) / "artifacts"
    items = []
    seen = set()
    references = []
    for document in job.get("documents", []):
        document_id = str(document.get("id", ""))
        page_urls = {page.get("image_url") for page in document.get("pages", [])}
        references += [(page.get("image_url"), document_id, page.get("page_index"), None) for page in document.get("pages", [])]
        references += [
            (field.get("evidence_url"), document_id, field.get("page_index"), name)
            for name, field in document.get("fields", {}).items()
            if isinstance(field, dict) and field.get("evidence_url") not in page_urls
        ]
        references += [
            (item.get("crop_image"), document_id, item.get("page_index"), item.get("field"))
            for item in document.get("crop_evidence", []) if isinstance(item, dict)
        ]
        references.append((document.get("corrected_artifact"), document_id, None, None))
    metadata = {
        unquote(url.split("/artifacts/", 1)[1]): (document_id, page_index, field, url)
        for url, document_id, page_index, field in references
        if isinstance(url, str) and "/artifacts/" in url and ".." not in Path(unquote(url.split("/artifacts/", 1)[1])).parts
    }
    kinds = {".png": "image", ".jpg": "image", ".jpeg": "image", ".webp": "image", ".json": "json", ".txt": "text", ".md": "text"}
    for target in sorted(path for path in root.rglob("*") if path.is_file()):
        relative = target.relative_to(root)
        try:
            stat = target.stat()
        except OSError:
            continue
        page = re.search(r"(?:page|crop)[-_](\d+)", target.stem, re.IGNORECASE)
        encoded = "/".join(quote(part, safe="") for part in relative.parts)
        seen.add(relative.as_posix())
        document_id, page_index, field, _ = metadata.get(relative.as_posix(), (relative.parts[0] if len(relative.parts) > 1 else None, None, None, None))
        items.append({
            "name": target.name,
            "kind": kinds.get(target.suffix.lower(), "other"),
            "status": "available",
            "size_bytes": stat.st_size,
            "updated_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            "document_id": document_id,
            "page_index": page_index if page_index is not None else int(page.group(1)) - 1 if page else None,
            "field": field,
            "download_url": f"/api/jobs/{job_id}/artifacts/{encoded}",
        })
    for relative, (document_id, page_index, field, url) in metadata.items():
        if relative in seen:
            continue
        items.append({
            "name": Path(relative).name, "kind": kinds.get(Path(relative).suffix.lower(), "other"),
            "status": "missing", "size_bytes": 0, "updated_at": "",
            "document_id": document_id, "page_index": page_index, "field": field,
            "download_url": url,
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


def filtered_sizing_operations(
    provider_profile_id: str = "", task: str = "", processing_mode: str = "",
    start_date: str = "", end_date: str = "",
) -> list[dict]:
    return [
        item for item in sizing_measurements.operations()
        if (not provider_profile_id or item.get("provider_profile_id") == provider_profile_id)
        and (not task or item.get("task") == task)
        and (not processing_mode or item.get("processing_mode") == processing_mode)
        and (not start_date or str(item.get("started_at", ""))[:10] >= start_date)
        and (not end_date or str(item.get("started_at", ""))[:10] <= end_date)
    ]


@router.get("/sizing/overview", response_model=SizingOverviewResponse)
async def sizing_overview(
    provider_profile_id: str = "", task: str = "", processing_mode: str = "",
    start_date: str = "", end_date: str = "",
    unit: str = Query("job", pattern=r"^(attempt|page|document|job|system)$"),
):
    operations = filtered_sizing_operations(provider_profile_id, task, processing_mode, start_date, end_date)
    job_ids = {item.get("job_id") for item in operations if item.get("job_id")}
    live_summary = aggregate(operations, sample_count=len(job_ids), price_profiles=sizing_catalog.read()["price_profiles"])
    rollups = [] if any((provider_profile_id, task, processing_mode, start_date, end_date)) else [
        item for job_id, item in sizing_measurements.rollups().items() if job_id not in job_ids
    ]
    summary = merge_aggregates([live_summary, *rollups])
    sample_count = summary["sample_count"]
    fingerprints = {str(item.get("measurement_fingerprint") or "") for item in operations}
    compatible_measurements = len(fingerprints) == 1 and "" not in fingerprints
    daily: dict[str, int] = {}
    for item in operations:
        if item.get("usage_status") not in {"complete", "inconsistent"} or not item.get("usage"):
            continue
        day = str(item.get("started_at", ""))[:10]
        daily[day] = daily.get(day, 0) + int(item["usage"].get("canonical_total_tokens") or 0)
    unit_keys = {
        "attempt": {(item.get("operation_id"), item.get("attempt")) for item in operations},
        "page": {(item.get("job_id"), item.get("document_id"), item.get("page_index")) for item in operations if item.get("page_index") is not None},
        "document": {(item.get("job_id"), item.get("document_id")) for item in operations if item.get("document_id")},
        "job": {(item.get("job_id"),) for item in operations if item.get("job_id")},
        "system": {(item.get("operation_id"),) for item in operations if item.get("scope") == "system"},
    }
    return {
        "generated_at": now(),
        **summary,
        "value_kind": "measured" if operations else "unavailable",
        "coverage": {
            "response_usage_percent": summary["response_usage_percent"],
            "billing_certainty_percent": summary["billing_certainty_percent"],
            "complete_usage_attempts": sum(item.get("usage_status") in {"complete", "inconsistent"} for item in operations),
            "response_attempts": sum(item.get("response_bytes") is not None for item in operations),
            "known_billing_attempts": summary["operation_count"] - summary["unknown_cost_attempts"],
            "total_attempts": summary["operation_count"],
        },
        "series": [{"date": day, "total_tokens": total} for day, total in sorted(daily.items())],
        "provenance": {
            "value_kind": "measured" if operations else "unavailable",
            "sample_count": sample_count,
            "measurement_source": "provider_operation_sidecars",
            "filters_applied": bool(any((provider_profile_id, task, processing_mode, start_date, end_date))),
        },
        "unit": unit,
        "unit_sample_count": len(unit_keys[unit]),
        "gates": {
            name: {
                "minimum_jobs": minimum,
                "available": sample_count >= minimum and (name == "preview" or compatible_measurements),
                "reason": (
                    "available" if sample_count >= minimum and (name == "preview" or compatible_measurements)
                    else "incompatible_measurements" if name != "preview" and sample_count >= minimum
                    else "measurement_foundation_pending" if name == "preview" and not operations
                    else "insufficient_sample"
                ),
            }
            for name, minimum in {"preview": 1, "comparison": 2, "trend": 5, "capacity": 20}.items()
        },
    }


def sizing_page(items: list, page: int, page_size: int) -> tuple[list, dict]:
    offset = (page - 1) * page_size
    return items[offset:offset + page_size], {
        "page": page, "page_size": page_size, "total": len(items),
        "pages": max(1, (len(items) + page_size - 1) // page_size),
    }


@router.get("/sizing/jobs", response_model=SizingJobsResponse)
async def sizing_jobs(
    page: int = 1, page_size: int = Query(25, ge=1, le=100),
    provider_profile_id: str = "", task: str = "", processing_mode: str = "",
    start_date: str = "", end_date: str = "",
):
    operations = filtered_sizing_operations(provider_profile_id, task, processing_mode, start_date, end_date)
    catalog = sizing_catalog.read()
    job_ids = list(dict.fromkeys(item["job_id"] for item in operations if item.get("job_id")))
    items = []
    for job_id in job_ids:
        selected = [item for item in operations if item.get("job_id") == job_id]
        summary = aggregate(selected, sample_count=1, price_profiles=catalog["price_profiles"])
        try:
            job = store.read(job_id)
        except FileNotFoundError:
            job = {}
        items.append({
            "job_id": job_id, "provider_profile_id": selected[0].get("provider_profile_id"),
            "processing_mode": job.get("processing_mode") or selected[0].get("processing_mode"),
            "started_at": min((item.get("started_at") for item in selected), default=None),
            **summary,
        })
    if not any((provider_profile_id, task, processing_mode, start_date, end_date)):
        items.extend(item for job_id, item in sizing_measurements.rollups().items() if job_id not in job_ids)
    items.sort(key=lambda item: str(item.get("started_at") or ""), reverse=True)
    selected, pagination = sizing_page(items, page, page_size)
    return {"items": selected, "pagination": pagination}


@router.get("/sizing/jobs/{job_id}", response_model=SizingJobDetailResponse)
async def sizing_job(job_id: str):
    operations = sizing_measurements.operations(job_id=job_id)
    if not operations:
        fail(404, "measurement_not_found")
    summary = aggregate(operations, sample_count=1, price_profiles=sizing_catalog.read()["price_profiles"])
    item = {
        "job_id": job_id, "provider_profile_id": operations[0].get("provider_profile_id"),
        "processing_mode": operations[0].get("processing_mode"),
        "started_at": min(item.get("started_at") for item in operations), **summary,
    }
    document_ids = list(dict.fromkeys(operation.get("document_id") for operation in operations if operation.get("document_id")))
    documents = []
    for document_id in document_ids:
        selected = [operation for operation in operations if operation.get("document_id") == document_id]
        document_summary = aggregate(selected, sample_count=1)
        documents.append({
            "document_id": document_id, "source_pdf_id": selected[0].get("source_pdf_id"),
            "operation_count": document_summary["operation_count"],
            "total_tokens": document_summary["total_tokens"],
            "page_count": len({operation.get("page_index") for operation in selected if operation.get("page_index") is not None}),
        })
    return {"job": item, "documents": documents, "system_overhead_separate": True}


@router.get("/sizing/jobs/{job_id}/operations", response_model=SizingOperationsResponse)
async def sizing_operations(
    job_id: str, page: int = 1, page_size: int = Query(50, ge=1, le=100),
    document_id: str = "", source_pdf_id: str = "", task: str = "", status: str = "",
):
    items = [
        item for item in sizing_measurements.operations(job_id=job_id)
        if (not document_id or item.get("document_id") == document_id)
        and (not source_pdf_id or item.get("source_pdf_id") == source_pdf_id)
        and (not task or item.get("task") == task)
        and (not status or item.get("status") == status)
    ]
    selected, pagination = sizing_page(items, page, page_size)
    return {"items": selected, "pagination": pagination}


def sizing_conflict(exc: (ValueError | FileNotFoundError)) -> None:
    code = str(exc)
    fail(409 if code == "revision_conflict" else 404 if isinstance(exc, FileNotFoundError) else 400, code)


@router.get("/sizing/catalog", response_model=SizingCatalogResponse)
async def get_sizing_catalog():
    return sizing_catalog.read()


@router.put("/sizing/catalog", response_model=SizingCatalogResponse)
async def put_sizing_catalog(payload: SizingCatalogRequest):
    try:
        current = sizing_catalog.read()
        used = {
            profile["id"] for operation in sizing_measurements.operations()
            if (profile := price_for(operation, current["price_profiles"]))
        }
        return sizing_catalog.replace(payload.revision, payload.model_dump(exclude={"revision"}), used_price_ids=used)
    except ValueError as exc:
        sizing_conflict(exc)


@router.post("/sizing/calculate", response_model=SizingCalculateResponse)
async def sizing_calculate(payload: SizingCalculateRequest):
    operations = [
        item for item in sizing_measurements.operations()
        if item.get("provider_profile_id") == payload.provider_profile_id
        and item.get("processing_mode") == payload.processing_mode
    ]
    job_ids = {item.get("job_id") for item in operations if item.get("job_id")}
    summary = aggregate(operations, sample_count=len(job_ids), price_profiles=sizing_catalog.read()["price_profiles"])
    durations = []
    for job_id in job_ids:
        try:
            job = store.read(job_id)
        except FileNotFoundError:
            continue
        if job.get("started_at") and job.get("completed_at"):
            durations.append(max(0, (datetime.fromisoformat(job["completed_at"]) - datetime.fromisoformat(job["started_at"])).total_seconds()))
    summary["job_duration_seconds_p95"] = sorted(durations)[max(0, int(len(durations) * .95 + .999) - 1)] if durations else None
    return calculate_scenario(payload.model_dump(), summary)


@router.post("/sizing/snapshots", response_model=SnapshotResponse, status_code=201)
async def create_sizing_snapshot(payload: SnapshotCreateRequest):
    try:
        return sizing_snapshots.create(payload.model_dump())
    except ValueError as exc:
        sizing_conflict(exc)


@router.get("/sizing/snapshots", response_model=SnapshotsResponse)
async def get_sizing_snapshots(page: int = 1, page_size: int = Query(25, ge=1, le=100)):
    items = sizing_snapshots.list()
    selected, pagination = sizing_page(items, page, page_size)
    return {"items": selected, "pagination": pagination, "quota_used": len(items), "quota_limit": sizing_snapshots.LIMIT}


@router.patch("/sizing/snapshots/{snapshot_id}", response_model=SnapshotResponse)
async def patch_sizing_snapshot(snapshot_id: str, payload: SnapshotPatchRequest):
    try:
        return sizing_snapshots.patch(snapshot_id, payload.revision, archived=payload.archived)
    except (ValueError, FileNotFoundError) as exc:
        sizing_conflict(exc)


@router.post("/sizing/snapshots/{snapshot_id}/delete-preview")
async def preview_sizing_snapshot_delete(snapshot_id: str):
    try:
        return sizing_snapshots.delete_preview(snapshot_id)
    except FileNotFoundError as exc:
        sizing_conflict(exc)


@router.delete("/sizing/snapshots/{snapshot_id}", status_code=204)
async def delete_sizing_snapshot(snapshot_id: str, payload: DeleteSnapshotRequest):
    try:
        sizing_snapshots.delete(snapshot_id, payload.revision, payload.checksum)
    except (ValueError, FileNotFoundError) as exc:
        sizing_conflict(exc)


@router.post("/sizing/retention/preview")
async def sizing_retention_preview(payload: RetentionPreviewRequest):
    paths = []
    for parent in settings.ocr_data_dir.iterdir():
        if not parent.is_dir() or parent.name == "_sizing" and not payload.include_system:
            continue
        operation_dir = parent / "provider_operations" if parent.name != "_sizing" else parent / "system_operations"
        for path in operation_dir.glob("*.json"):
            try:
                started = str(json.loads(path.read_text(encoding="utf-8")).get("started_at", ""))[:10]
            except (OSError, json.JSONDecodeError):
                continue
            if payload.start_date <= started <= payload.end_date:
                paths.append(str(path.relative_to(settings.ocr_data_dir)))
    token = uuid.uuid4().hex
    rollup_job_ids = [
        job_id for job_id, item in sizing_measurements.rollups().items()
        if payload.include_rollups and payload.start_date <= str(item.get("started_at", ""))[:10] <= payload.end_date
        and (payload.include_pinned_benchmarks or not item.get("benchmark_pinned"))
    ]
    plan = {
        "paths": sorted(paths), "rollup_job_ids": sorted(rollup_job_ids),
        "start_date": payload.start_date, "end_date": payload.end_date,
    }
    plan_checksum = checksum(plan)
    atomic_json(settings.ocr_data_dir / "_sizing" / "archive_transactions" / f"{token}.json", plan)
    return {"plan_token": token, "checksum": plan_checksum, "operation_count": len(paths), "rollup_count": len(rollup_job_ids)}


@router.post("/sizing/retention/apply")
async def sizing_retention_apply(payload: RetentionApplyRequest):
    plan_path = settings.ocr_data_dir / "_sizing" / "archive_transactions" / f"{payload.plan_token}.json"
    try:
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        fail(404, "retention_plan_not_found")
    if checksum(plan) != payload.checksum:
        fail(409, "revision_conflict")
    deleted = 0
    for relative in plan["paths"]:
        target = (settings.ocr_data_dir / relative).resolve()
        if settings.ocr_data_dir.resolve() not in target.parents:
            fail(400, "invalid_retention_target")
        if target.exists():
            target.unlink()
            deleted += 1
    removed_rollups = 0
    for job_id in plan.get("rollup_job_ids", []):
        rollup = settings.ocr_data_dir / "_sizing" / "rollups" / f"{job_id}.json"
        if rollup.exists():
            rollup.unlink()
            removed_rollups += 1
    atomic_json(settings.ocr_data_dir / "_sizing" / "tombstones" / f"{payload.plan_token}.json", {
        "deleted_at": now(), "start_date": plan["start_date"], "end_date": plan["end_date"],
        "operation_count": deleted, "rollup_count": removed_rollups, "checksum": payload.checksum,
    })
    plan_path.unlink(missing_ok=True)
    return {"deleted_operations": deleted, "deleted_rollups": removed_rollups}


@router.get("/sizing/exchange-rate-sources")
async def exchange_rate_sources():
    return {"items": list(EXCHANGE_SOURCES.values())}


@router.post("/sizing/exchange-rate-suggestions")
async def exchange_rate_suggestions(source_id: str):
    try:
        return {"items": [await exchange_quote(source_id)]}
    except SuggestionError as exc:
        code = str(exc)
        fail(400 if code == "invalid_exchange_source" else 503, code)


@router.post("/sizing/price-suggestions", response_model=PriceSuggestionResponse)
async def sizing_price_suggestion(payload: PriceSuggestionRequest):
    try:
        return await price_suggestion(payload.provider_profile_id.strip(), payload.model.strip(), payload.exchange_source)
    except SuggestionError as exc:
        code = str(exc)
        fail(400 if code in {"invalid_exchange_source", "model_price_unavailable"} else 503, code)
