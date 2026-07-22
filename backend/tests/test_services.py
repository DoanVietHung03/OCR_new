import importlib.util
from pathlib import Path

import pytest

from app.services.jobs import JobStore
from app.services.ocr_runner import message_text, parse_json_object, validate_result


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
    assert store.read(invalid["id"])["status"] == "error"


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
    source = Path(__file__).parents[2] / "src" / "ocr" / "jobs.py"
    spec = importlib.util.spec_from_file_location("legacy_jobs", source)
    assert spec and spec.loader
    legacy_jobs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(legacy_jobs)

    new_store = JobStore(tmp_path)
    job = new_store.create({"file_count": 1, "provider": "qwen"})
    new_store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    new_store.update(job["id"], future_field={"kept": True})
    legacy_jobs.JobStore(tmp_path).update(job["id"], legacy_field="also-kept")

    before = (new_store.path(job["id"]) / "job.json").read_bytes()
    restored = new_store.read(job["id"])
    assert (new_store.path(job["id"]) / "job.json").read_bytes() == before
    assert restored["future_field"] == {"kept": True}
    assert restored["legacy_field"] == "also-kept"


def test_runner_accepts_partial_metadata_and_markdown_json():
    result = validate_result({"fields": {"so_hieu": {
        "value": "1", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0,
    }, "trich_yeu": "Tóm tắt", "unknown": {"value": "ignored"}}}, page_index=2)
    assert "so_van_ban" in result["fields"]
    assert result["fields"]["trich_yeu"] == {
        "value": "Tóm tắt", "confidence": None, "bbox": [], "page_index": 2, "needs_review": True,
    }
    assert result["warnings"] == ["unknown_field"]
    assert parse_json_object('```json\n{"fields": {}}\n```') == {"fields": {}}
    assert message_text({"choices": [{"message": {"content": [{"type": "text", "text": "A"}, {"type": "text", "text": "B"}]}}]}) == "A\nB"
    with pytest.raises(ValueError, match="invalid_model_json"):
        validate_result({"not_fields": {}})
