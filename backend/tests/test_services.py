from app.services.jobs import JobStore
from app.services.ocr_runner import validate_result

def test_filesystem_boundary_and_atomic_job(tmp_path):
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "ocr_method": "qwen"})
    assert (tmp_path / job["id"] / "job.json").is_file()
    assert store.add_pdf(job["id"], "folder/doc.pdf", b"%PDF-1.4 test")["status"] == "ready"
    try: store.add_pdf(job["id"], "../escape.pdf", b"%PDF-1.4 test")
    except ValueError as exc: assert str(exc) == "invalid_path"
    else: raise AssertionError("path traversal accepted")

def test_runner_normalizes_alias_and_rejects_unknown_field():
    result = validate_result({"fields": {"so_hieu": {"value": "1", "confidence": .9, "bbox": [0, 0, 1, 1], "page_index": 0}}})
    assert "so_van_ban" in result["fields"]
    try: validate_result({"fields": {"unknown": {}}})
    except ValueError as exc: assert "invalid_model_json" in str(exc)
    else: raise AssertionError("unknown field accepted")
