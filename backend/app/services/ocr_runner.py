"""Strict async client for OpenAI-compatible vision endpoints."""

from __future__ import annotations

import asyncio
import base64
import json
import re
import time
import unicodedata
import uuid

import httpx

from .field_policy import ADMIN_FIELDS
from .jobs import FIELDS
from .providers import ProfileSpec
from .sizing import MeasurementStore, parse_usage

PROMPT_VERSION = "10"
PROBE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACuklEQVR4nO3TMQEA"
    "AAiAMPuX1hgebAl4mIWw+Q6ATwYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0"
    "A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIM"
    "QJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMA"
    "aQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCk"
    "GYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5Bm"
    "ANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoB"
    "SDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYg"
    "zQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0"
    "A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIM"
    "QJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMA"
    "aQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCk"
    "GYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5Bm"
    "ANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoB"
    "SDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYg"
    "zQCkGYA0A5BmANIMwJYd3Lcs1HAUieUAAAAASUVORK5CYII="
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
OCR_LABELS = {
    "khoa": ("Khóa",), "nhiem_ky": ("Nhiệm kỳ",), "phong_so": ("Phông số",),
    "muc_luc_so": ("Mục lục số",), "ho_so_dvbq": ("Hồ sơ (ĐVBQ)", "Hồ sơ ĐVBQ"),
    "so_tai_lieu": ("Số tài liệu",), "so_trang": ("Số trang",),
    "bat_dau": ("Bắt đầu",), "ket_thuc": ("Kết thúc",),
    "thoi_han_bao_quan": ("Thời hạn bảo quản",),
}


def comparable_text(value: object) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKC", str(value)).casefold()
        if char.isalnum()
    )


def comparable_date_parts(value: object) -> tuple[int, int, int] | None:
    numbers = tuple(map(int, re.findall(r"\d+", str(value))))[:3]
    if len(numbers) < 3:
        return None
    return (numbers[2], numbers[1], numbers[0]) if numbers[0] > 31 else numbers


def supporting_line(name: str, ocr_text: str) -> str:
    labels = OCR_LABELS.get(name, ())
    return next((
        line.strip() for line in ocr_text.splitlines()
        if any(comparable_text(label) in comparable_text(line) for label in labels)
    ), "")


def metadata_prompt(fields: tuple[str, ...]) -> str:
    subject = (
        " trich_yeu is the exact subject/title line or lines in the document header, usually immediately below loai_van_ban. "
        "Transcribe it verbatim; never summarize it or use the opening paragraph or body text."
        if "trich_yeu" in fields else ""
    )
    document_number = (
        " so_van_ban is the document identifier printed after Số: or Văn bản số; never use an archive/file code."
        if "so_van_ban" in fields else ""
    )
    archive_code = (
        " ma_luu_tru is the archival notation, commonly like A.30.15.03.05.001; on a dossier cover or document page, it may be printed or handwritten anywhere on the page. "
        "Never use the document number or a recipient/distribution line such as 'Lưu: VT, KH-TC (PTT)'."
        if "ma_luu_tru" in fields else ""
    )
    signing_authority = (
        " quyen_han_ky_thay is the complete visible signing-authority line above the signer title: "
        "TM. (thay mặt), Q. (quyền), KT. (ký thay), TL. (thừa lệnh), or TUQ. (thừa ủy quyền). "
        "Keep the authority named on that same line, for example KT. BỘ TRƯỞNG; do not reduce it to KT. alone. "
        "Use an empty string when the signer has direct authority and no signing-authority line is printed. "
        "Keep the signer's own title, such as THỨ TRƯỞNG, in chuc_vu_nguoi_ky."
        if "quyen_han_ky_thay" in fields else ""
    )
    signature_search = (
        " Inspect the entire page for the signing block. Read printed or typed text even when a red circular seal, "
        "handwriting, or signature ink overlaps it. Do not use text inside the seal as the signer name. Keep the "
        "signing-authority line, signer title, and signer name separate; use bbox [] when their location is uncertain."
        if {"chuc_vu_nguoi_ky", "nguoi_ky"}.issubset(fields) else ""
    )
    cover = (
        " For a dossier cover, co_quan_luu_tru is all consecutive bold organization or archive-authority lines beneath the party or national header; exclude the header itself and preserve line breaks. "
        "khoa is the value after Khóa, such as V, and is separate from nhiem_ky. "
        "phong_so is only the value after the printed label Phông số; never take Hồ sơ (ĐVBQ), Mục lục số, or ma_luu_tru. "
        "Read muc_luc_so, ho_so_dvbq, so_tai_lieu, so_trang, bat_dau, ket_thuc, and thoi_han_bao_quan only from their matching printed labels. "
        "Return so_tai_lieu and so_trang as integers."
        if "co_quan_luu_tru" in fields else ""
    )
    return (
        "Return one JSON object only, with no Markdown or explanation. Its only top-level key is fields. "
        "Each fields entry uses an existing archival field name and has value, confidence "
        "(number 0..1), bbox ([left, top, right, bottom] normalized to 0..1 relative to the input image), "
        "source_text (the exact visible label and value), and page_index (integer). The bbox must tightly enclose the printed label and its visible value, not a nearby section or the whole page; use bbox [] when localization is uncertain. "
        f"Extract every visible field from this schema: {', '.join(fields)}.{subject}{document_number}{archive_code}{signing_authority}{signature_search}{cover} "
        "Do not invent fields. Use {\"fields\": {}} when nothing is found."
    )


