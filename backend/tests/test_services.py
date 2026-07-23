import json

import pytest

from app.services.field_policy import ADMIN_FIELDS, COVER_FIELDS, annotate
from app.services.jobs import ApprovalBlocked, JobStore, materialize_documents, validate_segments
from app.services.ocr_runner import message_text, parse_json_object, request_body, validate_result


def completed_job(store: JobStore, pdf_bytes: bytes) -> dict:
    job = store.create({"file_count": 1, "provider": "qwen", "model": "test"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    return store.update(job["id"], status="completed", documents=[{
        "id": "document",
        "file_name": "document.pdf",
        "status": "completed",
        "fields": {"so_van_ban": {
            "value": "OLD", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0,
        }},
        "pages": [{"page_index": 0, "image_url": "/page.png"}],
    }])


def test_filesystem_boundary_and_invalid_upload_is_terminal(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen"})
    assert store.add_pdf(job["id"], "folder/doc.pdf", pdf_bytes)["status"] == "ready"

    invalid = store.create({"file_count": 1, "provider": "qwen"})
    with pytest.raises(ValueError, match="invalid_path"):
        store.add_pdf(invalid["id"], "../escape.pdf", pdf_bytes)
    assert store.read(invalid["id"])["failure"]["code"] == "invalid_path"


def test_correction_approval_and_crop_survive_reload(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = completed_job(store, pdf_bytes)
    changed, document = store.apply_review(job["id"], "document", [{
        "field": "so_van_ban", "old_value": "OLD", "new_value": "NEW",
    }])
    evidence = {
        "crop_image": "/crop.png", "evidence_source": "manual_crop",
        "evidence_status": "trusted", "bbox": {"x": 0, "y": 0, "width": 10, "height": 10},
        "page_index": 0, "field": "so_van_ban", "created_at": changed["updated_at"],
    }
    store.add_crop_evidence(job["id"], "document", evidence)

    restored = JobStore(tmp_path).read(job["id"])
    field = restored["documents"][0]["fields"]["so_van_ban"]
    assert (field["ocr_value"], field["value"]) == ("OLD", "NEW")
    assert restored["documents"][0]["review_status"] == "approved"
    assert restored["documents"][0]["crop_evidence"] == [evidence]
    assert {event["code"] for event in restored["events"]} >= {
        "document_corrected", "document_approved", "manual_crop_created",
    }
    export_url = restored["documents"][0]["corrected_artifact"]
    exported = json.loads((store.path(job["id"]) / "artifacts" / "document" / "corrected.json").read_text(encoding="utf-8"))
    assert export_url.endswith("/artifacts/document/corrected.json")
    assert exported["fields"]["so_van_ban"]["value"] == "NEW"
    assert "source_text" not in json.dumps(exported)
    assert len(list((store.path(job["id"]) / "corrections").glob("*.json"))) == 1
    assert document["approved_at"]

    with pytest.raises(ValueError, match="correction_conflict"):
        store.apply_review(job["id"], "document", [{
            "field": "so_van_ban", "old_value": "OLD", "new_value": "LOST",
        }])


def test_approval_without_correction_is_audited(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = completed_job(store, pdf_bytes)
    restored, document = store.apply_review(job["id"], "document", [])
    assert restored["correction_count"] == 0
    assert document["review_status"] == "approved"
    assert len(list((store.path(job["id"]) / "corrections").glob("*.json"))) == 1


def test_legacy_and_new_store_preserve_unknown_fields(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    path = store.path(job["id"]) / "job.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload.update(future_field={"kept": True}, legacy_field="also-kept")
    path.write_text(json.dumps(payload), encoding="utf-8")

    before = path.read_bytes()
    restored = store.read(job["id"])
    assert path.read_bytes() == before
    assert restored["future_field"] == {"kept": True}
    assert restored["legacy_field"] == "also-kept"


def test_runner_accepts_partial_metadata_and_markdown_json():
    result = validate_result({"fields": {"so_hieu": {
        "value": "1", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0,
        "suggested_value": "2", "suggestion_confidence": 0.8,
        "suggestion_reason": "normalized", "suggestion_source": "spoofed",
    }, "trich_yeu": "Tóm tắt", "unknown": {"value": "ignored"}}}, page_index=2)
    assert result["fields"]["so_van_ban"] == {
        "value": "1", "confidence": 0.9, "bbox": [0.0, 0.0, 1.0, 1.0], "page_index": 2,
        "needs_review": False, "suggested_value": "2", "suggestion_confidence": 0.8,
        "suggestion_reason": "normalized", "suggestion_source": "provider",
    }
    assert result["fields"]["trich_yeu"] == {
        "value": "Tóm tắt", "confidence": None, "bbox": [], "page_index": 2, "needs_review": True,
    }
    assert result["warnings"] == ["unknown_field"]
    assert parse_json_object('```json\n{"fields": {}}\n```') == {"fields": {}}
    assert message_text({"choices": [{"message": {"content": [{"type": "text", "text": "A"}, {"type": "text", "text": "B"}]}}]}) == "A\nB"
    with pytest.raises(ValueError, match="invalid_model_json"):
        validate_result({"not_fields": {}})


def test_segmentation_requires_complete_dossier_and_materializes_one_document_store():
    valid = [
        {"logical_document_type": "dossier_cover", "start_page": 0, "end_page": 0},
        {"logical_document_type": "administrative_document", "start_page": 1, "end_page": 2},
        {"logical_document_type": "excluded", "start_page": 3, "end_page": 3},
    ]
    validate_segments(4, valid)
    with pytest.raises(ValueError, match="invalid_segmentation"):
        validate_segments(4, valid[:2])
    sources = [{"id": "source-1", "file_name": "dossier.pdf", "confirmed_segments": valid}]
    documents = materialize_documents("job-id", sources)
    assert [item["logical_document_type"] for item in documents] == ["dossier_cover", "administrative_document"]
    assert [page["source_page_index"] for page in documents[1]["pages"]] == [1, 2]


def test_new_document_policy_adds_missing_field_atomically(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "processing_mode": "administrative_document"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    document = annotate({
        "id": "document", "logical_document_type": "administrative_document", "fields": {
            "co_quan_ban_hanh": {"value": "A"}, "so_van_ban": {"value": "1"}, "trich_yeu": {"value": "T"},
        }, "pages": [{"page_index": 0, "status": "completed", "error": ""}],
    })
    store.update(job["id"], status="completed", documents=[document])
    with pytest.raises(ApprovalBlocked):
        store.apply_review(job["id"], "document", [{"field": "nguoi_ky", "old_value": None, "new_value": "B"}])
    assert "nguoi_ky" not in store.read(job["id"])["documents"][0]["fields"]
    saved, approved = store.apply_review(job["id"], "document", [{"field": "ngay_ban_hanh", "old_value": None, "new_value": "2026-07-22"}])
    assert approved["review_status"] == "approved"
    assert approved["fields"]["ngay_ban_hanh"]["ocr_value"] is None
    assert approved["expected_fields"] == list(ADMIN_FIELDS)
    assert len(COVER_FIELDS) == 13
    assert saved["correction_count"] == 1


def test_dossier_approval_requires_confirmed_segmentation(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "processing_mode": "combined_dossier"})
    store.add_pdf(job["id"], "dossier.pdf", pdf_bytes)
    store.update(job["id"], status="completed", source_pdfs=[{"id": "source-1", "confirmed": False}], documents=[{
        "id": "document", "logical_document_type": "administrative_document", "fields": {}, "pages": [],
    }])
    with pytest.raises(ApprovalBlocked) as blocked:
        store.apply_review(job["id"], "document", [])
    assert blocked.value.blockers[0] == {"code": "segmentation_unconfirmed"}
    assert {item.get("field") for item in blocked.value.blockers[1:]} == {
        "co_quan_ban_hanh", "so_van_ban", "ngay_ban_hanh", "trich_yeu",
    }


def test_cover_prompt_and_parser_share_the_policy_allowlist():
    body = request_body(b"image", "model", expected_fields=COVER_FIELDS)
    assert set(body) == {"model", "temperature", "messages"}
    prompt = body["messages"][0]["content"][0]["text"]
    assert all(name in prompt for name in COVER_FIELDS)
    assert "co_quan_ban_hanh" not in prompt
    result = validate_result({"fields": {"co_quan_luu_tru": "A", "so_van_ban": "ignored"}}, expected_fields=COVER_FIELDS)
    assert set(result["fields"]) == {"co_quan_luu_tru"}
    assert result["warnings"] == ["unknown_field"]
    cover = annotate({"logical_document_type": "dossier_cover", "fields": {
        "bat_dau": {"value": "2026"}, "ket_thuc": {"value": "2025"},
        "so_tai_lieu": {"value": 0},
    }})
    assert {issue["field"] for issue in cover["approval_blockers"] if issue["code"] == "invalid_required_value"} == {"ket_thuc"}
    assert {issue["field"] for issue in cover["review_risks"] if issue["code"] == "invalid_optional_value"} == {"so_tai_lieu"}


def test_administrative_prompt_requires_complete_signing_authority_line():
    prompt = request_body(b"image", "model", expected_fields=ADMIN_FIELDS)["messages"][0]["content"][0]["text"]
    assert all(prefix in prompt for prefix in ("TM.", "Q.", "KT.", "TL.", "TUQ."))
    assert "KT. BỘ TRƯỞNG" in prompt
    assert "do not reduce it to KT. alone" in prompt
    assert "THỨ TRƯỞNG" in prompt
    assert "empty string" in prompt
    assert "after Số: or Văn bản số" in prompt
    assert "archive/file code" in prompt

    cover_prompt = request_body(b"image", "model", expected_fields=COVER_FIELDS)["messages"][0]["content"][0]["text"]
    assert "dossier cover" in cover_prompt
    assert "so_van_ban is" not in cover_prompt


def test_review_policy_includes_validation_warning_and_segmentation_blocker():
    document = annotate({
        "logical_document_type": "administrative_document",
        "fields": {
            "co_quan_ban_hanh": {"value": "A"}, "so_van_ban": {"value": "1"},
            "ngay_ban_hanh": {"value": "2026-07-22"}, "trich_yeu": {"value": "T"},
            "nguoi_ky": {"value": "B", "review_reason": "validation_warning", "needs_review": False},
        },
        "pages": [],
    }, segmentation_confirmed=False)
    assert {issue["code"] for issue in document["approval_blockers"]} == {"segmentation_unconfirmed"}
    assert {issue["field"] for issue in document["review_risks"] if issue["code"] == "field_needs_review"} == {"nguoi_ky"}


def test_non_scalar_legacy_field_is_read_only(tmp_path):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1})
    store.update(job["id"], status="completed", documents=[{
        "id": "document", "fields": {"so_van_ban": {"value": {"raw": "01"}}}, "pages": [],
    }])
    with pytest.raises(ValueError, match="invalid_field"):
        store.apply_review(job["id"], "document", [{
            "field": "so_van_ban", "old_value": {"raw": "01"}, "new_value": "01",
        }])
