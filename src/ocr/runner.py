"""Small strict client for OpenAI-compatible vision endpoints."""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

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
    "Each fields entry uses an existing archival field name and has value (string), confidence (number 0..1), "
    "bbox ([left, top, right, bottom]), and page_index (integer). "
    "Example: {\"fields\": {\"so_van_ban\": {\"value\": \"24\", \"confidence\": 0.9, \"bbox\": [0, 0, 1, 1], \"page_index\": 0}}}. "
    f"Extract every visible field from this administrative-document schema: {', '.join(ADMIN_FIELDS)}. Do not stop after the highlighted fields. "
    "quoc_hieu_tieu_ngu is the full upper-center national title and motto. "
    "ngay_ban_hanh is the issue date in the header near the top-right; Ignore dates in the body, summary, citations, and references. "
    "quyen_han_ky_thay is the signing-authority line immediately above the signer title, including TM., Q., KT., TL., TUQ. when present. "
    "Do not put the signer title in quyen_han_ky_thay. Do not invent fields. Use {\"fields\": {}} when nothing is found."
)


def validate_result(payload: object) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("fields"), dict):
        raise ValueError("invalid_model_json: expected fields object")
    fields = {}
    for raw_name, item in payload["fields"].items():
        name = FIELD_ALIASES.get(str(raw_name).strip().casefold().replace("-", "_").replace(" ", "_"), raw_name)
        if name not in FIELDS or not isinstance(item, dict):
            raise ValueError(f"invalid_model_json: invalid field {raw_name}")
        if not {"value", "confidence", "bbox", "page_index"}.issubset(item):
            raise ValueError("invalid_model_json: incomplete field")
        if name not in fields or float(item["confidence"]) > float(fields[name]["confidence"]):
            fields[name] = item
    return {"fields": fields}


def is_terminal_page_error(error: Exception) -> bool:
    return str(error).startswith("invalid_model_json")


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
        return "\n".join(str(item.get("text") or "") for item in content if isinstance(item, dict) and item.get("type") == "text")
    return ""


def request_body(encoded_image: str, model: str) -> dict:
    return {"model": model, "temperature": 0, "thinking": {"type": "disabled"}, "response_format": {"type": "json_object"}, "messages": [{"role": "user", "content": [
        {"type": "text", "text": PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded_image}"}},
    ]}]}


def request_page(image: bytes, *, base_url: str, api_key: str, model: str, timeout: float = 120) -> dict:
    body = request_body(base64.b64encode(image).decode(), model)
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
        content = message_text(result)
        if not content:
            raise ValueError("invalid_model_json: missing message text")
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError("invalid_model_json: malformed provider response") from exc
    return validate_result(payload)


def configured() -> bool:
    return bool(os.getenv("OCR_BASE_URL") and os.getenv("OCR_MODEL"))