PROMPT = metadata_prompt(ADMIN_FIELDS)
OCR_PROMPT = (
    'Return one JSON object only: {"text": "..."}. Transcribe all visible text '
    "in reading order without summarizing or inventing content."
)
SEGMENTATION_PROMPT = (
    'Classify this page for dossier segmentation. Return one JSON object only: '
    '{"classification":"cover|document_start|continuation|blank|separator"}. '
    "Use cover for the dossier cover, document_start for the first page of an administrative document, "
    "continuation for its later pages, blank for empty pages, and separator for divider sheets."
)
RETRYABLE_STATUSES = {429, 502, 503, 504}


def response_schema(task: str) -> dict:
    if task == "full_ocr":
        properties, required = {"text": {"type": "string"}}, ["text"]
    elif task == "segmentation":
        properties, required = {"classification": {
            "type": "string", "enum": ["cover", "document_start", "continuation", "blank", "separator"],
        }}, ["classification"]
    else:
        properties, required = {"fields": {
            "type": "object", "additionalProperties": {
                "type": "object",
                "properties": {
                    "value": {"type": ["string", "number"]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "bbox": {"type": "array", "items": {"type": "number", "minimum": 0, "maximum": 1}, "minItems": 0, "maxItems": 4},
                    "source_text": {"type": "string"}, "page_index": {"type": "integer", "minimum": 0},
                },
                "required": ["value", "confidence", "bbox", "source_text", "page_index"],
                "additionalProperties": False,
            },
        }}, ["fields"]
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


def parse_json_object(content: str) -> object:
    decoder = json.JSONDecoder()
    result = None
    result_end = -1
    for index, char in enumerate(content):
        if char == "{":
            try:
                candidate, end = decoder.raw_decode(content[index:])
            except json.JSONDecodeError:
                continue
            if index + end > result_end:
                result, result_end = candidate, index + end
    if result is not None:
        return result
    raise ValueError("invalid_model_json:malformed_json")


def validate_result(
    payload: object, *, page_index: int = 0, task: str = "metadata",
    expected_fields: tuple[str, ...] | None = None, ocr_text: str = "",
) -> dict:
    if task == "segmentation":
        classification = payload.get("classification") if isinstance(payload, dict) else None
        if classification not in {"cover", "document_start", "continuation", "blank", "separator"}:
            raise ValueError("invalid_model_json")
        return {"classification": classification}
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
        if name not in (expected_fields or FIELDS):
            warnings.append("unknown_field")
            continue
        if isinstance(item, dict) and "value" not in item:
            warnings.append("incomplete_field")
            continue
        value = item.get("value") if isinstance(item, dict) else item
        if isinstance(value, (dict, list)):
            warnings.append("invalid_field_value")
            continue
        if value is None or isinstance(value, str) and not value.strip():
            continue
        if isinstance(item, dict):
            raw_confidence = item.get("confidence")
            confidence = float(raw_confidence) if isinstance(raw_confidence, (int, float)) and not isinstance(raw_confidence, bool) and 0 <= raw_confidence <= 1 else None
            raw_bbox = item.get("bbox")
            bbox = [float(value) for value in raw_bbox] if isinstance(raw_bbox, list) and len(raw_bbox) == 4 and all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in raw_bbox) else []
            evidence_reason = "bbox_missing" if raw_bbox in (None, []) else ""
            if bbox and not (0 <= bbox[0] < bbox[2] <= 1 and 0 <= bbox[1] < bbox[3] <= 1 and (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) <= 0.5):
                bbox = []
            if raw_bbox not in (None, []) and not bbox:
                evidence_reason = "bbox_invalid"
            if ("confidence" in item and confidence is None) or (raw_bbox not in (None, []) and not bbox):
                warnings.append("invalid_field_value")
        else:
            confidence, bbox, evidence_reason = None, [], "bbox_missing"
        field = {"value": value, "confidence": confidence, "bbox": bbox, "page_index": page_index,
                 "needs_review": confidence is None or not bbox}
        if evidence_reason:
            field["evidence_reason"] = evidence_reason
        if isinstance(item, dict):
            if isinstance(item.get("source_text"), str):
                field["source_text"] = item["source_text"]
            if item.get("review_reason") in {"low_confidence", "missing_evidence", "validation_warning"}:
                field["review_reason"] = item["review_reason"]
            suggestion = item.get("suggested_value")
            if not isinstance(suggestion, (dict, list)) and suggestion is not None:
                field.update(suggested_value=suggestion, suggestion_source="provider")
                raw_suggestion_confidence = item.get("suggestion_confidence")
                if isinstance(raw_suggestion_confidence, (int, float)) and not isinstance(raw_suggestion_confidence, bool) and 0 <= raw_suggestion_confidence <= 1:
                    field["suggestion_confidence"] = float(raw_suggestion_confidence)
                elif "suggestion_confidence" in item:
                    warnings.append("invalid_field_value")
                if isinstance(item.get("suggestion_reason"), str):
                    field["suggestion_reason"] = item["suggestion_reason"]
        source_text = field.get("source_text", "")
        if source_text and comparable_text(value) not in comparable_text(source_text):
            date_matches = name == "ngay_ban_hanh" and comparable_date_parts(value) == comparable_date_parts(source_text)
            if not date_matches:
                field.update(
                    confidence=None, raw_confidence=confidence, bbox=[],
                    needs_review=True, review_reason="validation_warning",
                )
                field.pop("evidence_reason", None)
                warnings.append("invalid_field_value")
        line = supporting_line(name, ocr_text)
        if line:
            field["source_text"] = line
            if comparable_text(value) not in comparable_text(line):
                field.update(
                    confidence=None, raw_confidence=confidence, bbox=[],
                    needs_review=True, review_reason="validation_warning",
                )
                field.pop("evidence_reason", None)
                warnings.append("invalid_field_value")
        if name not in fields or (field.get("confidence") or -1) > (fields[name]["confidence"] or -1):
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


