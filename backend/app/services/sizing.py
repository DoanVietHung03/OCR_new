"""Durable token, cost, sizing, retention, and snapshot state."""

from __future__ import annotations

import hashlib
import json
import math
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def checksum(payload: Any) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def non_negative_int(value: Any) -> int | None:
    return value if type(value) is int and value >= 0 else None


def parse_usage(payload: Any) -> tuple[str, dict[str, int | None] | None]:
    usage = payload.get("usage") if isinstance(payload, dict) else None
    if not isinstance(usage, dict):
        return "unavailable", None
    prompt = non_negative_int(usage.get("prompt_tokens"))
    completion = non_negative_int(usage.get("completion_tokens"))
    reported = non_negative_int(usage.get("total_tokens"))
    prompt_details = usage.get("prompt_tokens_details")
    completion_details = usage.get("completion_tokens_details")
    cached = non_negative_int(prompt_details.get("cached_tokens")) if isinstance(prompt_details, dict) and "cached_tokens" in prompt_details else None
    reasoning = non_negative_int(completion_details.get("reasoning_tokens")) if isinstance(completion_details, dict) and "reasoning_tokens" in completion_details else None
    invalid_optional = (
        isinstance(prompt_details, dict) and "cached_tokens" in prompt_details and cached is None
        or isinstance(completion_details, dict) and "reasoning_tokens" in completion_details and reasoning is None
    )
    if prompt is None or completion is None or invalid_optional or cached is not None and cached > prompt:
        return "incomplete", {
            "prompt_tokens": prompt, "completion_tokens": completion,
            "reported_total_tokens": reported, "canonical_total_tokens": None,
            "cached_tokens": cached, "reasoning_tokens": reasoning,
        }
    canonical = prompt + completion
    return ("inconsistent" if reported is not None and reported != canonical else "complete"), {
        "prompt_tokens": prompt, "completion_tokens": completion,
        "reported_total_tokens": reported, "canonical_total_tokens": canonical,
        "cached_tokens": cached, "reasoning_tokens": reasoning,
    }


