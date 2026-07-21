"""Strict async client for OpenAI-compatible vision endpoints."""

from __future__ import annotations

import asyncio
import base64
import json

import httpx

from .jobs import FIELDS

PROMPT_VERSION = "3"
ADMIN_FIELDS = (
    "co_quan_ban_hanh", "so_van_ban", "quoc_hieu_tieu_ngu", "dia_diem_ban_hanh",
    "ngay_ban_hanh", "loai_van_ban", "trich_yeu", "quyen_han_ky_thay",
    "chuc_vu_nguoi_ky", "nguoi_ky", "ma_luu_tru",
)
FIELD_ALIASES = {
    "co_quan": "co_quan_ban_hanh", "so_hieu": "so_van_ban",
    "so_ky_hieu": "so_van_ban", "ma_van_ban": "so_van_ban",
    "quoc_hieu": "quoc_hieu_tieu_ngu", "tieu_ngu": "quoc_hieu_tieu_ngu",
    "dia_diem": "dia_diem_ban_hanh", "noi_ban_hanh": "dia_diem_ban_hanh",
    "ngay": "ngay_ban_hanh", "ngay_thang": "ngay_ban_hanh",
    "dia_diem_ngay_thang": "ngay_ban_hanh", "ten_loai": "loai_van_ban",
    "chuc_vu": "chuc_vu_nguoi_ky", "chuc_vu_ky": "chuc_vu_nguoi_ky",
    "nguoi_ky_ten": "nguoi_ky", "ten_nguoi_ky": "nguoi_ky",
}
PROMPT = (
    "Return one JSON object only, with no Markdown or explanation. Its only top-level key is fields. "
    "Each fields entry uses an existing archival field name and has value (string), confidence "
    "(number 0..1), bbox ([left, top, right, bottom]), and page_index (integer). "
    f"Extract every visible field from this administrative-document schema: {', '.join(ADMIN_FIELDS)}. "
    "Do not invent fields. Use {\"fields\": {}} when nothing is found."
)
RETRYABLE_STATUSES = {429, 502, 503, 504}


def validate_result(payload: object) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("fields"), dict):
        raise ValueError("invalid_model_json")
    fields = {}
    for raw_name, item in payload["fields"].items():
        normalized = str(raw_name).strip().casefold().replace("-", "_").replace(" ", "_")
        name = FIELD_ALIASES.get(normalized, raw_name)
        if name not in FIELDS or not isinstance(item, dict):
            raise ValueError("invalid_model_json")
        if not {"value", "confidence", "bbox", "page_index"}.issubset(item):
            raise ValueError("invalid_model_json")
        if name not in fields or float(item["confidence"]) > float(fields[name]["confidence"]):
            fields[name] = item
    return {"fields": fields}


def message_text(response: object) -> str:
    if not isinstance(response, dict):
        return ""
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return ""
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, dict) else ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            str(item.get("text") or "")
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        )
    return ""


def request_body(image: bytes, model: str) -> dict:
    encoded = base64.b64encode(image).decode()
    return {
        "model": model,
        "temperature": 0,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}},
        ]}],
    }


def retry_delay(response: httpx.Response) -> float:
    try:
        return min(10, max(0, float(response.headers.get("Retry-After", "0"))))
    except ValueError:
        return 0


async def request_page(
    image: bytes, *, base_url: str, api_key: str, model: str, timeout: float = 120
) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(2):
            try:
                response = await client.post(
                    base_url.rstrip("/") + "/chat/completions",
                    json=request_body(image, model),
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            except httpx.ReadTimeout as exc:
                raise RuntimeError("provider_timeout") from exc
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                if attempt == 0:
                    continue
                raise RuntimeError("provider_unavailable") from exc
            except httpx.HTTPError as exc:
                raise RuntimeError("provider_unavailable") from exc
            if response.status_code in RETRYABLE_STATUSES:
                if attempt == 0:
                    await asyncio.sleep(retry_delay(response))
                    continue
                raise RuntimeError("provider_unavailable")
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError("provider_unavailable") from exc
            try:
                content = message_text(response.json())
                if not content:
                    raise ValueError("invalid_model_json")
                return validate_result(json.loads(content))
            except (json.JSONDecodeError, ValueError) as exc:
                raise ValueError("invalid_model_json") from exc
    raise RuntimeError("provider_unavailable")


def configured(base_url: str, model: str) -> bool:
    return bool(base_url and model)
