"""Durable filesystem state and state transitions for OCR jobs."""

from __future__ import annotations

import copy
import json
import os
import re
import shutil
import tempfile
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

from .field_policy import ADMIN_FIELDS, COVER_FIELDS, annotate

MAX_FILES = 15
MAX_BYTES = 200 * 1024 * 1024
MAX_PAGES = 100
TERMINAL = {"completed", "completed_with_warnings", "error", "cancelled", "interrupted"}
ACTIVE = {"starting", "queued", "running", "cancelling", "segmenting", "extraction_starting"}
DELETABLE = TERMINAL | {"uploading", "ready"}
FIELDS = ADMIN_FIELDS + COVER_FIELDS + ("document_type",)
RETRYABLE_ERRORS = {"provider_timeout", "provider_unavailable", "worker_interrupted"}


class ApprovalBlocked(ValueError):
    def __init__(self, blockers: list[dict[str, Any]]) -> None:
        super().__init__("approval_blocked")
        self.blockers = blockers


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def failure(code: str, page_index: int | None = None) -> dict[str, Any]:
    retryable = code in RETRYABLE_ERRORS
    return {"code": code, "retryable": retryable, "operator_hint": "rerun_job" if retryable else "inspect_logs", "page_index": page_index}


def atomic_json(path: Path, data: dict[str, Any]) -> None:
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.stem}-", suffix=".json")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        for attempt in range(5):
            try:
                os.replace(temporary, path)
                return
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.01 * (attempt + 1))
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def safe_name(value: str) -> str:
    value = value.replace("\\", "/")
    if not value or value.startswith("/") or ".." in Path(value).parts:
        raise ValueError("invalid_path")
    name = Path(value).name
    if not name or Path(name).suffix.lower() != ".pdf":
        raise ValueError("unsupported_file")
    return name


def validate_pdf(content: bytes) -> None:
    if not content or len(content) > MAX_BYTES or not content.startswith(b"%PDF"):
        raise ValueError("unsupported_file")
    try:
        import fitz

        with fitz.open(stream=content, filetype="pdf") as document:
            if document.needs_pass:
                raise ValueError("encrypted_pdf")
            if not 1 <= len(document) <= MAX_PAGES:
                raise ValueError("pdf_page_limit_exceeded")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("invalid_pdf") from exc


def validate_segments(page_count: int, segments: list[dict[str, Any]]) -> None:
    ordered = sorted(segments, key=lambda item: (item["start_page"], item["end_page"]))
    pages = [page for item in ordered for page in range(item["start_page"], item["end_page"] + 1)]
    if any(item["end_page"] < item["start_page"] for item in ordered) or pages != list(range(page_count)):
        raise ValueError("invalid_segmentation")
    kinds = [item["logical_document_type"] for item in ordered]
    if "unclassified" in kinds:
        raise ValueError("invalid_segmentation")