def nearest_rank(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[max(0, math.ceil(percentile * len(ordered)) - 1)]


class MeasurementStore:
    def __init__(self, root: str | Path, *, recover: bool = True) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        if recover:
            self.recover()

    def operation_dir(self, job_id: str | None) -> Path:
        return self.root / job_id / "provider_operations" if job_id else self.root / "_sizing" / "system_operations"

    def begin(self, context: dict[str, Any], *, operation_id: str, attempt: int, request_bytes: int) -> Path:
        record = {
            "schema_version": 1, "operation_id": operation_id, "attempt": attempt,
            "scope": "job" if context.get("job_id") else "system",
            **{key: context.get(key) for key in (
                "job_id", "provider_profile_id", "provider_config_version", "model", "task",
                "processing_mode", "source_pdf_id", "document_id", "page_index",
                "segmentation_revision", "measurement_fingerprint",
            )},
            "status": "in_progress", "started_at": utc_now(), "duration_ms": None,
            "retry_delay_ms": 0, "request_bytes": request_bytes, "response_bytes": None,
            "http_status": None, "retryable": False, "usage_status": "unavailable",
            "usage": None, "billing_state": "unknown",
        }
        target = self.operation_dir(context.get("job_id")) / f"{operation_id}-{attempt}.json"
        atomic_json(target, record)
        return target

    def finish(self, target: Path, **updates: Any) -> dict[str, Any]:
        record = json.loads(target.read_text(encoding="utf-8"))
        record.update(updates)
        atomic_json(target, record)
        return record

    def recover(self) -> int:
        count = 0
        paths = [*self.root.glob("*/provider_operations/*.json"), *self.operation_dir(None).glob("*.json")]
        for path in paths:
            try:
                record = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if record.get("status") == "in_progress":
                record.update(status="interrupted", usage_status="unavailable", usage=None, billing_state="unknown")
                atomic_json(path, record)
                count += 1
        return count

    def operations(self, *, job_id: str | None = None) -> list[dict[str, Any]]:
        paths = self.operation_dir(job_id).glob("*.json") if job_id else [
            *self.root.glob("*/provider_operations/*.json"), *self.operation_dir(None).glob("*.json"),
        ]
        records = []
        for path in paths:
            try:
                records.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                continue
        return sorted(records, key=lambda item: (str(item.get("started_at", "")), int(item.get("attempt", 0))), reverse=True)

    def rollup_job(self, job_id: str) -> None:
        operations = self.operations(job_id=job_id)
        if not operations:
            return
        payload = {
            "schema_version": 1,
            **aggregate(operations, sample_count=1),
            "job_id": job_id, "provider_profile_id": operations[0].get("provider_profile_id"),
            "processing_mode": operations[0].get("processing_mode"),
            "started_at": min(item.get("started_at", "") for item in operations),
        }
        atomic_json(self.root / "_sizing" / "rollups" / f"{job_id}.json", payload)

    def rollups(self) -> dict[str, dict[str, Any]]:
        result = {}
        for path in (self.root / "_sizing" / "rollups").glob("*.json"):
            try:
                item = json.loads(path.read_text(encoding="utf-8"))
                result[item["job_id"]] = item
            except (OSError, KeyError, json.JSONDecodeError):
                continue
        return result


class SizingCatalog:
    def __init__(self, root: str | Path) -> None:
        self.path = Path(root) / "_sizing.json"
        self.lock = Lock()

    def read(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"revision": 0, "price_profiles": [], "workload_profiles": [], "hardware_profiles": []}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def replace(self, revision: int, payload: dict[str, Any], *, used_price_ids: set[str] | None = None) -> dict[str, Any]:
        with self.lock:
            return self._replace(revision, payload, used_price_ids=used_price_ids)

    def _replace(self, revision: int, payload: dict[str, Any], *, used_price_ids: set[str] | None = None) -> dict[str, Any]:
        current = self.read()
        if revision != current["revision"]:
            raise ValueError("revision_conflict")
        profiles = payload.get("price_profiles", [])
        identifiers = [str(item.get("id", "")) for item in profiles]
        if any(not identifier for identifier in identifiers) or len(identifiers) != len(set(identifiers)):
            raise ValueError("invalid_price_profile")
        for profile in profiles:
            if (
                not str(profile.get("billing_currency", "")).isalpha()
                or len(str(profile.get("billing_currency", ""))) != 3
                or float(profile.get("exchange_rate", 0) or 0) > 0 and not profile.get("exchange_confirmed")
                or profile.get("price_source_url") and not profile.get("suggestion_confirmed")
            ):
                raise ValueError("invalid_price_profile")
        for key in ("workload_profiles", "hardware_profiles"):
            values = payload.get(key, [])
            ids = [str(item.get("id", "")) for item in values]
            if any(not identifier for identifier in ids) or len(ids) != len(set(ids)):
                raise ValueError("invalid_catalog_profile")
        previous = {item.get("id"): item for item in current["price_profiles"]}
        incoming = {item.get("id"): item for item in profiles}
        for identifier in used_price_ids or set():
            old, new = previous.get(identifier), incoming.get(identifier)
            if old is None or new is None:
                raise ValueError("price_profile_in_use")
            if {**old, "archived": bool(new.get("archived", old.get("archived", False)))} != {**new, "archived": bool(new.get("archived", False))}:
                raise ValueError("price_profile_in_use")
        result = {
            "revision": revision + 1,
            "price_profiles": profiles,
            "workload_profiles": payload.get("workload_profiles", []),
            "hardware_profiles": payload.get("hardware_profiles", []),
        }
        atomic_json(self.path, result)
        return result


class SnapshotStore:
    LIMIT = 1000
    MAX_BYTES = 256 * 1024

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root) / "_sizing" / "snapshots"
        self.root.mkdir(parents=True, exist_ok=True)
        self.lock = Lock()

    def list(self) -> list[dict[str, Any]]:
        items = []
        for path in self.root.glob("*.json"):
            try:
                items.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                continue
        return sorted(items, key=lambda item: item["created_at"], reverse=True)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            return self._create(payload)

    def _create(self, payload: dict[str, Any]) -> dict[str, Any]:
        if len(self.list()) >= self.LIMIT:
            raise ValueError("snapshot_quota_exceeded")
        item = {
            "id": f"snapshot-{uuid.uuid4().hex}", "revision": 0, "archived": False,
            "created_at": utc_now(), **payload,
        }
        if len(json.dumps(item, ensure_ascii=False).encode()) > self.MAX_BYTES:
            raise ValueError("snapshot_too_large")
        atomic_json(self.root / f"{item['id']}.json", item)
        return item

    def patch(self, snapshot_id: str, revision: int, *, archived: bool) -> dict[str, Any]:
        with self.lock:
            return self._patch(snapshot_id, revision, archived=archived)

    def _patch(self, snapshot_id: str, revision: int, *, archived: bool) -> dict[str, Any]:
        path = self.root / f"{snapshot_id}.json"
        item = json.loads(path.read_text(encoding="utf-8"))
        if revision != item["revision"]:
            raise ValueError("revision_conflict")
        item.update(revision=revision + 1, archived=archived)
        atomic_json(path, item)
        return item

    def delete_preview(self, snapshot_id: str) -> dict[str, Any]:
        path = self.root / f"{snapshot_id}.json"
        item = json.loads(path.read_text(encoding="utf-8"))
        return {"snapshot_id": snapshot_id, "revision": item["revision"], "checksum": checksum(item)}

    def delete(self, snapshot_id: str, revision: int, expected_checksum: str) -> None:
        with self.lock:
            self._delete(snapshot_id, revision, expected_checksum)

    def _delete(self, snapshot_id: str, revision: int, expected_checksum: str) -> None:
        path = self.root / f"{snapshot_id}.json"
        item = json.loads(path.read_text(encoding="utf-8"))
        if revision != item["revision"] or expected_checksum != checksum(item):
            raise ValueError("revision_conflict")
        path.unlink()


