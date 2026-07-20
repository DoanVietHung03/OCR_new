from app.services.jobs import JobStore

def test_job_persists_across_store_restart(tmp_path):
    first = JobStore(tmp_path)
    job = first.create({"file_count": 1, "ocr_method": "qwen"})
    first.add_pdf(job["id"], "document.pdf", b"%PDF-1.4 test")
    restarted = JobStore(tmp_path)
    restored = restarted.read(job["id"])
    assert restored["status"] == "ready"
    assert restored["uploaded_files"] == 1
    assert (restarted.path(job["id"]) / "uploads" / "document.pdf").read_bytes().startswith(b"%PDF")
