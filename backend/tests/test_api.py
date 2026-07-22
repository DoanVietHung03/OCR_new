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


def test_combined_dossier_confirmation_is_revisioned_and_dispatches_once(tmp_path, monkeypatch, pdf_bytes):
    store = use_store(tmp_path, monkeypatch)
    calls = []
    monkeypatch.setattr("app.workers.tasks.dispatch", calls.append)
    job = client.post("/api/jobs", json={"file_count": 1, "processing_mode": "combined_dossier"}).json()
    uploaded = client.put(f"/api/jobs/{job['id']}/files?path=dossier.pdf", content=pdf_bytes).json()["job"]
    source = uploaded["source_pdfs"][0]
    store.update(job["id"], status="awaiting_segmentation_review", source_pdfs=[{
        **source, "page_count": 3, "revision": 1,
    }])
    segments = [
        {"id": "cover", "logical_document_type": "dossier_cover", "start_page": 0, "end_page": 0},
        {"id": "document", "logical_document_type": "administrative_document", "start_page": 1, "end_page": 2},
    ]
    response = client.post(
        f"/api/jobs/{job['id']}/source-pdfs/{source['id']}/segmentation/confirm",
        json={"revision": 1, "segments": segments},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "extraction_starting"
    assert response.json()["dossier_cover_count"] == response.json()["administrative_document_count"] == 1
    assert calls == [job["id"]]
    stale = client.post(
        f"/api/jobs/{job['id']}/source-pdfs/{source['id']}/segmentation/confirm",
        json={"revision": 1, "segments": segments},
    )
    assert stale.status_code == 409
    assert calls == [job["id"]]
    store.update(job["id"], status="completed", vlm_task="metadata", vlm_pages="first,last", vlm_max_pages=2)
    rerun = client.post(f"/api/jobs/{job['id']}/rerun", json={"rerun_mode": "reuse_segmentation"})
    assert rerun.status_code == 200
    copy = store.read(rerun.json()["id"])
    assert (copy["processing_mode"], copy["vlm_task"], copy["vlm_pages"], copy["vlm_max_pages"]) == ("combined_dossier", "metadata", "first,last", 2)
    assert copy["source_pdfs"][0]["proposal"] == segments
    assert store.read(job["id"])["source_pdfs"][0]["confirmed_segments"] == segments


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
    import app.api.routes as routes

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
    assert {"documents", "provider", "endpoint_external", "correction_count", "started_at", "completed_at"} <= set(job_schema["properties"])
    field_schema = client.get("/openapi.json").json()["components"]["schemas"]["FieldResponse"]
    assert {"raw_value", "source_text", "needs_review", "suggested_value", "evidence_candidates"} <= set(field_schema["properties"])
    page_schema = client.get("/openapi.json").json()["components"]["schemas"]["PageResponse"]
    assert {"text", "ocr_line_count", "avg_score", "images", "quality"} <= set(page_schema["properties"])
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert {"download_url", "size_bytes", "document_id", "page_index"} <= set(schemas["ArtifactEntry"]["properties"])
    assert {"provider_profile_id", "fixture_group", "sample_size", "measured_at"} <= set(schemas["BenchmarkSample"]["properties"])
    assert {"document_type", "warning_count"} <= set(schemas["DocumentIndexItem"]["properties"])
    assert {"provider_profile_id", "document_id", "page_index"} <= set(schemas["SafeEvent"]["properties"])
    assert {"duration_seconds_average", "pages_per_minute", "failure_codes"} <= set(schemas["OperationsReport"]["properties"])
    assert {"total_fields", "confidence_coverage", "evidence_coverage", "warning_documents"} <= set(schemas["QualityReport"]["properties"])
    assert {"load_1m", "load_5m", "load_15m"} <= set(schemas["CPUMetricsResponse"]["properties"])
    metrics = client.get("/api/system-metrics").json()
    assert metrics["disk"]["total_bytes"] == 4
    assert metrics["gpu"] == {"status": "unavailable", "devices": []}
    unsafe = routes.safe_events([{"id": "x", "status": "error", "updated_at": "2026-07-21T00:00:00Z", "error": "secret=https://private"}])
    assert unsafe[0]["code"] == unsafe[0]["message"] == "job_error"


def test_gpu_metrics_is_safe_for_available_unavailable_and_error(monkeypatch):
    import app.services.system_metrics as metrics

    monkeypatch.setattr(metrics.shutil, "which", lambda _: None)
    assert metrics.gpu_metrics() == {"status": "unavailable", "devices": []}

    monkeypatch.setattr(metrics.shutil, "which", lambda _: "nvidia-smi")
    monkeypatch.setattr(metrics.subprocess, "run", lambda *_args, **_kwargs: type("Result", (), {
        "stdout": "0, Test GPU, 12, 1024, 8192, 45, 80.5, 555.1\n",
    })())
    device = metrics.gpu_metrics()["devices"][0]
    assert (device["name"], device["power_w"], device["driver_version"]) == ("Test GPU", 80.5, "555.1")

    monkeypatch.setattr(metrics.subprocess, "run", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError()))
    assert metrics.gpu_metrics() == {"status": "error", "devices": []}


