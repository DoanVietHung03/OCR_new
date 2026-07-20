"""Small strict client for OpenAI-compatible vision endpoints."""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

from .jobs import FIELDS


def validate_result(payload: object) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("fields"), dict):
        raise ValueError("invalid_model_json")
    fields = {}
    for name, item in payload["fields"].items():
        if name not in FIELDS or not isinstance(item, dict):
            raise ValueError("invalid_model_json")
        if not {"value", "confidence", "bbox", "page_index"}.issubset(item):
            raise ValueError("invalid_model_json")
        fields[name] = item
    return {"fields": fields}


def request_page(image: bytes, *, base_url: str, api_key: str, model: str, timeout: float = 120) -> dict:
    encoded = base64.b64encode(image).decode()
    body = {"model": model, "temperature": 0, "messages": [{"role": "user", "content": [
        {"type": "text", "text": "Return strict JSON with fields only from the known archival schema. Use {\\\"fields\\\":{}} when empty."},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}},
    ]}]}
    request = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions", data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read())
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError("provider_network_error") from exc
    try:
        content = result["choices"][0]["message"]["content"]
        return validate_result(json.loads(content))
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError("invalid_model_json") from exc


def configured() -> bool:
    return bool(os.getenv("OCR_BASE_URL") and os.getenv("OCR_MODEL"))
