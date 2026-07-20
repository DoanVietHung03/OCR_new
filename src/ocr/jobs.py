"""Durable filesystem state for OCR jobs."""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

MAX_FILES = 15
MAX_BYTES = 200 * 1024 * 1024
MAX_PAGES = 100
TERMINAL = {"completed", "completed_with_warnings", "error", "cancelled", "interrupted"}
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

    def read(self, job_id: str) -> dict:
        try:
            with self.path(job_id).joinpath("job.json").open(encoding="utf-8") as handle:
                return json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            raise FileNotFoundError(job_id) from exc

    def write(self, job_id: str, data: dict) -> dict:
        path = self.path(job_id) / "job.json"
        fd, temp_name = tempfile.mkstemp(dir=path.parent, prefix=".job-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temp_name, path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)
        return data

    def update(self, job_id: str, **changes) -> dict:
        with self.locked(job_id):
            job = self.read(job_id)
            job.update(changes)
            job["updated_at"] = now()
            return self.write(job_id, job)

    def create(self, options: dict) -> dict:
        method = options.get("ocr_method", "qwen")
        if method not in {"qwen", "openai", "azure_openai"}:
            raise ValueError("invalid_ocr_method")
        count = int(options.get("file_count", 0))
        if not 1 <= count <= MAX_FILES:
            raise ValueError("job_quota_exceeded")
        job_id = str(uuid.uuid4())
        path = self.root / job_id
        path.mkdir()
        for name in ("uploads", "artifacts", "corrections"):
            (path / name).mkdir()
        job = {
            "id": job_id, "status": "uploading", "created_at": now(), "updated_at": now(),
            "ocr_method": method, "model": options.get("model", ""),
            "prompt_version": "1", "expected_files": count, "uploaded_files": 0,
            "upload_name": str(options.get("upload_name", "")), "documents": [], "logs": [],
            "correction_count": 0, "page_count": 0, "failed_pages": 0,
            "vlm_task": options.get("vlm_task", "full_ocr"),
            "vlm_pages": options.get("vlm_pages", "all"),
            "vlm_max_pages": int(options.get("vlm_max_pages", 0) or 0),
            "cloud_data_confirmed": bool(options.get("cloud_data_confirmed")),
        }
        self.write(job_id, job)
        return job

    def add_pdf(self, job_id: str, relative_path: str, content: bytes) -> dict:
        name = safe_name(relative_path)
        if not content or len(content) > MAX_BYTES or not content.startswith(b"%PDF"):
            raise ValueError("unsupported_file")
        with self.locked(job_id):
            job = self.read(job_id)
            if job["status"] != "uploading":
                raise ValueError("job_already_started")
            target = self.path(job_id) / "uploads" / name
            if target.exists():
                raise ValueError("duplicate_upload_path")
            if job["uploaded_files"] >= MAX_FILES or sum(p.stat().st_size for p in target.parent.iterdir()) + len(content) > MAX_BYTES:
                raise ValueError("job_quota_exceeded")
            target.write_bytes(content)
            job["uploaded_files"] += 1
            job["status"] = "ready" if job["uploaded_files"] == job["expected_files"] else "uploading"
            job["updated_at"] = now()
            return self.write(job_id, job)

    def cancel(self, job_id: str) -> dict:
        self.path(job_id).joinpath("cancel").touch()
        job = self.read(job_id)
        if job["status"] in {"uploading", "ready", "queued", "running", "starting"}:
            return self.update(job_id, status="cancelling")
        return job

    def delete(self, job_id: str) -> None:
        shutil.rmtree(self.path(job_id))

    def list(self) -> list[dict]:
        jobs = []
        for path in self.root.iterdir():
            if path.is_dir():
                try:
                    jobs.append(self.read(path.name))
                except FileNotFoundError:
                    pass
        return sorted(jobs, key=lambda job: job.get("created_at", ""), reverse=True)