def test_system_metrics_returns_nullable_values_when_host_reads_fail(monkeypatch, tmp_path):
    import app.services.system_metrics as metrics

    monkeypatch.setattr(metrics.psutil, "cpu_percent", lambda: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics.psutil, "cpu_count", lambda logical=True: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics.psutil, "getloadavg", lambda: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics.psutil, "virtual_memory", lambda: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics.platform, "processor", lambda: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics.platform, "system", lambda: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics.platform, "machine", lambda: "test-arch")
    monkeypatch.setattr(metrics.platform, "python_version", lambda: "3.test")
    monkeypatch.setattr(metrics.shutil, "disk_usage", lambda _path: (_ for _ in ()).throw(OSError()))
    monkeypatch.setattr(metrics, "gpu_metrics", lambda: {"status": "unavailable", "devices": []})

    assert metrics.system_metrics(str(tmp_path)) == {
        "cpu_percent": None,
        "memory_percent": None,
        "cpu": None,
        "memory": None,
        "runtime": None,
        "disk": None,
        "gpu": {"status": "unavailable", "devices": []},
    }


def test_code_catalog_crud_persists_and_rejects_stale_revision(tmp_path, monkeypatch):
    import app.api.routes as routes
    from app.services.codes import CodeCatalog

    use_store(tmp_path, monkeypatch)
    monkeypatch.setattr(routes, "codes", CodeCatalog(tmp_path))

    initial = client.get("/api/codes")
    assert initial.status_code == 200
    assert any(item["code"] == "TB" for item in initial.json()["items"])

    created = client.post("/api/codes", json={
        "group": "doc_type", "code": "BC", "label": "BÁO CÁO",
        "keywords": "báo cáo,bc", "order": 4, "active": True,
    })
    assert created.status_code == 201
    revision = created.json()["revision"]

    updated = client.put("/api/codes/BC", json={
        "revision": revision, "label": "Báo cáo", "keywords": "báo cáo",
        "order": 4, "active": True,
    })
    assert updated.status_code == 200
    assert next(item for item in updated.json()["items"] if item["code"] == "BC")["label"] == "Báo cáo"

    stale = client.delete(f"/api/codes/BC?revision={revision}")
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "catalog_conflict"

    monkeypatch.setattr(routes, "codes", CodeCatalog(tmp_path))
    restored = client.get("/api/codes").json()
    assert any(item["code"] == "BC" and item["label"] == "Báo cáo" for item in restored["items"])
    import shutil
    backup = tmp_path / "backup"
    backup.mkdir()
    shutil.copy2(tmp_path / "_codes.json", backup / "_codes.json")
    assert CodeCatalog(backup).read() == restored

    deleted = client.delete(f"/api/codes/BC?revision={restored['revision']}")
    assert deleted.status_code == 200
    assert all(item["code"] != "BC" for item in deleted.json()["items"])