def materialize_documents(job_id: str, sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents = []
    for source in sources:
        for index, segment in enumerate(source["confirmed_segments"], 1):
            kind = segment["logical_document_type"]
            if kind == "excluded":
                continue
            document_id = f"{source['id']}-document-{index}"
            pages = [{
                "page_index": page_index,
                "source_page_index": source_page_index,
                "source_pdf_id": source["id"],
                "image_url": f"/api/jobs/{job_id}/artifacts/{source['id']}/page-{source_page_index + 1}.png",
                "ocr_scope": "none", "status": "pending", "error": "",
            } for page_index, source_page_index in enumerate(range(segment["start_page"], segment["end_page"] + 1))]
            documents.append(annotate({
                "id": document_id, "file_name": source["file_name"], "status": "pending", "fields": {},
                "pages": pages, "logical_document_type": kind, "source_pdf_id": source["id"],
            }))
    return documents


class JobStore:
    def __init__(self, root: str | Path = "data/jobs") -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, Lock] = {}
        self._locks_guard = Lock()

    def _lock(self, job_id: str) -> Lock:
        with self._locks_guard:
            return self._locks.setdefault(job_id, Lock())

    def path(self, job_id: str) -> Path:
        if not re.fullmatch(r"[a-f0-9-]{36}", job_id):
            raise ValueError("not_found")
        path = self.root / job_id
        if not path.is_dir():
            raise FileNotFoundError(job_id)
        return path

    @contextmanager
    def locked(self, job_id: str):
        with self._lock(job_id):
            yield

    def read(self, job_id: str) -> dict[str, Any]:
        try:
            return json.loads((self.path(job_id) / "job.json").read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            raise FileNotFoundError(job_id) from exc

    def write(self, job_id: str, data: dict[str, Any]) -> dict[str, Any]:
        target = self.path(job_id) / "job.json"
        previous_status = None
        if target.exists():
            try:
                previous_status = json.loads(target.read_text(encoding="utf-8")).get("status")
            except (OSError, json.JSONDecodeError):
                pass
        current_status = data.get("status")
        if previous_status and current_status and previous_status != current_status:
            severity = "error" if current_status in {"error", "interrupted"} else "warning" if current_status in {"cancelled", "cancelling", "completed_with_warnings"} else "info"
            data.setdefault("events", []).append({
                "timestamp": now(), "code": "job_status_changed", "category": "lifecycle",
                "severity": severity, "status": current_status,
            })
        atomic_json(target, data)
        return data

    def update(self, job_id: str, **changes: Any) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            job.update(changes)
            job["updated_at"] = now()
            return self.write(job_id, job)

    def create(self, options: dict[str, Any]) -> dict[str, Any]:
        count = int(options.get("file_count", 0))
        if not 1 <= count <= MAX_FILES:
            raise ValueError("job_quota_exceeded")
        job_id = str(uuid.uuid4())
        path = self.root / job_id
        path.mkdir()
        for name in ("uploads", "artifacts", "corrections"):
            (path / name).mkdir()
        stamp = now()
        job = {
            "id": job_id,
            "status": "uploading",
            "created_at": stamp,
            "updated_at": stamp,
            "ocr_method": options.get("provider", options.get("ocr_method", "qwen")),
            "provider_profile_id": options.get("provider_profile_id", options.get("provider", "qwen")),
            "provider": options.get("provider", options.get("ocr_method", "qwen")),
            "model": options.get("model", ""),
            "prompt_version": str(options.get("prompt_version", "3")),
            "endpoint_external": bool(options.get("endpoint_external", True)),
            "expected_files": count,
            "uploaded_files": 0,
            "upload_name": str(options.get("upload_name", "")),
            "documents": [],
            "logs": [],
            "correction_count": 0,
            "page_count": 0,
            "failed_pages": 0,
            "vlm_task": options.get("vlm_task", "full_ocr"),
            "vlm_pages": options.get("vlm_pages", "all"),
            "vlm_max_pages": int(options.get("vlm_max_pages", 0) or 0),
            "cloud_data_confirmed": bool(options.get("cloud_data_confirmed")),
            "processing_mode": options.get("processing_mode", "administrative_document"),
            "source_pdfs": [],
            "source_pdf_count": 0,
            "dossier_cover_count": 0,
            "administrative_document_count": 0,
            "excluded_page_count": 0,
            "segmentation_completed_pages": 0,
            "segmentation_total_pages": 0,
            "progress_stage": "",
            "progress_detail": "",
            "completed_pages": 0,
            "total_pages": 0,
            "failure": None,
            "events": [],
        }
        return self.write(job_id, job)

    def add_pdf(self, job_id: str, relative_path: str, content: bytes) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job["status"] != "uploading":
                raise ValueError("job_already_started")
            try:
                name = safe_name(relative_path)
                validate_pdf(content)
                target = self.path(job_id) / "uploads" / name
                if target.exists():
                    raise ValueError("duplicate_upload_path")
                current_bytes = sum(path.stat().st_size for path in target.parent.iterdir())
                if job["uploaded_files"] >= MAX_FILES or current_bytes + len(content) > MAX_BYTES:
                    raise ValueError("job_quota_exceeded")
            except ValueError as exc:
                code = str(exc)
                job.update(status="error", error=code, failure=failure(code), progress_stage="failed", updated_at=now())
                self.write(job_id, job)
                raise
            target.write_bytes(content)
            source_id = f"source-{job['uploaded_files'] + 1}" if job.get("processing_mode") == "combined_dossier" else Path(name).stem
            job.setdefault("source_pdfs", []).append({
                "id": source_id, "file_name": name, "page_count": 0,
                "pages": [], "proposal": [], "confirmed_segments": [], "revision": 0, "confirmed": False,
            })
            job["uploaded_files"] += 1
            job["source_pdf_count"] = len(job["source_pdfs"])
            job["status"] = "ready" if job["uploaded_files"] == job["expected_files"] else "uploading"
            job["updated_at"] = now()
            return self.write(job_id, job)

    def begin_start(self, job_id: str) -> tuple[dict[str, Any], bool]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job["status"] != "ready":
                return job, False
            if job["uploaded_files"] != job["expected_files"]:
                raise ValueError("upload_incomplete")
            job.update(status="starting", report_url=f"/jobs/{job_id}", updated_at=now())
            return self.write(job_id, job), True

    def confirm_segmentation(
        self, job_id: str, source_pdf_id: str, revision: int, segments: list[dict[str, Any]]
    ) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") != "awaiting_segmentation_review":
                raise ValueError("segmentation_not_reviewable")
            source = next((item for item in job.get("source_pdfs", []) if item.get("id") == source_pdf_id), None)
            if source is None:
                raise ValueError("not_found")
            if source.get("revision", 0) != revision:
                raise ValueError("segmentation_conflict")
            validate_segments(source.get("page_count", 0), segments)
            source.update(confirmed_segments=segments, confirmed=True, revision=revision + 1)
            if all(item.get("confirmed") for item in job.get("source_pdfs", [])):
                documents = materialize_documents(job_id, job["source_pdfs"])
                kinds = [item["logical_document_type"] for item in documents]
                if kinds.count("dossier_cover") != 1 or "administrative_document" not in kinds:
                    raise ValueError("invalid_segmentation")
                job["documents"] = documents
                job["dossier_cover_count"] = sum(item["logical_document_type"] == "dossier_cover" for item in job["documents"])
                job["administrative_document_count"] = len(job["documents"]) - job["dossier_cover_count"]
                job["excluded_page_count"] = sum(
                    segment["end_page"] - segment["start_page"] + 1
                    for item in job["source_pdfs"] for segment in item["confirmed_segments"]
                    if segment["logical_document_type"] == "excluded"
                )
                job["status"] = "segmentation_confirmed"
            job["updated_at"] = now()
            return self.write(job_id, job)

    def begin_extraction(self, job_id: str) -> tuple[dict[str, Any], bool]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") != "segmentation_confirmed":
                return job, False
            job.update(status="extraction_starting", updated_at=now())
            return self.write(job_id, job), True

    def add_event(self, job_id: str, code: str, **details: Any) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            job.setdefault("events", []).append({"timestamp": now(), "code": code, **details})
            job["updated_at"] = now()
            return self.write(job_id, job)

    def interrupt(self, job_id: str) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") in ACTIVE:
                stamp = now()
                job.update(
                    status="interrupted", error="worker_interrupted", failure=failure("worker_interrupted"),
                    progress_stage="failed", updated_at=stamp, completed_at=stamp,
                )
                self.write(job_id, job)
            return job

    def cancel(self, job_id: str) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") in TERMINAL:
                return job
            self.path(job_id).joinpath("cancel").touch()
            if job.get("status") in {"uploading", "ready", "awaiting_segmentation_review", "segmentation_confirmed"}:
                stamp = now()
                job.update(status="cancelled", progress_stage="cancelled", updated_at=stamp, completed_at=stamp)
                return self.write(job_id, job)
            job.update(status="cancelling", updated_at=now())
            return self.write(job_id, job)

    def apply_review(
        self, job_id: str, document_id: str, corrections: list[dict[str, Any]]
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") not in TERMINAL:
                raise ValueError("job_not_terminal")
            document = next((item for item in job.get("documents", []) if item.get("id") == document_id), None)
            if document is None:
                raise ValueError("not_found")
            projected = copy.deepcopy(document)
            allowed = set(projected.get("expected_fields") or FIELDS)
            for correction in corrections:
                name = correction.get("field")
                field = projected.get("fields", {}).get(name)
                if name not in allowed or (field is None and not projected.get("expected_fields")):
                    raise ValueError("invalid_field")
                if isinstance(field.get("value") if field else None, (dict, list)):
                    raise ValueError("invalid_field")
                if (field.get("value") if field else None) != correction.get("old_value"):
                    raise ValueError("correction_conflict")
                if isinstance(correction.get("new_value"), (dict, list)):
                    raise ValueError("invalid_field")
            stamp = now()
            for correction in corrections:
                field = projected.setdefault("fields", {}).setdefault(correction["field"], {"value": None})
                field.setdefault("ocr_value", field.get("value"))
                field["value"] = correction.get("new_value", "")
                field["corrected_value"] = field["value"]
                field["corrected_at"] = stamp
                field.update(method="manual", needs_review=False)
            annotate(
                projected,
                segmentation_confirmed=job.get("processing_mode") != "combined_dossier" or all(
                    source.get("confirmed") for source in job.get("source_pdfs", [])
                ),
            )
            if projected.get("approval_blockers"):
                raise ApprovalBlocked(projected["approval_blockers"])
            projected["review_status"] = "approved"
            projected["approved_at"] = stamp
            document.clear()
            document.update(projected)
            job["correction_count"] = int(job.get("correction_count", 0)) + len(corrections)
            job["updated_at"] = stamp
            audit = {
                "actor": "anonymous",
                "timestamp": stamp,
                "document_id": document_id,
                "action": "correction" if corrections else "approval",
                "schema_version": "1",
                "corrections": corrections,
            }
            audit_path = self.path(job_id) / "corrections" / f"{stamp.replace(':', '-')}-{uuid.uuid4().hex}.json"
            atomic_json(audit_path, audit)
            export = {
                "schema_version": "1", "job_id": job_id, "document_id": document_id,
                "approved_at": stamp, "logical_document_type": document.get("logical_document_type"),
                "fields": {
                    name: {key: field.get(key) for key in ("value", "method", "confidence", "page_index", "corrected_at") if field.get(key) is not None}
                    for name, field in document.get("fields", {}).items()
                    if name in allowed and isinstance(field, dict) and not isinstance(field.get("value"), (dict, list))
                },
            }
            export_dir = self.path(job_id) / "artifacts" / re.sub(r"[^A-Za-z0-9._-]", "_", document_id)
            export_dir.mkdir(exist_ok=True)
            atomic_json(export_dir / "corrected.json", export)
            document["corrected_artifact"] = f"/api/jobs/{job_id}/artifacts/{export_dir.name}/corrected.json"
            if corrections:
                job.setdefault("events", []).append({
                    "timestamp": stamp, "code": "document_corrected", "category": "review",
                    "document_id": document_id,
                })
            job.setdefault("events", []).append({
                "timestamp": stamp, "code": "document_approved", "category": "review",
                "document_id": document_id,
            })
            return self.write(job_id, job), document

    def add_crop_evidence(self, job_id: str, document_id: str, evidence: dict[str, Any]) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") not in TERMINAL:
                raise ValueError("job_not_terminal")
            document = next((item for item in job.get("documents", []) if item.get("id") == document_id), None)
            if document is None:
                raise ValueError("not_found")
            document.setdefault("crop_evidence", []).append(evidence)
            job.setdefault("events", []).append({
                "timestamp": evidence["created_at"], "code": "manual_crop_created", "category": "review",
                "document_id": document_id, "page_index": evidence.get("page_index"),
            })
            job["updated_at"] = now()
            self.write(job_id, job)
            return evidence

    def delete(self, job_id: str) -> None:
        with self.locked(job_id):
            if self.read(job_id).get("status") not in DELETABLE:
                raise ValueError("job_active")
            shutil.rmtree(self.path(job_id))

    def list(self) -> list[dict[str, Any]]:
        jobs = []
        for path in self.root.iterdir():
            if path.is_dir():
                try:
                    jobs.append(self.read(path.name))
                except FileNotFoundError:
                    pass
        return sorted(jobs, key=lambda job: job.get("created_at", ""), reverse=True)
