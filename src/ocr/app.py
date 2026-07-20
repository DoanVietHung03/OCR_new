from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .jobs import FIELDS, MAX_BYTES, MAX_FILES, JobStore, TERMINAL, now
from .runner import PROMPT_VERSION, configured, request_page

BASE = Path(__file__).resolve().parents[2]
store = JobStore(os.getenv("OCR_DATA_DIR", str(BASE / "data" / "jobs")))
app = FastAPI(title="OCR")
app.mount("/web", StaticFiles(directory=BASE / "web"), name="web")


def fail(status: int, code: str):
    raise HTTPException(status, detail={"code": code, "message": code})


def job_or_404(job_id: str) -> dict:
    try:
        return store.read(job_id)
    except FileNotFoundError:
        fail(404, "not_found")


def public_job(job: dict) -> dict:
    return {**job, "logs": job.get("logs", [])[-200:]}


def state_payload(page: int = 1, page_size: int = 25, status: str = "all", method: str = "all", query: str = "") -> dict:
    jobs = store.list()
    if status != "all": jobs = [job for job in jobs if job.get("status") == status]
    if method != "all": jobs = [job for job in jobs if job.get("ocr_method") == method]
    if query: jobs = [job for job in jobs if query.lower() in json.dumps(job, ensure_ascii=False).lower()]
    start = max(0, (page - 1) * page_size)
    return {"server_mode": True, "jobs": [public_job(job) for job in jobs[start:start + page_size]], "documents": [], "logs": [], "metrics": metrics(jobs), "ocr_methods": engines(), "limits": {"max_files_per_job": MAX_FILES, "max_job_upload_bytes": MAX_BYTES}, "pagination": {"page": page, "page_size": page_size, "total": len(jobs), "pages": max(1, (len(jobs) + page_size - 1) // page_size)}}


def metrics(jobs: list[dict]) -> dict:
    return {"total_jobs": len(jobs), "pages": sum(int(job.get("page_count", 0)) for job in jobs), "correction_count": sum(int(job.get("correction_count", 0)) for job in jobs), "error_jobs": sum(job.get("status") == "error" for job in jobs)}


def engines() -> list[dict]:
    provider = os.getenv("OCR_PROVIDER", "qwen")
    return [{"id": provider, "label": provider.replace("_", " ").title(), "external": provider in {"openai", "azure_openai"}, "status": "configured" if configured() else "not_configured"}]


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    html = (BASE / "web" / "index.html").read_text(encoding="utf-8")
    data = json.dumps(state_payload(), ensure_ascii=False).replace("</", "<\\/")
    return html.replace('<script src="/web/i18n.js"></script>', f'<script>window.INTELLIDOC_DATA={data};</script><script src="/web/i18n.js"></script>')


@app.get("/jobs/{job_id}", response_class=HTMLResponse)
def report(job_id: str) -> str:
    job_or_404(job_id)
    html = (BASE / "web" / "index.html").read_text(encoding="utf-8")
    data = json.dumps({**state_payload(), "server_mode": True, "documents": store.read(job_id).get("documents", []), "jobs": [store.read(job_id)]}, ensure_ascii=False).replace("</", "<\\/")
    return html.replace('<script src="/web/i18n.js"></script>', f'<script>window.INTELLIDOC_DATA={data};</script><script src="/web/i18n.js"></script>')


@app.get("/api/state")
def state(page: int = 1, page_size: int = 25, status: str = "all", method: str = "all", query: str = ""):
    return state_payload(page, min(page_size, 100), status, method, query)


@app.post("/api/jobs")
async def create_job(request: Request):
    payload = await request.json()
    payload.setdefault("model", os.getenv("OCR_MODEL", ""))
    payload.setdefault("prompt_version", PROMPT_VERSION)
    try: return store.create(payload)
    except ValueError as exc: fail(400, str(exc))


@app.put("/api/jobs/{job_id}/files")
async def upload(job_id: str, request: Request, path: str = ""):
    job_or_404(job_id)
    try: return {"job": store.add_pdf(job_id, path, await request.body())}
    except ValueError as exc: fail(400, str(exc))


@app.post("/api/jobs/{job_id}/start")
def start(job_id: str):
    job = job_or_404(job_id)
    if job["uploaded_files"] != job["expected_files"]: fail(409, "upload_incomplete")
    if job["ocr_method"] in {"openai", "azure_openai"} and not job.get("cloud_data_confirmed"): fail(400, "cloud_data_confirmation_required")
    if not configured(): fail(503, "ocr_not_configured")
    try:
        from .tasks import dispatch
        dispatch(job_id)
    except Exception:
        fail(503, "worker_unavailable")
    return store.update(job_id, status="queued", report_url=f"/jobs/{job_id}")


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str): return public_job(job_or_404(job_id))


@app.post("/api/jobs/{job_id}/cancel")
def cancel(job_id: str): return public_job(store.cancel(job_id))


@app.post("/api/jobs/{job_id}/rerun")
async def rerun(job_id: str, request: Request):
    source = job_or_404(job_id)
    options = await request.json()
    new = store.create({**source, **options, "file_count": source["expected_files"], "prompt_version": PROMPT_VERSION})
    for pdf in (store.path(job_id) / "uploads").glob("*.pdf"):
        store.add_pdf(new["id"], pdf.name, pdf.read_bytes())
    return await start(new["id"])


@app.get("/api/engines")
def get_engines(): return {"engines": engines()}


@app.post("/api/engines/{engine_id}/check")
def check_engine(engine_id: str):
    if engine_id not in {item["id"] for item in engines()}: fail(404, "invalid_ocr_method")
    if not configured(): return {"id": engine_id, "status": "not_configured", "summary": "OCR provider is not configured."}
    return {"id": engine_id, "status": "configured", "summary": "Configuration is present."}


@app.post("/api/jobs/{job_id}/manual-crop")
async def manual_crop(job_id: str, request: Request):
    job = job_or_404(job_id); body = await request.json(); document = next((item for item in job.get("documents", []) if item.get("id") == body.get("document_id")), None)
    if not document: fail(404, "not_found")
    page_index = int(body.get("page_index", 0)); page = document.get("pages", [])[page_index] if page_index < len(document.get("pages", [])) else None
    rect = body.get("rect") or {}
    if not page or not all(float(rect.get(key, 0)) >= 0 for key in ("x", "y", "width", "height")) or float(rect.get("width", 0)) < 2 or float(rect.get("height", 0)) < 2: fail(400, "Invalid crop rectangle.")
    try:
        import fitz
        source = store.path(job_id) / "artifacts" / document["id"] / f"page-{page_index + 1}.png"
        image = fitz.Pixmap(str(source)); crop = fitz.Pixmap(image, fitz.Rect(float(rect["x"]), float(rect["y"]), float(rect["x"] + rect["width"]), float(rect["y"] + rect["height"])))
        target = store.path(job_id) / "artifacts" / document["id"] / f"crop-{body.get('field', 'field')}-{page_index + 1}.png"; crop.save(str(target))
    except Exception: fail(404, "Page image was not found in this job.")
    return {"crop_image": f"/api/jobs/{job_id}/artifacts/{document['id']}/{target.name}", "evidence_source": "manual_crop", "evidence_status": "trusted", "bbox": rect, "page_index": page_index}


@app.post("/api/jobs/{job_id}/corrections")
async def corrections(job_id: str, request: Request):
    job = job_or_404(job_id); body = await request.json(); items = body.get("corrections")
    if not isinstance(items, list): fail(400, "Corrections must be a list.")
    for item in items:
        if item.get("field") not in FIELDS: fail(400, "invalid_field")
    path = store.path(job_id) / "corrections" / f"{now().replace(':', '-')}.json"
    path.write_text(json.dumps({"actor": "anonymous", "timestamp": now(), "document_id": body.get("document_id"), "corrections": items}, ensure_ascii=False, indent=2), encoding="utf-8")
    job = store.update(job_id, correction_count=int(job.get("correction_count", 0)) + len(items))
    return {"saved_count": len(items), "job": public_job(job), "document_status": {"review_status": {"value": "approved", "risk_count": 0}, "approved": True, "last_saved_at": now()}}


@app.post("/api/jobs/delete-preview")
async def delete_preview(request: Request):
    jobs = [job_or_404(job_id) for job_id in (await request.json()).get("job_ids", [])]
    return {"deletable": [{"id": job["id"], "name": job.get("upload_name") or job["id"]} for job in jobs if job.get("status") in TERMINAL], "skipped": [{"id": job["id"]} for job in jobs if job.get("status") not in TERMINAL]}


@app.post("/api/jobs/bulk-delete")
async def bulk_delete(request: Request):
    deleted, skipped, failed = [], [], []
    for job_id in (await request.json()).get("job_ids", []):
        try:
            if store.read(job_id).get("status") not in TERMINAL: skipped.append(job_id); continue
            store.delete(job_id); deleted.append(job_id)
        except Exception: failed.append(job_id)
    return {"deleted": deleted, "skipped": skipped, "failed": failed}


@app.get("/api/jobs/{job_id}/artifacts/{path:path}")
def artifact(job_id: str, path: str):
    root = store.path(job_id) / "artifacts"; target = (root / path).resolve()
    if root.resolve() not in target.parents or not target.is_file(): fail(404, "not_found")
    return FileResponse(target)


@app.get("/api/system-metrics")
def system_metrics(): return {"cpu_percent": None, "memory_percent": None, "gpu": None}