def test_code_catalog_rejects_invalid_input_and_never_overwrites_corruption(tmp_path, monkeypatch):
    import app.api.routes as routes
    import app.services.codes as code_module
    from app.services.codes import CodeCatalog

    use_store(tmp_path, monkeypatch)
    catalog = CodeCatalog(tmp_path)
    monkeypatch.setattr(routes, "codes", catalog)
    assert client.post("/api/codes", json={"group": "doc_type", "code": "bad code", "label": ""}).status_code == 422

    assert client.get("/api/codes").status_code == 200
    original = catalog.path.read_bytes()
    real_replace = code_module.os.replace
    monkeypatch.setattr(code_module.os, "replace", lambda *_: (_ for _ in ()).throw(OSError("replace failed")))
    try:
        catalog.create({"group": "doc_type", "code": "BC", "label": "Báo cáo", "keywords": "", "order": 0, "active": True})
    except OSError:
        pass
    assert catalog.path.read_bytes() == original

    monkeypatch.setattr(code_module.os, "replace", real_replace)
    catalog.path.write_text("{broken", encoding="utf-8")
    corrupt = client.get("/api/codes")
    assert corrupt.status_code == 500
    assert corrupt.json()["detail"]["code"] == "catalog_corrupt"
    assert catalog.path.read_text(encoding="utf-8") == "{broken"


def test_provider_profiles_are_allowlisted_and_safe(tmp_path, monkeypatch):
    use_store(tmp_path, monkeypatch)
    import app.api.routes as routes

    monkeypatch.setattr(routes.settings, "ocr_api_key", "must-not-leak")
    profiles = client.get("/api/provider-profiles")
    assert profiles.status_code == 200
    profile = profiles.json()["profiles"][0]
    assert profile == {
        "id": "qwen", "label": "Qwen", "external": False,
        "status": "configured", "tasks": ["full_ocr", "metadata"],
        "page_modes": ["all", "auto", "first,last"], "max_pages": 100,
        "processing_modes": ["administrative_document", "dossier_cover", "combined_dossier"],
    }
    assert "must-not-leak" not in profiles.text
    assert "provider.test" not in profiles.text

    job = client.post("/api/jobs", json={
        "file_count": 1, "provider_profile_id": "qwen", "vlm_task": "metadata",
        "vlm_pages": "first,last", "vlm_max_pages": 3,
    })
    assert job.status_code == 200
    assert (job.json()["provider_profile_id"], job.json()["vlm_pages"]) == ("qwen", "first,last")

    invalid = client.post("/api/jobs", json={"file_count": 1, "provider_profile_id": "attacker"})
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "invalid_provider_profile"


def test_documents_events_and_reports_are_real_safe_projections(tmp_path, monkeypatch, pdf_bytes):
    store = use_store(tmp_path, monkeypatch)
    job = store.create({"file_count": 1, "provider": "qwen", "model": "test"})
    store.add_pdf(job["id"], "report.pdf", pdf_bytes)
    store.update(job["id"], status="completed", correction_count=1, page_count=2,
                 started_at="2026-07-21T10:00:00+00:00", completed_at="2026-07-21T10:02:00+00:00", logs=[
        "secret=/srv/private api_key=must-not-leak",
    ], documents=[{
        "id": "report & 1", "file_name": "report.pdf", "status": "completed",
        "review_status": "approved", "approved_at": "2026-07-21T11:00:00+00:00",
        "pages": [{"page_index": 0, "image_url": "/page.png"}],
        "fields": {
            "so_van_ban": {"value": "01", "confidence": 0.8, "page_index": 0, "evidence_source": "provider"},
            "trich_yeu": {"value": "Test", "confidence": 1.0, "page_index": 0},
            "document_type": {"value": "Thông báo", "page_index": 0},
        },
    }])

    documents = client.get("/api/documents?query=report&review_status=approved").json()
    assert documents["pagination"]["total"] == 1
    assert documents["items"][0]["deep_link"].endswith("document=report%20%26%201&view=review")
    assert documents["items"][0]["confidence_average"] == 0.9
    assert (documents["items"][0]["document_type"], documents["items"][0]["warning_count"]) == ("Thông báo", 0)

    events = client.get(f"/api/events?job_id={job['id']}").json()
    assert {event["code"] for event in events["items"]} == {"job_created", "job_completed", "document_approved"}
    assert "must-not-leak" not in client.get(f"/api/events?job_id={job['id']}").text
    review_events = client.get(f"/api/events?job_id={job['id']}&category=review&code=document_approved").json()
    assert [(event["category"], event["document_id"]) for event in review_events["items"]] == [("review", "report & 1")]
    scoped_events = client.get(f"/api/events?provider_profile_id=qwen&document_id=report%20%26%201").json()
    assert [event["code"] for event in scoped_events["items"]] == ["document_approved"]

    report = client.get("/api/reports").json()
    assert report["operations"] == {
        "total_jobs": 1, "active_jobs": 0, "completed_jobs": 1, "error_jobs": 0,
        "documents": 1, "pages": 2, "duration_seconds_average": 120.0,
        "pages_per_minute": 1.0, "failure_codes": {},
    }
    assert report["quality"] == {
        "documents": 1, "approved_documents": 1,
        "corrected_fields": 1, "confidence_average": 0.9, "total_fields": 3,
        "confidence_coverage": 0.667, "evidence_coverage": 0.333,
        "warning_documents": 0,
    }
    assert report["benchmark_samples"] == []
    assert client.get("/api/state").json()["metrics"] == {
        "total_jobs": 1, "active_jobs": 0, "completed_jobs": 1, "error_jobs": 0,
        "documents": 1, "pages": 2, "correction_count": 1,
    }