def request_body(
    image: bytes, profile: ProfileSpec, task: str = "metadata",
    expected_fields: tuple[str, ...] | None = None,
) -> dict:
    encoded = base64.b64encode(image).decode()
    prompt = OCR_PROMPT if task == "full_ocr" else SEGMENTATION_PROMPT if task == "segmentation" else metadata_prompt(expected_fields or ADMIN_FIELDS)
    parts = {
        "instruction": {"type": "text", "text": profile.image_instruction},
        "image": {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}"}},
        "prompt": {"type": "text", "text": prompt},
    }
    body = {
        "model": profile.model,
        "temperature": 0,
        "messages": [{"role": "user", "content": [parts[name] for name in profile.message_order]}],
    }
    if profile.thinking_mode is False:
        body["reasoning_effort"] = "none"
    if (max_tokens := profile.max_tokens(task)) is not None:
        body["max_tokens"] = max_tokens
    if profile.structured_output:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": f"ocr_{task}", "strict": True, "schema": response_schema(task)},
        }
    return body


def retry_delay(response: httpx.Response) -> float:
    try:
        return min(10, max(0, float(response.headers.get("Retry-After", "0"))))
    except ValueError:
        return 0


async def request_page(
    image: bytes, *, profile: ProfileSpec,
    page_index: int = 0, task: str = "metadata", expected_fields: tuple[str, ...] | None = None,
    ocr_text: str = "", measurement_store: MeasurementStore | None = None,
    measurement_context: dict | None = None, required_any_fields: tuple[str, ...] = (),
) -> dict:
    body = request_body(image, profile, task, expected_fields)
    serialized = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
    operation_id = f"op_{uuid.uuid4().hex}"
    async with httpx.AsyncClient(timeout=profile.timeout_seconds) as client:
        for attempt in range(2):
            target = measurement_store.begin(
                measurement_context or {}, operation_id=operation_id,
                attempt=attempt + 1, request_bytes=len(serialized),
            ) if measurement_store else None
            started = time.monotonic()
            try:
                response = await client.post(
                    profile.base_url.rstrip("/") + "/chat/completions",
                    content=serialized,
                    headers={"Authorization": f"Bearer {profile.api_key}", "Content-Type": "application/json"},
                )
            except httpx.ReadTimeout as exc:
                if target:
                    measurement_store.finish(
                        target, status="timeout", duration_ms=round((time.monotonic() - started) * 1000),
                        retryable=attempt == 0, billing_state="unknown",
                    )
                if attempt == 0:
                    continue
                raise RuntimeError("provider_timeout") from exc
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                if target:
                    measurement_store.finish(target, status="connect_failure", duration_ms=round((time.monotonic() - started) * 1000), billing_state="not_billable")
                if attempt == 0:
                    continue
                raise RuntimeError("provider_unavailable") from exc
            except httpx.HTTPError as exc:
                if target:
                    measurement_store.finish(target, status="connect_failure", duration_ms=round((time.monotonic() - started) * 1000), billing_state="unknown")
                raise RuntimeError("provider_unavailable") from exc
            try:
                response_payload = response.json()
            except ValueError:
                response_payload = None
            usage_status, usage = parse_usage(response_payload)
            if target:
                measurement_store.finish(
                    target, status="success" if response.is_success else "http_error",
                    duration_ms=round((time.monotonic() - started) * 1000),
                    response_bytes=len(response.content), http_status=response.status_code,
                    retryable=response.status_code in RETRYABLE_STATUSES,
                    usage_status=usage_status, usage=usage,
                    billing_state="known" if usage_status in {"complete", "inconsistent"} else "unknown",
                )
            if response.status_code in RETRYABLE_STATUSES:
                if attempt == 0:
                    delay = retry_delay(response)
                    if target:
                        measurement_store.finish(target, retry_delay_ms=round(delay * 1000))
                    await asyncio.sleep(delay)
                    continue
                raise RuntimeError("provider_unavailable")
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise RuntimeError("provider_unavailable") from exc
            choices = response_payload.get("choices") if isinstance(response_payload, dict) else None
            if isinstance(choices, list) and choices and isinstance(choices[0], dict) and choices[0].get("finish_reason") == "length":
                if target:
                    measurement_store.finish(target, status="output_truncated", retryable=False)
                raise ValueError("invalid_model_json:output_truncated")
            try:
                content = message_text(response_payload)
                if not content:
                    raise ValueError("invalid_model_json:missing_content")
                result = validate_result(
                    parse_json_object(content), page_index=page_index, task=task,
                    expected_fields=expected_fields, ocr_text=ocr_text,
                )
                if required_any_fields and not any(name in result.get("fields", {}) for name in required_any_fields):
                    raise ValueError("invalid_model_json:empty_required_fields")
                return result
            except ValueError as exc:
                error = str(exc) if str(exc).startswith("invalid_model_json") else "invalid_model_json"
                if target:
                    measurement_store.finish(target, status="invalid_json", retryable=attempt == 0)
                if attempt == 0:
                    continue
                raise ValueError(error) from exc
    raise RuntimeError("provider_unavailable")


