"""Durable TT05 code catalog."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


SEED = (
    ("reserve_mode", "0", "No", "không", 0),
    ("reserve_mode", "1", "Yes", "có", 1),
    ("use_mode", "01", "Public", "công khai", 0),
    ("use_mode", "02", "Conditional access", "điều kiện,hạn chế", 1),
    ("use_mode", "03", "Restricted", "mật,bí mật", 2),
    ("doc_type", "TB", "NOTICE", "thông báo,tb", 1),
    ("doc_type", "QD", "DECISION", "quyết định,qd", 2),
    ("doc_type", "CV", "OFFICIAL LETTER", "công văn,cv", 3),
    ("confidence", "H", "High", "cao,>=0.9", 0),
    ("language", "vie", "Vietnamese", "vi,vie,tiếng việt", 0),
    ("retention", "VV", "Permanent", "vĩnh viễn,vv", 0),
    ("physical_status", "T", "Good", "tốt,rõ", 0),
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class CodeCatalog:
    """Expose CRUD while hiding atomic JSON persistence and revision checks."""

    def __init__(self, root: str | Path) -> None:
        self.path = Path(root) / "_codes.json"
        # ponytail: process-local lock; add cross-process locking only with multiple backend writers.
        self._lock = Lock()

    def read(self) -> dict[str, Any]:
        with self._lock:
            return self._read()

    def create(self, item: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            catalog = self._read()
            if any(entry["code"] == item["code"] for entry in catalog["items"]):
                raise ValueError("code_exists")
            stamp = now()
            catalog["items"].append({**item, "created_at": stamp, "updated_at": stamp})
            return self._commit(catalog)

    def update(self, code: str, revision: int, changes: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            catalog = self._checked(revision)
            item = next((item for item in catalog["items"] if item["code"] == code), None)
            if item is None:
                raise ValueError("code_not_found")
            item.update(changes, updated_at=now())
            return self._commit(catalog)

    def delete(self, code: str, revision: int) -> dict[str, Any]:
        with self._lock:
            catalog = self._checked(revision)
            items = [item for item in catalog["items"] if item["code"] != code]
            if len(items) == len(catalog["items"]):
                raise ValueError("code_not_found")
            catalog["items"] = items
            return self._commit(catalog)

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            stamp = now()
            return self._write({
                "revision": 0,
                "items": [
                    {"group": group, "code": code, "label": label, "keywords": keywords,
                     "order": order, "active": True, "created_at": stamp, "updated_at": stamp}
                    for group, code, label, keywords, order in SEED
                ],
            })
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data.get("revision"), int) or not isinstance(data.get("items"), list):
                raise ValueError
            return data
        except (OSError, json.JSONDecodeError, AttributeError, ValueError) as exc:
            raise ValueError("catalog_corrupt") from exc

    def _checked(self, revision: int) -> dict[str, Any]:
        catalog = self._read()
        if catalog["revision"] != revision:
            raise ValueError("catalog_conflict")
        return catalog

    def _commit(self, catalog: dict[str, Any]) -> dict[str, Any]:
        catalog["revision"] += 1
        return self._write(catalog)

    def _write(self, catalog: dict[str, Any]) -> dict[str, Any]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(dir=self.path.parent, prefix=".codes-", suffix=".json")
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump(catalog, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        return catalog
