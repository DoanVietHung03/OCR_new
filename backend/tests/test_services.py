import json
from dataclasses import replace

import pytest

from app.services.field_policy import ADMIN_FIELDS, COVER_FIELDS, annotate
from app.services.jobs import ApprovalBlocked, JobStore, materialize_documents, validate_segments
from app.services.ocr_runner import message_text, parse_json_object, request_body, validate_result
from app.services.providers import MINIMAX, QWEN
from app.services.providers import enabled_profiles, validate_profiles
from app.settings import Settings


def completed_job(store: JobStore, pdf_bytes: bytes) -> dict:
    job = store.create({"file_count": 1, "provider": "minimax", "model": "test"})
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


def test_new_job_default_is_minimax_and_explicit_legacy_provider_is_preserved(tmp_path):
    store = JobStore(tmp_path)
    assert store.create({"file_count": 1})["provider_profile_id"] == "minimax"
    legacy = store.create({"file_count": 1, "provider": "legacy-provider", "provider_profile_id": "legacy-provider"})
    assert (legacy["provider"], legacy["provider_profile_id"]) == ("legacy-provider", "legacy-provider")


def test_filesystem_boundary_and_invalid_upload_is_terminal(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "minimax"})
    assert store.add_pdf(job["id"], "folder/doc.pdf", pdf_bytes)["status"] == "ready"

    invalid = store.create({"file_count": 1, "provider": "minimax"})
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
    job = store.create({"file_count": 1, "provider": "minimax"})
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
        "value": "1", "confidence": 0.9, "bbox": [0.1, 0.2, 0.4, 0.3], "page_index": 0,
        "suggested_value": "2", "suggestion_confidence": 0.8,
        "suggestion_reason": "normalized", "suggestion_source": "spoofed",
    }, "trich_yeu": "Tóm tắt", "unknown": {"value": "ignored"}}}, page_index=2)
    assert result["fields"]["so_van_ban"] == {
        "value": "1", "confidence": 0.9, "bbox": [0.1, 0.2, 0.4, 0.3], "page_index": 2,
        "needs_review": False, "suggested_value": "2", "suggestion_confidence": 0.8,
        "suggestion_reason": "normalized", "suggestion_source": "provider",
    }
    assert result["fields"]["trich_yeu"] == {
        "value": "Tóm tắt", "confidence": None, "bbox": [], "page_index": 2,
        "needs_review": True, "evidence_reason": "bbox_missing",
    }
    assert result["warnings"] == ["unknown_field"]
    invalid_bbox = validate_result({"fields": {"so_van_ban": {
        "value": "1", "confidence": 0.9, "bbox": [0, 0, 100, 100],
    }}})
    assert invalid_bbox["fields"]["so_van_ban"]["bbox"] == []
    assert invalid_bbox["fields"]["so_van_ban"]["evidence_reason"] == "bbox_invalid"
    assert invalid_bbox["fields"]["so_van_ban"]["needs_review"]
    assert invalid_bbox["warnings"] == ["invalid_field_value"]
    uncertain_bbox = validate_result({"fields": {"so_van_ban": {
        "value": "1", "confidence": 0.9, "bbox": [],
    }}})
    assert uncertain_bbox["fields"]["so_van_ban"]["bbox"] == []
    assert uncertain_bbox["fields"]["so_van_ban"]["evidence_reason"] == "bbox_missing"
    assert uncertain_bbox["warnings"] == []
    empty = validate_result({"fields": {"nguoi_ky": {
        "value": "  ", "confidence": 0.99, "bbox": [0.1, 0.1, 0.2, 0.2],
    }}})
    assert empty == {"fields": {}, "warnings": []}
    conflict = validate_result({"fields": {"so_tai_lieu": {
        "value": 23, "confidence": 0.9, "bbox": [0.2, 0.8, 0.4, 0.85],
    }}}, expected_fields=COVER_FIELDS, ocr_text="Số tài liệu: ...33...")
    assert conflict["fields"]["so_tai_lieu"]["source_text"] == "Số tài liệu: ...33..."
    assert conflict["fields"]["so_tai_lieu"]["bbox"] == []
    assert conflict["fields"]["so_tai_lieu"]["needs_review"]
    assert conflict["fields"]["so_tai_lieu"]["review_reason"] == "validation_warning"
    assert conflict["warnings"] == ["invalid_field_value"]
    inconsistent = validate_result({"fields": {"nguoi_ky": {
        "value": "Trương Sức", "source_text": "Trương Tức",
        "confidence": 0.95, "bbox": [0.5, 0.5, 0.8, 0.6],
    }}})
    assert inconsistent["fields"]["nguoi_ky"]["bbox"] == []
    assert inconsistent["fields"]["nguoi_ky"]["review_reason"] == "validation_warning"
    assert inconsistent["fields"]["nguoi_ky"].get("evidence_reason", "") == ""
    assert inconsistent["warnings"] == ["invalid_field_value"]
    date = validate_result({"fields": {"ngay_ban_hanh": {
        "value": "2016-05-18", "source_text": "ngày 18 tháng 5 năm 2016",
        "confidence": 0.9, "bbox": [0.5, 0.5, 0.8, 0.6],
    }}})
    assert date["fields"]["ngay_ban_hanh"]["confidence"] == 0.9
    assert parse_json_object('```json\n{"fields": {}}\n```') == {"fields": {}}
    assert parse_json_object(
        'analysis {"fields": {}} final {"fields": {"so_van_ban": {"value": "1176"}}}'
    ) == {"fields": {"so_van_ban": {"value": "1176"}}}
    assert message_text({"choices": [{"message": {"content": [{"type": "text", "text": "A"}, {"type": "text", "text": "B"}]}}]}) == "A\nB"
    with pytest.raises(ValueError, match="invalid_model_json"):
        validate_result({"not_fields": {}})