def price_for(operation: dict[str, Any], profiles: list[dict[str, Any]]) -> dict[str, Any] | None:
    candidates = [
        profile for profile in profiles
        if profile.get("provider_profile_id") == operation.get("provider_profile_id")
        and profile.get("model") == operation.get("model")
        and str(profile.get("effective_from", "")) <= str(operation.get("started_at", ""))
        and not profile.get("archived")
    ]
    return max(candidates, key=lambda item: str(item.get("effective_from", "")), default=None)


def operation_cost(operation: dict[str, Any], profile: dict[str, Any] | None) -> float | None:
    usage = operation.get("usage")
    if not profile or operation.get("usage_status") not in {"complete", "inconsistent"} or not usage:
        return None
    prompt, completion = usage["prompt_tokens"], usage["completion_tokens"]
    if profile.get("maximum_input_tokens") and prompt > int(profile["maximum_input_tokens"]):
        return None
    cached = usage.get("cached_tokens") or 0
    fixed_policy = profile.get("fixed_cost_policy", "successful_response")
    fixed_allowed = (
        operation.get("status") == "success" if fixed_policy == "successful_response"
        else operation.get("http_status") is not None if fixed_policy == "any_http_response"
        else True
    )
    total = (
        (prompt - cached) * float(profile.get("input_per_million", 0))
        + cached * float(profile.get("cached_per_million", profile.get("input_per_million", 0)))
        + completion * float(profile.get("output_per_million", 0))
    ) / 1_000_000
    if fixed_allowed:
        total += float(profile.get("fixed_cost", 0))
    return total * (1 + float(profile.get("surcharge_rate", 0)))


