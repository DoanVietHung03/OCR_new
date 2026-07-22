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
OCR_PROMPT = (
    'Return one JSON object only: {"text": "..."}. Transcribe all visible text '
    "in reading order without summarizing or inventing content."
)
RETRYABLE_STATUSES = {429, 502, 503, 504}


def parse_json_object(content: str) -> object:
    decoder = json.JSONDecoder()
    for index, char in enumerate(content):
        if char == "{":
            try:
                return decoder.raw_decode(content[index:])[0]
            except json.JSONDecodeError:
                continue
    raise ValueError("invalid_model_json:malformed_json")


def validate_result(payload: object, *, page_index: int = 0, task: str = "metadata") -> dict:
    if task == "full_ocr":
        if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
            raise ValueError("invalid_model_json")
        return {"text": payload["text"], "fields": {}, "warnings": []}
    if not isinstance(payload, dict) or not isinstance(payload.get("fields"), dict):
        raise ValueError("invalid_model_json")
    fields, warnings = {}, []
    for raw_name, item in payload["fields"].items():
        normalized = str(raw_name).strip().casefold().replace("-", "_").replace(" ", "_")
        name = FIELD_ALIASES.get(normalized, raw_name)
        if name not in FIELDS:
            warnings.append("unknown_field")
            continue
        if isinstance(item, dict) and "value" not in item:
            warnings.append("incomplete_field")
            continue
        value = item.get("value") if isinstance(item, dict) else item
        if isinstance(value, (dict, list)):
            warnings.append("invalid_field_value")
            continue
        if isinstance(item, dict):
            raw_confidence = item.get("confidence")
            confidence = float(raw_confidence) if isinstance(raw_confidence, (int, float)) and not isinstance(raw_confidence, bool) and 0 <= raw_confidence <= 1 else None
            raw_bbox = item.get("bbox")
            bbox = [float(value) for value in raw_bbox] if isinstance(raw_bbox, list) and len(raw_bbox) == 4 and all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in raw_bbox) else []
            if ("confidence" in item and confidence is None) or ("bbox" in item and not bbox):
                warnings.append("invalid_field_value")
        else:
            confidence, bbox = None, []
        field = {"value": value, "confidence": confidence, "bbox": bbox, "page_index": page_index,
                 "needs_review": confidence is None or not bbox}
        if name not in fields or (confidence or -1) > (fields[name]["confidence"] or -1):
            fields[name] = field
    return {"fields": fields, "warnings": list(dict.fromkeys(warnings))}


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


def request_body(image: bytes, model: str, task: str = "metadata") -> dict:
    encoded = base64.b64encode(image).decode()
    return {
        "model": model,
        "temperature": 0,
        "thinking": {"type": "disabled"},
        "response_format": {"type": "json_object"},
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": OCR_PROMPT if task == "full_ocr" else PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}},
        ]}],
    }


def retry_delay(response: httpx.Response) -> float:
    try:
        return min(10, max(0, float(response.headers.get("Retry-After", "0"))))
    except ValueError:
        return 0


async def request_page(
    image: bytes, *, base_url: str, api_key: str, model: str, timeout: float = 120,
    page_index: int = 0, task: str = "metadata",
) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(2):
            try:
                response = await client.post(
                    base_url.rstrip("/") + "/chat/completions",
                    json=request_body(image, model, task),
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
                    raise ValueError("invalid_model_json:missing_content")
                return validate_result(parse_json_object(content), page_index=page_index, task=task)
            except ValueError as exc:
                raise ValueError(str(exc) if str(exc).startswith("invalid_model_json") else "invalid_model_json") from exc
    raise RuntimeError("provider_unavailable")


def configured(base_url: str, model: str) -> bool:
    return bool(base_url and model)
