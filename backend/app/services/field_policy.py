"""Canonical field schemas and review policy for new logical documents."""

from __future__ import annotations

import re
from datetime import date
from typing import Any

ADMIN_FIELDS = (
    "co_quan_ban_hanh", "so_van_ban", "quoc_hieu_tieu_ngu", "dia_diem_ban_hanh",
    "ngay_ban_hanh", "loai_van_ban", "trich_yeu", "quyen_han_ky_thay",
    "chuc_vu_nguoi_ky", "nguoi_ky", "ma_luu_tru",
)
SIGNATURE_FIELDS = ("quyen_han_ky_thay", "chuc_vu_nguoi_ky", "nguoi_ky")
COVER_FIELDS = (
    "co_quan_luu_tru", "khoa", "nhiem_ky", "tieu_de_ho_so", "phong_so",
    "muc_luc_so", "ma_luu_tru", "bat_dau", "ket_thuc", "ho_so_dvbq",
    "so_tai_lieu", "thoi_han_bao_quan", "so_trang",
)
SCHEMAS = {"administrative_document": ADMIN_FIELDS, "dossier_cover": COVER_FIELDS}
REQUIRED = {
    "administrative_document": ("co_quan_ban_hanh", "so_van_ban", "ngay_ban_hanh", "trich_yeu"),
    "dossier_cover": ("co_quan_luu_tru", "tieu_de_ho_so", "ma_luu_tru", "bat_dau", "ket_thuc"),
}


def fields_for(kind: str | None) -> tuple[str, ...]:
    return SCHEMAS.get(kind or "", ADMIN_FIELDS)


def required_for(kind: str | None) -> tuple[str, ...]:
    return REQUIRED.get(kind or "", REQUIRED["administrative_document"])


def comparable_date(value: Any) -> tuple[str, int] | None:
    if type(value) is int:
        return "year", value
    if not isinstance(value, str):
        return None
    if re.fullmatch(r"\d{4}", value):
        return "year", int(value)
    try:
        return "date", date.fromisoformat(value).toordinal()
    except ValueError:
        return None


def annotate(document: dict[str, Any], *, segmentation_confirmed: bool = True) -> dict[str, Any]:
    if not document.get("logical_document_type"):
        return document
    expected = list(fields_for(document["logical_document_type"]))
    required = list(required_for(document["logical_document_type"]))
    document.update(expected_fields=expected, required_fields=required)
    fields = document.get("fields", {})
    blockers = [] if segmentation_confirmed else [{"code": "segmentation_unconfirmed"}]
    for name in required:
        value = fields.get(name, {}).get("value")
        if name not in fields or value is None or (isinstance(value, str) and not value.strip()):
            blockers.append({"code": "missing_required_field", "field": name})
        elif isinstance(value, (dict, list)):
            blockers.append({"code": "invalid_required_value", "field": name})
    blockers.extend(
        {"code": "failed_page", "page_index": page.get("page_index")}
        for page in document.get("pages", []) if page.get("status") == "error"
    )
    start, end = (
        comparable_date(fields.get(name, {}).get("value"))
        for name in ("bat_dau", "ket_thuc")
    )
    if start and end and start[0] == end[0] and start[1] > end[1]:
        blockers.append({"code": "invalid_required_value", "field": "ket_thuc"})
    risks = [
        {"code": "optional_missing_field", "field": name}
        for name in expected if name not in required and name not in fields
    ]
    risks += [
        {"code": "field_needs_review", "field": name}
        for name, field in fields.items()
        if field.get("needs_review") or field.get("review_reason") in {
            "low_confidence", "missing_evidence", "validation_warning",
        }
    ]
    risks += [
        {"code": "field_suggestion", "field": name}
        for name, field in fields.items() if field.get("suggested_value") not in (None, "")
    ]
    risks += [
        {"code": "invalid_optional_value", "field": name}
        for name in ("so_tai_lieu", "so_trang")
        if name in fields and (
            type(fields[name].get("value")) is not int or fields[name]["value"] <= 0
        )
    ]
    risks += [
        {"code": "page_warning", "page_index": page.get("page_index")}
        for page in document.get("pages", [])
        if page.get("error") and page.get("status") != "error"
    ]
    risks = list({(risk["code"], risk.get("field"), risk.get("page_index")): risk for risk in risks}.values())
    document.update(approval_blockers=blockers, review_risks=risks, review_risk_count=len(risks))
    return document
