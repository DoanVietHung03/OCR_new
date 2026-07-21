from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def use_store(tmp_path, monkeypatch):
    import app.api.routes as routes

    store = routes.JobStore(tmp_path)
    monkeypatch.setattr(routes, "store", store)
    monkeypatch.setattr(routes.settings, "ocr_base_url", "http://provider.test/v1")
    monkeypatch.setattr(routes.settings, "ocr_model", "test-model")
    monkeypatch.setattr(routes.settings, "ocr_endpoint_external", False)
    return store


def create_and_upload(pdf_bytes: bytes) -> dict:
    job = client.post("/api/jobs", json={"file_count": 1, "upload_name": "a.pdf"}).json()
    response = client.put(f"/api/jobs/{job['id']}/files?path=a.pdf", content=pdf_bytes)
    assert response.status_code == 200
    return response.json()["job"]


def test_create_upload_start_is_one_shot(tmp_path, monkeypatch, pdf_bytes):
    store = use_store(tmp_path, monkeypatch)
    calls = []
    monkeypatch.setattr("app.workers.tasks.dispatch", calls.append)

    job = create_and_upload(pdf_bytes)
    first = client.post(f"/api/jobs/{job['id']}/start")
    second = client.post(f"/api/jobs/{job['id']}/start")

    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "starting"
    assert calls == [job["id"]]
    assert store.read(job["id"])["provider"] == "qwen"


def test_invalid_pdf_fails_job_before_dispatch(tmp_path, monkeypatch):
    store = use_store(tmp_path, monkeypatch)
    job = client.post("/api/jobs", json={"file_count": 1}).json()

    response = client.put(f"/api/jobs/{job['id']}/files?path=a.pdf", content=b"not a pdf")

    assert response.status_code == 400
    assert store.read(job["id"])["status"] == "error"
    assert store.read(job["id"])["error"] == "unsupported_file"


def test_encrypted_and_page_limit_pdfs_fail_fast(
    tmp_path, monkeypatch, encrypted_pdf_bytes, oversized_pdf_bytes
):
    store = use_store(tmp_path, monkeypatch)
    for content, code in (
        (encrypted_pdf_bytes, "encrypted_pdf"),
        (oversized_pdf_bytes, "pdf_page_limit_exceeded"),
    ):
        job = client.post("/api/jobs", json={"file_count": 1}).json()
        response = client.put(f"/api/jobs/{job['id']}/files?path=a.pdf", content=content)
        assert response.status_code == 400
        assert store.read(job["id"])["error"] == code


def test_dispatch_failure_becomes_interrupted(tmp_path, monkeypatch, pdf_bytes):
    store = use_store(tmp_path, monkeypatch)
    job = create_and_upload(pdf_bytes)

    def unavailable(_: str) -> None:
        raise RuntimeError("broker secret must not persist")

    monkeypatch.setattr("app.workers.tasks.dispatch", unavailable)
    response = client.post(f"/api/jobs/{job['id']}/start")

    assert response.status_code == 503
    assert store.read(job["id"])["status"] == "interrupted"
    assert store.read(job["id"])["error"] == "worker_interrupted"


def test_delete_allows_ready_but_skips_active(tmp_path, monkeypatch, pdf_bytes):
    store = use_store(tmp_path, monkeypatch)
    ready = create_and_upload(pdf_bytes)
    active = create_and_upload(pdf_bytes)
    store.begin_start(active["id"])

    preview = client.post("/api/jobs/delete-preview", json={"job_ids": [ready["id"], active["id"]]}).json()
    result = client.post("/api/jobs/bulk-delete", json={"job_ids": [ready["id"], active["id"]]}).json()

    assert [item["id"] for item in preview["deletable"]] == [ready["id"]]
    assert result == {"deleted": [ready["id"]], "skipped": [active["id"]], "failed": []}


