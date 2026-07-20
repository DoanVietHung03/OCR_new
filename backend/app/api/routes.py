from __future__ import annotations
import json
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse
from ..services.jobs import FIELDS, MAX_BYTES, MAX_FILES, TERMINAL, JobStore, now
from ..services.ocr_runner import PROMPT_VERSION, configured
from ..schemas.jobs import CorrectionRequest, CreateJobRequest
from ..settings import settings

router = APIRouter()
store = JobStore(settings.ocr_data_dir)

def fail(status: int, code: str):
    raise HTTPException(status_code=status, detail={"code": code, "message": code})

def job_or_404(job_id: str) -> dict:
    try: return store.read(job_id)
    except (FileNotFoundError, ValueError): fail(404, "not_found")

def public_job(job: dict) -> dict: return {**job, "logs": job.get("logs", [])[-200:]}
def engines() -> list[dict]: return [{"id": settings.ocr_provider, "label": settings.ocr_provider.replace("_", " ").title(), "external": settings.ocr_provider in {"openai", "azure_openai"}, "status": "configured" if configured(settings.ocr_base_url, settings.ocr_model) else "not_configured"}]
def metrics(jobs: list[dict]) -> dict: return {"total_jobs": len(jobs), "pages": sum(int(j.get("page_count", 0)) for j in jobs), "correction_count": sum(int(j.get("correction_count", 0)) for j in jobs), "error_jobs": sum(j.get("status") == "error" for j in jobs)}