def test_segmentation_requires_complete_source_and_materializes_one_document_store():
    valid = [
        {"logical_document_type": "dossier_cover", "start_page": 0, "end_page": 0},
        {"logical_document_type": "administrative_document", "start_page": 1, "end_page": 2},
        {"logical_document_type": "excluded", "start_page": 3, "end_page": 3},
    ]
    validate_segments(4, valid)
    with pytest.raises(ValueError, match="invalid_segmentation"):
        validate_segments(4, valid[:2])
    validate_segments(1, [{"logical_document_type": "dossier_cover", "start_page": 0, "end_page": 0}])
    validate_segments(3, [{"logical_document_type": "administrative_document", "start_page": 0, "end_page": 2}])
    sources = [{"id": "source-1", "file_name": "dossier.pdf", "confirmed_segments": valid}]
    documents = materialize_documents("job-id", sources)
    assert [item["logical_document_type"] for item in documents] == ["dossier_cover", "administrative_document"]
    assert [page["source_page_index"] for page in documents[1]["pages"]] == [1, 2]


def test_multi_pdf_dossier_is_validated_across_the_job(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 2, "processing_mode": "combined_dossier"})
    store.add_pdf(job["id"], "Scan_0000.pdf", pdf_bytes)
    store.add_pdf(job["id"], "Scan_0001.pdf", pdf_bytes)
    sources = store.read(job["id"])["source_pdfs"]
    for source in sources:
        source.update(page_count=1, revision=1)
    store.update(job["id"], status="awaiting_segmentation_review", source_pdfs=sources)

    cover = [{"logical_document_type": "dossier_cover", "start_page": 0, "end_page": 0}]
    document = [{"logical_document_type": "administrative_document", "start_page": 0, "end_page": 0}]
    waiting = store.confirm_segmentation(job["id"], sources[0]["id"], 1, cover)
    assert waiting["status"] == "awaiting_segmentation_review"
    confirmed = store.confirm_segmentation(job["id"], sources[1]["id"], 1, document)
    assert confirmed["status"] == "segmentation_confirmed"
    assert (confirmed["dossier_cover_count"], confirmed["administrative_document_count"]) == (1, 1)


