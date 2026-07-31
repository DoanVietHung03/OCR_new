#!/usr/bin/env python3
"""One-time, standalone migration from the mistaken qwen label to minimax."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

OLD_PROVIDER = "qwen"
NEW_PROVIDER = "minimax"
MODEL = "MiniMax-M3"
IDENTITY_KEYS = {"ocr_method", "provider", "provider_profile_id"}


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def replace_identity(value: Any) -> int:
    changed = 0
    if isinstance(value, dict):
        for key, item in value.items():
            if key in IDENTITY_KEYS and item == OLD_PROVIDER:
                value[key] = NEW_PROVIDER
                changed += 1
            else:
                changed += replace_identity(item)
    elif isinstance(value, list):
        for item in value:
            changed += replace_identity(item)
    return changed


def operation_paths(root: Path) -> list[Path]:
    return sorted(
        [
            *root.glob("*/provider_operations/*.json"),
            *(root / "_sizing" / "system_operations").glob("*.json"),
            *(root / "_sizing" / "rollups").glob("*.json"),
            *(root / "_sizing" / "snapshots").glob("*.json"),
        ]
    )


def plan(root: Path) -> tuple[dict[Path, dict[str, Any]], int, str | None, list[str]]:
    updates: dict[Path, dict[str, Any]] = {}
    replacements = 0
    earliest: str | None = None
    warnings: list[str] = []

    paths = [*root.glob("*/job.json"), *operation_paths(root)]
    for path in sorted(set(paths)):
        value = load(path)
        is_old_operation = (
            path.name != "job.json"
            and value.get("provider_profile_id") == OLD_PROVIDER
            and value.get("model") == MODEL
        )
        changed = replace_identity(value)
        if changed:
            updates[path] = value
            replacements += changed
        if is_old_operation and value.get("started_at"):
            started_at = str(value["started_at"])
            earliest = min(earliest, started_at) if earliest else started_at

    catalog_path = root / "_sizing.json"
    if catalog_path.exists():
        catalog = load(catalog_path)
        before = json.dumps(catalog, sort_keys=True)
        replacements += replace_identity(catalog)
        profiles = [
            item
            for item in catalog.get("price_profiles", [])
            if item.get("provider_profile_id") == NEW_PROVIDER
            and item.get("model") == MODEL
            and not item.get("archived")
        ]
        if len(profiles) > 1:
            latest = max(
                profiles,
                key=lambda item: (
                    str(item.get("price_fetched_at") or item.get("effective_from") or ""),
                    str(item.get("id", "")),
                ),
            )
            for profile in profiles:
                if profile is not latest:
                    profile["archived"] = True
            profiles = [latest]
        if earliest and profiles:
            profile = profiles[0]
            if str(profile.get("effective_from", "")) > earliest:
                profile["effective_from"] = earliest
        elif earliest:
            warnings.append(
                f"No active {NEW_PROVIDER}/{MODEL} price profile; Known cost will remain unavailable."
            )
        if json.dumps(catalog, sort_keys=True) != before:
            catalog["revision"] = int(catalog.get("revision", 0)) + 1
            updates[catalog_path] = catalog
    elif earliest:
        warnings.append("No _sizing.json catalog; Known cost will remain unavailable.")

    return updates, replacements, earliest, warnings


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_atomic(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f".{path.name}.qwen-to-minimax.tmp")
    try:
        temporary.write_text(
            json.dumps(value, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def apply(root: Path, updates: dict[Path, dict[str, Any]], backup: Path) -> None:
    if backup.exists():
        raise FileExistsError(f"Backup already exists: {backup}")
    backup.mkdir(parents=True)
    manifest: list[dict[str, str]] = []
    written: list[Path] = []

    try:
        for path in updates:
            relative = path.relative_to(root)
            target = backup / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            manifest.append({"path": str(relative), "sha256": digest(path)})
        (backup / "manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        for path, value in updates.items():
            write_atomic(path, value)
            written.append(path)
    except Exception:
        for path in written:
            shutil.copy2(backup / path.relative_to(root), path)
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", type=Path, help="Mounted OCR_DATA_DIR, usually /data/jobs")
    parser.add_argument("--apply", action="store_true", help="Write changes; default is dry-run")
    args = parser.parse_args()
    root = args.data_dir.resolve()
    if not root.is_dir():
        parser.error(f"Data directory does not exist: {root}")

    updates, replacements, earliest, warnings = plan(root)
    print(f"Mode: {'APPLY' if args.apply else 'DRY RUN'}")
    print(f"Files to update: {len(updates)}")
    print(f"Provider values to replace: {replacements}")
    print(f"Earliest migrated operation: {earliest or 'none'}")
    for warning in warnings:
        print(f"WARNING: {warning}")

    if not args.apply or not updates:
        return 0

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = root / "_migration_backups" / f"qwen-to-minimax-{stamp}"
    apply(root, updates, backup)
    remaining = plan(root)[1]
    if remaining:
        raise RuntimeError(f"Verification failed: {remaining} qwen values remain")
    print(f"Updated successfully. Backup: {backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