def latest_price_estimate(
    operations: list[dict[str, Any]], profiles: list[dict[str, Any]],
) -> dict[str, Any] | None:
    final = [item for item in operations if item.get("status") != "in_progress"]
    identities = {(item.get("provider_profile_id"), item.get("model")) for item in final}
    profile = max(
        (
            item for item in profiles
            if not item.get("archived")
            and (item.get("provider_profile_id"), item.get("model")) in identities
        ),
        key=lambda item: str(item.get("price_fetched_at") or item.get("effective_from") or item.get("id", "")),
        default=None,
    )
    if not profile:
        return None
    costs = [
        operation_cost(item, profile)
        for item in final
        if item.get("provider_profile_id") == profile.get("provider_profile_id")
        and item.get("model") == profile.get("model")
    ]
    known = [value for value in costs if value is not None]
    if not known:
        return None
    billing_amount = sum(known)
    rate = float(profile.get("exchange_rate", 0) or 0)
    display_amount = billing_amount * rate if rate > 0 else None
    return {
        "value_kind": "estimated_latest_price",
        "profile_id": str(profile.get("id", "")),
        "billing_amount": billing_amount,
        "billing_currency": str(profile.get("billing_currency", "")),
        "display_amount": display_amount,
        "display_currency": str(profile.get("display_currency", "")) if display_amount is not None else None,
        "exchange_rate": rate or None,
        "exchange_source": str(profile.get("exchange_source", "")) or None,
        "exchange_rate_kind": str(profile.get("exchange_rate_kind", "")) or None,
        "exchange_source_time": profile.get("exchange_source_time"),
        "exchange_fetched_at": profile.get("exchange_fetched_at"),
        "estimated_attempts": len(known),
        "coverage_percent": 100 * len(known) / len(final) if final else None,
        "sensitivity_1_percent": display_amount * .01 if display_amount is not None else None,
    }


