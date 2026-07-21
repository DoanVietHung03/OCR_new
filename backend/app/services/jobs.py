"""Durable filesystem state and state transitions for OCR jobs."""

from __future__ import annotations

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

MAX_FILES = 15
MAX_BYTES = 200 * 1024 * 1024
MAX_PAGES = 100
TERMINAL = {"completed", "completed_with_warnings", "error", "cancelled", "interrupted"}
ACTIVE = {"starting", "queued", "running", "cancelling"}
DELETABLE = TERMINAL | {"uploading", "ready"}
FIELDS = (
    "co_quan_ban_hanh", "quoc_hieu_tieu_ngu", "so_van_ban", "dia_diem_ban_hanh",
    "ngay_ban_hanh", "loai_van_ban", "trich_yeu", "quyen_han_ky_thay",
    "chuc_vu_nguoi_ky", "nguoi_ky", "ma_luu_tru", "co_quan_luu_tru", "nhiem_ky",
    "tieu_de_ho_so", "hop_so", "phong_so", "muc_luc_so", "bat_dau", "ho_so_dvbq",
    "ket_thuc", "so_tai_lieu", "thoi_han_bao_quan", "so_trang", "document_type",
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        path = self.path(job_id) / "job.json"
        descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=".job-", suffix=".json")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            for attempt in range(5):
                try:
                    os.replace(temporary, path)
                    break
                except PermissionError:
                    if attempt == 4:
                        raise
                    time.sleep(0.01 * (attempt + 1))
            return data
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

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
                job.update(status="error", error=str(exc), updated_at=now())
                self.write(job_id, job)
                raise
            target.write_bytes(content)
            job["uploaded_files"] += 1
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

    def interrupt(self, job_id: str) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") in ACTIVE:
                stamp = now()
                job.update(status="interrupted", error="worker_interrupted", updated_at=stamp, completed_at=stamp)
                self.write(job_id, job)
            return job

    def cancel(self, job_id: str) -> dict[str, Any]:
        with self.locked(job_id):
            job = self.read(job_id)
            if job.get("status") in TERMINAL:
                return job
            self.path(job_id).joinpath("cancel").touch()
            if job.get("status") in {"uploading", "ready"}:
                stamp = now()
                job.update(status="cancelled", updated_at=stamp, completed_at=stamp)
                return self.write(job_id, job)
            return {**job, "status": "cancelling"}

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
            for correction in corrections:
                name = correction.get("field")
                field = document.get("fields", {}).get(name)
                if name not in FIELDS or field is None:
                    raise ValueError("invalid_field")
                if field.get("value", "") != correction.get("old_value", ""):
                    raise ValueError("correction_conflict")
            stamp = now()
            for correction in corrections:
                field = document["fields"][correction["field"]]
                field.setdefault("ocr_value", field.get("value", ""))
                field["value"] = correction.get("new_value", "")
                field["corrected_value"] = field["value"]
                field["corrected_at"] = stamp
            document["review_status"] = "approved"
            document["approved_at"] = stamp
            job["correction_count"] = int(job.get("correction_count", 0)) + len(corrections)
            job["updated_at"] = stamp
            audit = {
                "actor": "anonymous",
                "timestamp": stamp,
                "document_id": document_id,
                "action": "correction" if corrections else "approval",
                "corrections": corrections,
            }
            audit_path = self.path(job_id) / "corrections" / f"{stamp.replace(':', '-')}-{uuid.uuid4().hex}.json"
            audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