def test_new_document_policy_adds_missing_field_atomically(tmp_path, pdf_bytes):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "processing_mode": "administrative_document"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    document = annotate({
        "id": "document", "logical_document_type": "administrative_document", "fields": {
            "co_quan_ban_hanh": {
                "value": "A", "review_reason": "missing_evidence",
                "evidence_reason": "bbox_missing", "needs_review": True,
            },
            "so_van_ban": {"value": "1"}, "trich_yeu": {"value": "T"},
        }, "pages": [{"page_index": 0, "status": "completed", "error": ""}],
    })
    store.update(job["id"], status="completed", documents=[document])
    with pytest.raises(ApprovalBlocked):
        store.apply_review(job["id"], "document", [{"field": "nguoi_ky", "old_value": None, "new_value": "B"}])
    assert "nguoi_ky" not in store.read(job["id"])["documents"][0]["fields"]
    saved, approved = store.apply_review(job["id"], "document", [{"field": "ngay_ban_hanh", "old_value": None, "new_value": "2026-07-22"}])
    assert approved["review_status"] == "approved"
    assert approved["approval_blockers"] == []
    assert {"code": "field_needs_review", "field": "co_quan_ban_hanh"} in approved["review_risks"]
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
    body = request_body(b"image", MINIMAX, expected_fields=COVER_FIELDS)
    assert set(body) == {"model", "temperature", "messages"}
    prompt = body["messages"][0]["content"][0]["text"]
    assert all(name in prompt for name in COVER_FIELDS)
    assert "khoa" in COVER_FIELDS
    assert "hop_so" not in COVER_FIELDS
    assert "co_quan_ban_hanh" not in prompt
    assert "all consecutive bold organization" in prompt
    assert "separate from nhiem_ky" in prompt
    assert "only the value after the printed label Phông số" in prompt
    assert "printed label and its visible value" in prompt
    assert "use bbox []" in prompt
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
    prompt = request_body(b"image", MINIMAX, expected_fields=ADMIN_FIELDS)["messages"][0]["content"][0]["text"]
    assert all(prefix in prompt for prefix in ("TM.", "Q.", "KT.", "TL.", "TUQ."))
    assert "KT. BỘ TRƯỞNG" in prompt
    assert "do not reduce it to KT. alone" in prompt
    assert "THỨ TRƯỞNG" in prompt
    assert "empty string" in prompt
    assert "after Số: or Văn bản số" in prompt
    assert "archive/file code" in prompt
    assert "A.30.15.03.05.001" in prompt
    assert "anywhere on the page" in prompt
    assert "Lưu: VT, KH-TC (PTT)" in prompt
    assert "normalized to 0..1" in prompt
    assert "not a nearby section or the whole page" in prompt
    assert "red circular seal" in prompt
    assert "handwriting, or signature ink overlaps it" in prompt

    cover_prompt = request_body(b"image", MINIMAX, expected_fields=COVER_FIELDS)["messages"][0]["content"][0]["text"]
    assert "dossier cover" in cover_prompt
    assert "so_van_ban is" not in cover_prompt


def test_provider_request_policies_are_isolated():
    minimax = request_body(b"image", MINIMAX)
    qwen = request_body(b"image", QWEN)
    assert [part["type"] for part in minimax["messages"][0]["content"]] == ["text", "image_url"]
    assert [part["type"] for part in qwen["messages"][0]["content"]] == ["text", "image_url", "text"]
    assert qwen["messages"][0]["content"][0]["text"] == "Analyze this image."
    assert set(minimax) == {"model", "temperature", "messages"}
    assert not {"reasoning_effort", "max_tokens", "response_format", "think", "options"} & qwen.keys()

    controlled = request_body(
        b"image",
        replace(QWEN, thinking_mode=False, structured_output=True, max_tokens_by_task=(("metadata", 2048),)),
    )
    assert controlled["reasoning_effort"] == "none"
    assert controlled["max_tokens"] == 2048
    assert controlled["response_format"]["json_schema"]["schema"]["required"] == ["fields"]


def test_profile_registry_validates_allowlist_and_hides_private_config():
    config = Settings(
        _env_file=None, ocr_auth_mode="disabled",
        ocr_enabled_profiles="minimax,ollama_qwen3_vl_8b", ocr_default_profile="minimax",
        minimax_base_url="https://minimax.test/v1", minimax_api_key="secret-a",
        qwen_base_url="http://ollama.test/v1", qwen_api_key="secret-b",
    )
    profiles = enabled_profiles(config)
    assert [profile.id for profile in profiles] == ["minimax", "ollama_qwen3_vl_8b"]
    assert profiles[1].model == "qwen3-vl:8b"
    assert "secret" not in json.dumps([profile.public() for profile in profiles])
    assert "test/v1" not in json.dumps([profile.public() for profile in profiles])

    for enabled, default in ((",", "minimax"), ("minimax,minimax", "minimax"), ("unknown", "unknown"), ("minimax", "ollama_qwen3_vl_8b")):
        invalid = Settings(
            _env_file=None, ocr_auth_mode="disabled",
            ocr_enabled_profiles=enabled, ocr_default_profile=default,
        )
        with pytest.raises(ValueError):
            enabled_profiles(invalid)

    optional = Settings(
        _env_file=None, ocr_auth_mode="disabled", ocr_enabled_profiles="minimax,ollama_qwen3_vl_8b",
        minimax_base_url="https://minimax.test/v1", minimax_api_key="secret",
    )
    assert enabled_profiles(optional)[1].public()["status"] == "not_configured"

    missing_default = Settings(
        _env_file=None, ocr_auth_mode="disabled", ocr_enabled_profiles="minimax,ollama_qwen3_vl_8b",
        ocr_default_profile="ollama_qwen3_vl_8b", minimax_base_url="https://minimax.test/v1",
        minimax_api_key="secret",
    )
    with pytest.raises(ValueError, match="OCR_DEFAULT_PROFILE is not configured"):
        validate_profiles(missing_default)


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