def test_state_supports_stable_sort_and_job_timestamps(tmp_path, monkeypatch):
    store = use_store(tmp_path, monkeypatch)
    older = store.create({"file_count": 1, "upload_name": "older.pdf"})
    newer = store.create({"file_count": 1, "upload_name": "newer.pdf"})
    store.update(older["id"], created_at="2026-07-20T10:00:00+00:00")
    store.update(newer["id"], created_at="2026-07-21T10:00:00+00:00",
                 started_at="2026-07-21T10:01:00+00:00", completed_at="2026-07-21T10:02:00+00:00")

    ascending = client.get("/api/state?sort=created_asc").json()["jobs"]
    assert [job["id"] for job in ascending] == [older["id"], newer["id"]]
    assert ascending[1]["started_at"] == "2026-07-21T10:01:00+00:00"


def test_artifact_manifest_lists_only_safe_existing_job_files(tmp_path, monkeypatch):
    store = use_store(tmp_path, monkeypatch)
    job = store.create({"file_count": 1})
    artifacts = store.path(job["id"]) / "artifacts"
    document = artifacts / "document-1"
    document.mkdir()
    (document / "page-1.png").write_bytes(b"png")
    (artifacts / "report.json").write_text("{}", encoding="utf-8")

    response = client.get(f"/api/jobs/{job['id']}/artifacts")
    assert response.status_code == 200
    payload = response.json()
    assert [item["name"] for item in payload["items"]] == ["page-1.png", "report.json"]
    assert payload["items"][0] == {
        "name": "page-1.png",
        "kind": "image",
        "status": "available",
        "size_bytes": 3,
        "updated_at": payload["items"][0]["updated_at"],
        "document_id": "document-1",
        "page_index": 0,
        "download_url": f"/api/jobs/{job['id']}/artifacts/document-1/page-1.png",
    }
    assert str(tmp_path) not in response.text
    assert client.get("/api/jobs/not-a-uuid/artifacts").status_code == 404


def test_documents_support_sort_filter_pagination_and_deep_links(tmp_path, monkeypatch):
    store = use_store(tmp_path, monkeypatch)
    job = store.create({"file_count": 1})
    store.update(job["id"], status="completed", documents=[
        {"id": "a", "file_name": "a.pdf", "status": "completed", "review_status": "approved"},
        {"id": "z", "file_name": "z.pdf", "status": "completed"},
    ])

    page = client.get("/api/documents?sort=name_desc&page_size=1").json()
    assert ([item["file_name"] for item in page["items"]], page["pagination"]["total"]) == (["z.pdf"], 2)
    pending = client.get("/api/documents?review_status=unreviewed").json()
    assert [item["id"] for item in pending["items"]] == ["z"]
