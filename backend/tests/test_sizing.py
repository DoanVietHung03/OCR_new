import asyncio
import json

import httpx
import pytest

from app.services.ocr_runner import request_page
from app.services.pricing import (
    parse_agribank_quote, parse_ecb_quote, parse_minimax_price, parse_vietcombank_quote,
)
from app.services.sizing import (
    MeasurementStore, SizingCatalog, SnapshotStore, aggregate,
    calculate_scenario, operation_cost, parse_usage,
)


def test_usage_parser_keeps_canonical_tokens_and_rejects_bad_components():
    status, usage = parse_usage({"usage": {
        "prompt_tokens": 10, "completion_tokens": 4, "total_tokens": 99,
        "prompt_tokens_details": {"cached_tokens": 3},
        "completion_tokens_details": {"reasoning_tokens": 2},
    }})
    assert status == "inconsistent"
    assert usage == {
        "prompt_tokens": 10, "completion_tokens": 4, "reported_total_tokens": 99,
        "canonical_total_tokens": 14, "cached_tokens": 3, "reasoning_tokens": 2,
    }
    assert parse_usage({}) == ("unavailable", None)
    assert parse_usage({"usage": {"prompt_tokens": True, "completion_tokens": 1}})[0] == "incomplete"
    assert parse_usage({"usage": {
        "prompt_tokens": 2, "completion_tokens": 1,
        "prompt_tokens_details": {"cached_tokens": 3},
    }})[0] == "incomplete"


def test_official_price_and_exchange_source_parsers_are_bounded():
    price = parse_minimax_price("""
      <table><tr><td>MiniMax-M3 ≤ 512k input tokens</td>
      <td><del>$0.60</del> $0.30 / M tokens</td>
      <td><del>$2.40</del> $1.20 / M tokens</td>
      <td><del>$0.12</del> $0.06 / M tokens</td></tr></table>
    """, "MiniMax-M3")
    assert price == {
        "billing_currency": "USD", "input_per_million": .3, "output_per_million": 1.2,
        "cached_per_million": .06, "maximum_input_tokens": 512_000,
        "price_basis": "standard pay-as-you-go; input <= 512k tokens",
    }
    assert parse_vietcombank_quote(
        '<ExrateList DateTime="30/07/2026 08:05"><Exrate CurrencyCode="USD" Sell="26,520.00"/></ExrateList>'
    )["exchange_rate"] == 26_520
    assert parse_agribank_quote(
        "<table><tr><td>USD</td><td>26120.00</td><td>26140.00</td><td>26520.00</td></tr></table>"
    )["exchange_rate"] == 26_520
    assert round(parse_ecb_quote("TIME_PERIOD,OBS_VALUE\n2026-07-30,1.2\n")["exchange_rate"], 6) == .833333

    assert operation_cost({
        "status": "success", "usage_status": "complete",
        "usage": {"prompt_tokens": 512_001, "completion_tokens": 1},
    }, {**price, "fixed_cost_policy": "successful_response"}) is None


def test_measurements_are_atomic_recoverable_and_aggregate_without_double_count(tmp_path):
    store = MeasurementStore(tmp_path)
    target = store.begin(
        {"job_id": "job", "task": "metadata", "provider_profile_id": "p", "model": "m"},
        operation_id="op_one", attempt=1, request_bytes=12,
    )
    recovered = MeasurementStore(tmp_path)
    assert recovered.operations(job_id="job")[0]["status"] == "interrupted"
    recovered.finish(
        target, status="success", response_bytes=4, duration_ms=20,
        usage_status="complete", usage={
            "prompt_tokens": 10, "completion_tokens": 2,
            "reported_total_tokens": 12, "canonical_total_tokens": 12,
            "cached_tokens": None, "reasoning_tokens": None,
        },
    )
    summary = aggregate(recovered.operations(job_id="job"), sample_count=1)
    assert summary["operation_count"] == 1
    assert summary["total_tokens"] == 12
    assert summary["response_usage_percent"] == 100
    assert summary["duration_ms_p95"] == 20


def test_catalog_cost_snapshot_and_calculator_contracts(tmp_path):
    catalog = SizingCatalog(tmp_path)
    profile = {
        "id": "price-1", "provider_profile_id": "p", "model": "m",
        "billing_currency": "USD",
        "effective_from": "2026-01-01T00:00:00+00:00",
        "input_per_million": 1, "output_per_million": 2,
        "cached_per_million": .5, "fixed_cost": .01,
        "fixed_cost_policy": "successful_response", "surcharge_rate": .1,
    }
    assert catalog.replace(0, {"price_profiles": [profile]})["revision"] == 1
    operation = {
        "provider_profile_id": "p", "model": "m", "started_at": "2026-07-01T00:00:00+00:00",
        "status": "success", "usage_status": "complete",
        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cached_tokens": 2},
    }
    assert operation_cost(operation, profile) == ((8 + 1 + 10) / 1_000_000 + .01) * 1.1

    snapshots = SnapshotStore(tmp_path)
    item = snapshots.create({"name": "A", "inputs": {}, "aggregate": {}, "result": {}, "provenance": {}})
    item = snapshots.patch(item["id"], 0, archived=True)
    preview = snapshots.delete_preview(item["id"])
    snapshots.delete(item["id"], preview["revision"], preview["checksum"])
    assert snapshots.list() == []

    result = calculate_scenario(
        {"monthly_jobs": 100, "operating_days": 20, "operating_hours": 5, "peak_factor": 2, "reserve": .25},
        {"sample_count": 20, "billing_certainty_percent": 100, "total_cost": 1, "job_duration_seconds_p95": 60},
    )
    assert result["required_capacity_jobs_per_hour"] == 2.5
    assert result["theoretical_capacity_units"] == 1
    assert result["capacity_verdict"] == "screening_only"


def test_provider_retry_and_invalid_ocr_keep_attempt_usage(tmp_path, monkeypatch):
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(503, json={"error": "busy"})
        return httpx.Response(200, json={
            "choices": [{"message": {"content": "not-json"}}],
            "usage": {"prompt_tokens": 4, "completion_tokens": 1, "total_tokens": 5},
        })

    original = httpx.AsyncClient
    monkeypatch.setattr(
        "app.services.ocr_runner.httpx.AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs),
    )
    store = MeasurementStore(tmp_path)
    with pytest.raises(ValueError, match="invalid_model_json"):
        asyncio.run(request_page(
            b"png", base_url="http://provider.test/v1", api_key="secret", model="model",
            measurement_store=store, measurement_context={"job_id": "job", "task": "metadata"},
        ))
    operations = sorted(store.operations(job_id="job"), key=lambda item: item["attempt"])
    assert [(item["attempt"], item["status"]) for item in operations] == [(1, "http_error"), (2, "invalid_json")]
    assert operations[1]["usage_status"] == "complete"
    assert operations[1]["usage"]["canonical_total_tokens"] == 5
    assert "secret" not in json.dumps(operations)
