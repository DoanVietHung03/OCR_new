from __future__ import annotations
import base64, json
import httpx
from .jobs import FIELDS

PROMPT_VERSION = "3"
FIELD_ALIASES = {"co_quan":"co_quan_ban_hanh", "so_hieu":"so_van_ban", "so_ky_hieu":"so_van_ban", "ma_van_ban":"so_van_ban", "quoc_hieu":"quoc_hieu_tieu_ngu", "tieu_ngu":"quoc_hieu_tieu_ngu", "dia_diem":"dia_diem_ban_hanh", "noi_ban_hanh":"dia_diem_ban_hanh", "ngay":"ngay_ban_hanh", "ngay_thang":"ngay_ban_hanh", "ten_loai":"loai_van_ban", "chuc_vu":"chuc_vu_nguoi_ky", "nguoi_ky_ten":"nguoi_ky", "ten_nguoi_ky":"nguoi_ky"}
PROMPT = "Return one JSON object only, with top-level fields. Each field has value, confidence, bbox, page_index. Extract visible archival fields."

def validate_result(payload: object) -> dict:
    if not isinstance(payload, dict) or not isinstance(payload.get("fields"), dict): raise ValueError("invalid_model_json: expected fields object")
    fields = {}
    for raw, item in payload["fields"].items():
        name = FIELD_ALIASES.get(str(raw).strip().casefold().replace("-", "_").replace(" ", "_"), raw)
        if name not in FIELDS or not isinstance(item, dict): raise ValueError(f"invalid_model_json: invalid field {raw}")
        if not {"value", "confidence", "bbox", "page_index"}.issubset(item): raise ValueError("invalid_model_json: incomplete field")
        if name not in fields or float(item["confidence"]) > float(fields[name]["confidence"]): fields[name] = item
    return {"fields": fields}

def message_text(response: object) -> str:
    try:
        content = response["choices"][0]["message"]["content"]
        return content if isinstance(content, str) else "\n".join(str(i.get("text", "")) for i in content if i.get("type") == "text")
    except (KeyError, IndexError, TypeError): return ""

async def request_page(image: bytes, *, base_url: str, api_key: str, model: str, timeout: float = 120) -> dict:
    body = {"model": model, "temperature": 0, "response_format": {"type": "json_object"}, "messages": [{"role": "user", "content": [{"type": "text", "text": PROMPT}, {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(image).decode()}}]}]}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client: response = await client.post(base_url.rstrip("/") + "/chat/completions", json=body, headers={"Authorization": f"Bearer {api_key}"}); response.raise_for_status(); data = response.json()
    except (httpx.HTTPError, TimeoutError) as exc: raise RuntimeError("provider_network_error") from exc
    try: return validate_result(json.loads(message_text(data)))
    except (json.JSONDecodeError, ValueError) as exc: raise ValueError(str(exc) if str(exc).startswith("invalid_model_json") else "invalid_model_json: malformed provider response") from exc

def configured(base_url: str, model: str) -> bool: return bool(base_url and model)