def test_crop_evidence_persists_and_rerun_is_clean(tmp_path, monkeypatch, pdf_bytes):
    from app.workers.tasks import render_pdf

    store = use_store(tmp_path, monkeypatch)
    monkeypatch.setattr("app.workers.tasks.dispatch", lambda _job_id: None)
    source = create_and_upload(pdf_bytes)
    render_pdf(
        store.path(source["id"]) / "uploads" / "a.pdf",
        store.path(source["id"]) / "artifacts" / "a",
    )
    store.update(source["id"], status="completed", correction_count=1, documents=[{
        "id": "a",
        "file_name": "a.pdf",
        "status": "completed",
        "fields": {"so_van_ban": {
            "value": "1", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0,
        }},
        "pages": [{
            "page_index": 0,
            "image_url": f"/api/jobs/{source['id']}/artifacts/a/page-1.png",
        }],
    }])

    crop = client.post(f"/api/jobs/{source['id']}/manual-crop", json={
        "document_id": "a",
        "page_index": 0,
        "field": "so_van_ban",
        "rect": {"x": 0, "y": 0, "width": 20, "height": 20},
    })
    rerun = client.post(f"/api/jobs/{source['id']}/rerun", json={})

    assert crop.status_code == 200
    assert store.read(source["id"])["documents"][0]["crop_evidence"][0]["field"] == "so_van_ban"
    assert rerun.status_code == 200
    copied = store.read(rerun.json()["id"])
    assert copied["status"] == "starting"
    assert copied["documents"] == []
    assert copied["correction_count"] == 0
    assert len(list((store.path(copied["id"]) / "uploads").glob("*.pdf"))) == 1
    assert store.read(source["id"])["status"] == "completed"


def test_error_envelope_and_openapi(monkeypatch):
    monkeypatch.setattr("app.api.routes.read_system_metrics", lambda _: {
        "cpu_percent": 12.5,
        "memory_percent": 34.5,
        "disk": {"used_bytes": 1, "total_bytes": 4, "free_bytes": 3, "percent": 25},
        "gpu": {"status": "unavailable", "devices": []},
    })
    assert client.get("/api/jobs/not-a-uuid").json()["detail"] == {
        "code": "not_found",
        "message": "not_found",
    }
    job_schema = client.get("/openapi.json").json()["components"]["schemas"]["JobResponse"]
    assert {"documents", "provider", "endpoint_external", "correction_count"} <= set(job_schema["properties"])
    metrics = client.get("/api/system-metrics").json()
    assert metrics["disk"]["total_bytes"] == 4
    assert metrics["gpu"] == {"status": "unavailable", "devices": []}


def test_gpu_metrics_is_safe_for_available_unavailable_and_error(monkeypatch):
    import app.services.system_metrics as metrics

    monkeypatch.setattr(metrics.shutil, "which", lambda _: None)
    assert metrics.gpu_metrics() == {"status": "unavailable", "devices": []}

    monkeypatch.setattr(metrics.shutil, "which", lambda _: "nvidia-smi")
    monkeypatch.setattr(metrics.subprocess, "run", lambda *_args, **_kwargs: type("Result", (), {
        "stdout": "0, Test GPU, 12, 1024, 8192, 45\n",
    })())
    assert metrics.gpu_metrics()["devices"][0]["name"] == "Test GPU"

    monkeypatch.setattr(metrics.subprocess, "run", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError()))
    assert metrics.gpu_metrics() == {"status": "error", "devices": []}


def test_system_metrics_returns_nullable_values_when_host_reads_fail(monkeypatch, tmp_path):
    import app.services.system_metrics as metrics

    monkeypatch.setattr(metrics.psutil, "cpu_percent", lambda: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics.shutil, "disk_usage", lambda _path: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics, "gpu_metrics", lambda: {"status": "unavailable", "devices": []})

    assert metrics.system_metrics(str(tmp_path)) == {
        "cpu_percent": None,
        "memory_percent": None,
        "disk": None,
        "gpu": {"status": "unavailable", "devices": []},
    }