@router.get("/state")
async def state(page: int = 1, page_size: int = Query(25, le=100), status: str = "all", method: str = "all", query: str = ""):
    jobs = store.list(); jobs = [j for j in jobs if (status == "all" or j.get("status") == status) and (method == "all" or j.get("ocr_method") == method) and (not query or query.lower() in json.dumps(j, ensure_ascii=False).lower())]; start = max(0, (page - 1) * page_size)
    return {"server_mode": True, "jobs": [public_job(j) for j in jobs[start:start + page_size]], "documents": [], "logs": [], "metrics": metrics(jobs), "ocr_methods": engines(), "limits": {"max_files_per_job": MAX_FILES, "max_job_upload_bytes": MAX_BYTES}, "pagination": {"page": page, "page_size": page_size, "total": len(jobs), "pages": max(1, (len(jobs) + page_size - 1) // page_size)}}

@router.post("/jobs")
async def create_job(payload: CreateJobRequest):
    try: return store.create(payload.model_dump())
    except ValueError as exc: fail(400, str(exc))

@router.put("/jobs/{job_id}/files")
async def upload(job_id: str, request: Request, path: str = ""):
    job_or_404(job_id)
    try: return {"job": store.add_pdf(job_id, path, await request.body())}
    except ValueError as exc: fail(400, str(exc))

@router.post("/jobs/{job_id}/start")
async def start(job_id: str):
    job = job_or_404(job_id)
    if job["uploaded_files"] != job["expected_files"]: fail(409, "upload_incomplete")
    if job.get("ocr_method") in {"openai", "azure_openai"} and not job.get("cloud_data_confirmed"): fail(400, "cloud_data_confirmation_required")
    if not configured(settings.ocr_base_url, settings.ocr_model): fail(503, "ocr_not_configured")
    try:
        from ..workers.tasks import dispatch
        dispatch(job_id)
    except Exception: fail(503, "worker_unavailable")
    return store.update(job_id, status="queued", report_url=f"/jobs/{job_id}")

@router.get("/jobs/{job_id}")
async def get_job(job_id: str): return public_job(job_or_404(job_id))

@router.post("/jobs/{job_id}/cancel")
async def cancel(job_id: str): return public_job(store.cancel(job_id))

@router.post("/jobs/{job_id}/rerun")
async def rerun(job_id: str, request: Request):
    source, options = job_or_404(job_id), await request.json(); new = store.create({**source, **options, "file_count": source["expected_files"], "prompt_version": PROMPT_VERSION})
    for pdf in (store.path(job_id) / "uploads").glob("*.pdf"): store.add_pdf(new["id"], pdf.name, pdf.read_bytes())
    return await start(new["id"])

@router.get("/engines")
async def get_engines(): return {"engines": engines()}

@router.post("/engines/{engine_id}/check")
async def check_engine(engine_id: str):
    if engine_id not in {e["id"] for e in engines()}: fail(404, "invalid_ocr_method")
    configured_now = configured(settings.ocr_base_url, settings.ocr_model)
    return {"id": engine_id, "status": "configured" if configured_now else "not_configured", "summary": "Configuration is present." if configured_now else "OCR provider is not configured."}

@router.post("/jobs/{job_id}/manual-crop")
async def manual_crop(job_id: str, request: Request):
    job, body = job_or_404(job_id), await request.json(); document = next((d for d in job.get("documents", []) if d.get("id") == body.get("document_id")), None); page_index, rect = int(body.get("page_index", 0)), body.get("rect") or {}
    if not document or page_index >= len(document.get("pages", [])) or any(float(rect.get(k, 0)) < 0 for k in ("x", "y", "width", "height")) or float(rect.get("width", 0)) < 2 or float(rect.get("height", 0)) < 2: fail(400, "Invalid crop rectangle.")
    try:
        import fitz
        source = store.path(job_id) / "artifacts" / document["id"] / f"page-{page_index + 1}.png"; target = source.parent / f"crop-{body.get('field', 'field')}-{page_index + 1}.png"; image = fitz.Pixmap(str(source)); fitz.Pixmap(image, fitz.Rect(float(rect["x"]), float(rect["y"]), float(rect["x"] + rect["width"]), float(rect["y"] + rect["height"]))).save(str(target))
    except Exception: fail(404, "Page image was not found in this job.")
    return {"crop_image": f"/api/jobs/{job_id}/artifacts/{document['id']}/{target.name}", "evidence_source": "manual_crop", "evidence_status": "trusted", "bbox": rect, "page_index": page_index}

@router.post("/jobs/{job_id}/corrections")
async def corrections(job_id: str, payload: CorrectionRequest):
    job = job_or_404(job_id)
    if any(item.get("field") not in FIELDS for item in payload.corrections): fail(400, "invalid_field")
    (store.path(job_id) / "corrections" / f"{now().replace(':', '-')}.json").write_text(json.dumps({"actor": "anonymous", "timestamp": now(), "document_id": payload.document_id, "corrections": payload.corrections}, ensure_ascii=False, indent=2), encoding="utf-8")
    job = store.update(job_id, correction_count=int(job.get("correction_count", 0)) + len(payload.corrections)); return {"saved_count": len(payload.corrections), "job": public_job(job), "document_status": {"review_status": {"value": "approved", "risk_count": 0}, "approved": True, "last_saved_at": now()}}

@router.post("/jobs/delete-preview")
async def delete_preview(request: Request):
    jobs = [job_or_404(i) for i in (await request.json()).get("job_ids", [])]; return {"deletable": [{"id": j["id"], "name": j.get("upload_name") or j["id"]} for j in jobs if j.get("status") in TERMINAL], "skipped": [{"id": j["id"]} for j in jobs if j.get("status") not in TERMINAL]}

@router.post("/jobs/bulk-delete")
async def bulk_delete(request: Request):
    deleted, skipped, failed = [], [], []
    for job_id in (await request.json()).get("job_ids", []):
        try:
            if store.read(job_id).get("status") not in TERMINAL: skipped.append(job_id); continue
            store.delete(job_id); deleted.append(job_id)
        except Exception: failed.append(job_id)
    return {"deleted": deleted, "skipped": skipped, "failed": failed}

@router.get("/jobs/{job_id}/artifacts/{path:path}")
async def artifact(job_id: str, path: str):
    root, target = store.path(job_id) / "artifacts", (store.path(job_id) / "artifacts" / path).resolve()
    if root.resolve() not in target.parents or not target.is_file(): fail(404, "not_found")
    return FileResponse(target)

@router.get("/system-metrics")
async def system_metrics(): return {"cpu_percent": None, "memory_percent": None, "gpu": None}