def aggregate(operations: list[dict[str, Any]], *, sample_count: int, price_profiles: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    final = [item for item in operations if item.get("status") != "in_progress"]
    responses = [item for item in final if item.get("response_bytes") is not None]
    complete = [item for item in responses if item.get("usage_status") in {"complete", "inconsistent"}]
    costs = [operation_cost(item, price_for(item, price_profiles or [])) for item in final]
    known = [value for value in costs if value is not None]
    durations = [float(item["duration_ms"]) for item in final if item.get("duration_ms") is not None]
    tokens = [item["usage"]["canonical_total_tokens"] for item in complete if item.get("usage")]
    return {
        "sample_count": sample_count, "operation_count": len(final),
        "prompt_tokens": sum(item["usage"]["prompt_tokens"] for item in complete if item.get("usage")),
        "completion_tokens": sum(item["usage"]["completion_tokens"] for item in complete if item.get("usage")),
        "total_tokens": sum(tokens), "duration_ms_p50": nearest_rank(durations, .5),
        "duration_ms_p95": nearest_rank(durations, .95),
        "response_usage_percent": 100 * len(complete) / len(responses) if responses else None,
        "billing_certainty_percent": 100 * len(known) / len(final) if final else None,
        "known_cost": sum(known) if known else None,
        "total_cost": sum(known) if len(known) == len(final) and final else None,
        "unknown_cost_attempts": len(final) - len(known),
        "response_attempts": len(responses), "complete_usage_attempts": len(complete),
        "known_billing_attempts": len(known), "total_attempts": len(final),
        "latest_price_estimate": latest_price_estimate(final, price_profiles or []),
    }


def merge_aggregates(items: list[dict[str, Any]]) -> dict[str, Any]:
    if not items:
        return aggregate([], sample_count=0)
    response_attempts = sum(int(item.get("response_attempts", 0)) for item in items)
    complete_usage = sum(int(item.get("complete_usage_attempts", 0)) for item in items)
    total_attempts = sum(int(item.get("total_attempts", item.get("operation_count", 0))) for item in items)
    known_billing = sum(int(item.get("known_billing_attempts", 0)) for item in items)
    known_costs = [item.get("known_cost") for item in items if item.get("known_cost") is not None]
    fully_known = total_attempts > 0 and known_billing == total_attempts
    estimates = [item["latest_price_estimate"] for item in items if item.get("latest_price_estimate")]
    estimate = None
    if estimates and len({item["profile_id"] for item in estimates}) == 1:
        estimated_attempts = sum(int(item["estimated_attempts"]) for item in estimates)
        billing_amount = sum(float(item["billing_amount"]) for item in estimates)
        display_values = [item.get("display_amount") for item in estimates]
        estimate = {
            **estimates[0],
            "billing_amount": billing_amount,
            "display_amount": sum(float(value) for value in display_values) if all(value is not None for value in display_values) else None,
            "estimated_attempts": estimated_attempts,
            "coverage_percent": 100 * estimated_attempts / total_attempts if total_attempts else None,
        }
        estimate["sensitivity_1_percent"] = (
            estimate["display_amount"] * .01 if estimate["display_amount"] is not None else None
        )
    return {
        "sample_count": sum(int(item.get("sample_count", 0)) for item in items),
        "operation_count": total_attempts,
        "prompt_tokens": sum(int(item.get("prompt_tokens", 0)) for item in items),
        "completion_tokens": sum(int(item.get("completion_tokens", 0)) for item in items),
        "total_tokens": sum(int(item.get("total_tokens", 0)) for item in items),
        "duration_ms_p50": max((item.get("duration_ms_p50") or 0 for item in items), default=0) or None,
        "duration_ms_p95": max((item.get("duration_ms_p95") or 0 for item in items), default=0) or None,
        "response_usage_percent": 100 * complete_usage / response_attempts if response_attempts else None,
        "billing_certainty_percent": 100 * known_billing / total_attempts if total_attempts else None,
        "known_cost": sum(known_costs) if known_costs else None,
        "total_cost": sum(known_costs) if fully_known else None,
        "unknown_cost_attempts": total_attempts - known_billing,
        "response_attempts": response_attempts, "complete_usage_attempts": complete_usage,
        "known_billing_attempts": known_billing, "total_attempts": total_attempts,
        "latest_price_estimate": estimate,
    }


def calculate_scenario(payload: dict[str, Any], aggregate_data: dict[str, Any]) -> dict[str, Any]:
    monthly = float(payload["monthly_jobs"])
    days = float(payload["operating_days"])
    hours = float(payload["operating_hours"])
    peak = float(payload.get("peak_factor", 1))
    reserve = float(payload.get("reserve", 0))
    required = monthly / days / hours * peak * (1 + reserve)
    p95 = aggregate_data.get("job_duration_seconds_p95")
    measured = 3600 / p95 if p95 else None
    enough = int(aggregate_data.get("sample_count", 0)) >= 20
    billing_ok = (aggregate_data.get("billing_certainty_percent") or 0) >= 95
    sample_count = int(aggregate_data.get("sample_count", 0))
    tokens_per_job = aggregate_data.get("total_tokens", 0) / sample_count if sample_count else None
    known_cost_per_job = aggregate_data.get("known_cost") / sample_count if sample_count and aggregate_data.get("known_cost") is not None else None
    latest = aggregate_data.get("latest_price_estimate")
    latest_ok = enough and latest and (latest.get("coverage_percent") or 0) >= 95
    monthly_estimate = None
    if latest_ok and sample_count:
        factor = monthly / sample_count
        monthly_estimate = {
            **latest,
            "billing_amount": latest["billing_amount"] * factor,
            "display_amount": latest["display_amount"] * factor if latest.get("display_amount") is not None else None,
            "sensitivity_1_percent": latest["sensitivity_1_percent"] * factor if latest.get("sensitivity_1_percent") is not None else None,
        }
    return {
        "average_jobs_per_hour": monthly / days / hours,
        "peak_jobs_per_hour": monthly / days / hours * peak,
        "required_capacity_jobs_per_hour": required,
        "measured_capacity_jobs_per_hour": measured,
        "theoretical_capacity_units": math.ceil(required / measured) if measured else None,
        "capacity_verdict": "screening_only" if enough and measured else "insufficient_sample",
        "cost_forecast_available": enough and billing_ok and aggregate_data.get("total_cost") is not None,
        "estimated_monthly_tokens": monthly * tokens_per_job if tokens_per_job is not None else None,
        "estimated_monthly_known_cost": monthly * known_cost_per_job if enough and billing_ok and known_cost_per_job is not None else None,
        "latest_price_forecast_available": bool(latest_ok),
        "estimated_monthly_price": monthly_estimate,
        "self_host_tco": None,
        "value_kind": "calculated",
    }