async def probe_provider(
    *, profile: ProfileSpec, timeout: float = 10,
    measurement_store: MeasurementStore | None = None, measurement_context: dict | None = None,
) -> str:
    if not profile.configured:
        return "not_configured"
    target = None
    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            body = request_body(PROBE_PNG, profile, expected_fields=ADMIN_FIELDS)
            serialized = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
            operation_id = f"op_{uuid.uuid4().hex}"
            target = measurement_store.begin(
                measurement_context or {}, operation_id=operation_id, attempt=1,
                request_bytes=len(serialized),
            ) if measurement_store else None
            started = time.monotonic()
            response = await client.post(
                profile.base_url.rstrip("/") + "/chat/completions",
                content=serialized,
                headers={"Authorization": f"Bearer {profile.api_key}", "Content-Type": "application/json"},
            )
            try:
                response_payload = response.json()
            except ValueError:
                response_payload = None
            usage_status, usage = parse_usage(response_payload)
            if target:
                measurement_store.finish(
                    target, status="success" if response.is_success else "http_error",
                    duration_ms=round((time.monotonic() - started) * 1000),
                    response_bytes=len(response.content), http_status=response.status_code,
                    retryable=response.status_code in RETRYABLE_STATUSES,
                    usage_status=usage_status, usage=usage,
                    billing_state="known" if usage_status in {"complete", "inconsistent"} else "unknown",
                )
    except httpx.HTTPError:
        if target:
            measurement_store.finish(target, status="connect_failure", duration_ms=round((time.monotonic() - started) * 1000), billing_state="unknown")
        return "unreachable"
    if not response.is_success:
        return "reachable"
    try:
        content = message_text(response_payload)
        validate_result(parse_json_object(content), expected_fields=ADMIN_FIELDS)
    except (TypeError, ValueError):
        if target:
            measurement_store.finish(target, status="invalid_json")
        return "reachable"
    return "ready"
