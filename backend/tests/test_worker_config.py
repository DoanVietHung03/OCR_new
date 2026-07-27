import asyncio
import importlib

import httpx
import fitz

from app.services.jobs import JobStore
from app.services.sizing import MeasurementStore


def test_worker_uses_environment_redis_urls(monkeypatch):
    import app.workers.tasks as tasks

    monkeypatch.setenv("CELERY_BROKER_URL", "redis://test-redis:6390/2")
    monkeypatch.setenv("CELERY_RESULT_BACKEND", "redis://test-redis:6390/3")
    try:
        tasks = importlib.reload(tasks)
        assert tasks.celery_app.conf.broker_url == "redis://test-redis:6390/2"
        assert tasks.celery_app.conf.result_backend == "redis://test-redis:6390/3"
        assert tasks.celery_app.tasks["ocr.process_job"].name == "ocr.process_job"
    finally:
        monkeypatch.undo()
        importlib.reload(tasks)


def test_worker_renders_calls_provider_and_persists_artifact(tmp_path, monkeypatch, pdf_bytes):
    import app.workers.tasks as tasks

    document = fitz.open()
    page = document.new_page(width=200, height=200)
    page.insert_text((20, 100), "SIGNER", fontsize=40)
    pdf_bytes = document.tobytes()
    document.close()
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen", "model": "snapshot-model"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    store.begin_start(job["id"])
    calls = []

    async def fake_request(_: bytes, **options):
        calls.append((options["model"], options["task"], options["page_index"], options.get("ocr_text", "")))
        if options["task"] == "full_ocr":
            return {"text": "Số văn bản: 1\nTrích yếu: Tóm tắt", "fields": {}, "warnings": []}
        return {"fields": {
            "so_van_ban": {
                "value": "1", "source_text": "Số văn bản: 1",
                "confidence": 0.9, "bbox": [0.05, 0.3, 0.8, 0.6], "page_index": 0,
            },
            "trich_yeu": {
                "value": "Tóm tắt", "source_text": "Trích yếu: Tóm tắt",
                "confidence": 0.8, "bbox": [0.05, 0.3, 0.8, 0.6], "page_index": 0,
            },
        }, "warnings": []}

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", fake_request)
    result = asyncio.run(tasks.process_job_async(job["id"]))

    assert result["status"] == "completed"
    assert result["page_count"] == 1
    assert result["started_at"]
    assert result["completed_at"]
    assert calls == [
        ("snapshot-model", "full_ocr", 0, ""),
        ("snapshot-model", "metadata", 0, "Số văn bản: 1\nTrích yếu: Tóm tắt"),
    ]
    assert result["documents"][0]["pages"][0] == {
        "page_index": 0, "image_url": f"/api/jobs/{job['id']}/artifacts/document/page-1.png",
        "ocr_scope": "full_ocr+metadata", "status": "completed", "error": "",
        "text": "Số văn bản: 1\nTrích yếu: Tóm tắt", "ocr_line_count": 2, "warnings": [],
        "source_pdf_id": "document", "source_page_index": 0,
    }
    assert result["documents"][0]["fields"]["so_van_ban"]["source_text"] == "Số văn bản: 1"
    page_pixmap = fitz.Pixmap(store.path(job["id"]) / "artifacts" / "document" / "page-1.png")
    for name in ("so_van_ban", "trich_yeu"):
        evidence_name = f"field-{name}-page-1.png"
        assert result["documents"][0]["fields"][name]["evidence_url"].endswith(f"/artifacts/document/{evidence_name}")
        evidence_pixmap = fitz.Pixmap(store.path(job["id"]) / "artifacts" / "document" / evidence_name)
        assert evidence_pixmap.width < page_pixmap.width
        assert evidence_pixmap.height < page_pixmap.height
    assert result["documents"][0]["approval_blockers"]
    assert (result["progress_stage"], result["completed_pages"], result["total_pages"]) == ("completed", 2, 2)
    assert [event["code"] for event in result["events"]].count("page_pass_completed") == 2
    assert "job_completed" in [event["code"] for event in result["events"]]
    assert [event["status"] for event in result["events"] if event["code"] == "job_status_changed"] == [
        "ready", "starting", "queued", "running", "completed",
    ]
    page_events = [event for event in result["events"] if event["code"] == "page_pass_completed"]
    assert all(event.get("duration_seconds", -1) >= 0 for event in page_events)
    assert result["report_url"] is None
    assert JobStore(tmp_path).read(job["id"])["completed_pages"] == 2
    assert (store.path(job["id"]) / "artifacts" / "document" / "page-1.png").is_file()


def test_worker_persists_typed_failure_without_provider_detail(tmp_path, monkeypatch, pdf_bytes):
    import app.workers.tasks as tasks

    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen", "model": "test"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes); store.begin_start(job["id"])

    async def fail(*_args, **_kwargs):
        raise RuntimeError("provider_timeout: secret")

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path)); monkeypatch.setattr(tasks, "request_page", fail)
    result = asyncio.run(tasks.process_job_async(job["id"]))
    assert (result["status"], result["progress_stage"]) == ("error", "failed")
    assert result["failure"] == {"code": "provider_timeout", "retryable": True, "operator_hint": "rerun_job", "page_index": 0}
    assert "secret" not in str(JobStore(tmp_path).read(job["id"]))


def test_cancel_and_restart_never_call_provider(tmp_path, monkeypatch, pdf_bytes):
    import app.workers.tasks as tasks

    store = JobStore(tmp_path)
    cancelled = store.create({"file_count": 1, "provider": "qwen", "model": "test"})
    store.add_pdf(cancelled["id"], "cancelled.pdf", pdf_bytes)
    store.begin_start(cancelled["id"])
    store.cancel(cancelled["id"])
    assert store.read(cancelled["id"])["status"] == "cancelling"
    interrupted = store.create({"file_count": 1, "provider": "qwen", "model": "test"})
    store.add_pdf(interrupted["id"], "interrupted.pdf", pdf_bytes)
    store.begin_start(interrupted["id"])
    waiting = store.create({"file_count": 1, "provider": "qwen", "model": "test", "processing_mode": "combined_dossier"})
    confirmed = store.create({"file_count": 1, "provider": "qwen", "model": "test", "processing_mode": "combined_dossier"})
    store.update(waiting["id"], status="awaiting_segmentation_review")
    store.update(confirmed["id"], status="segmentation_confirmed")

    async def should_not_run(*_args, **_kwargs):
        raise AssertionError("provider called")

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", should_not_run)
    assert asyncio.run(tasks.process_job_async(cancelled["id"]))["status"] == "cancelled"
    tasks.reconcile_interrupted()
    assert store.read(interrupted["id"])["status"] == "interrupted"
    assert JobStore(tmp_path).read(waiting["id"])["status"] == "awaiting_segmentation_review"
    assert JobStore(tmp_path).read(confirmed["id"])["status"] == "segmentation_confirmed"
    assert asyncio.run(tasks.process_job_async(interrupted["id"]))["status"] == "interrupted"


def test_provider_retries_transient_page_failures_once(tmp_path, monkeypatch):
    import app.services.ocr_runner as runner

    real_client = httpx.AsyncClient
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(429, headers={"Retry-After": "0"})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"fields": {}}'}}]})

    monkeypatch.setattr(
        runner.httpx,
        "AsyncClient",
        lambda **options: real_client(transport=httpx.MockTransport(handler), **options),
    )
    assert asyncio.run(runner.request_page(b"image", base_url="http://provider", api_key="x", model="m")) == {"fields": {}, "warnings": []}
    assert attempts == 2

    for failure in ("timeout", "invalid_json"):
        attempts = 0

        def transient(request: httpx.Request) -> httpx.Response:
            nonlocal attempts
            attempts += 1
            if attempts == 1 and failure == "timeout":
                raise httpx.ReadTimeout("secret response", request=request)
            if attempts == 1:
                return httpx.Response(200, json={"choices": [{"message": {"content": "not-json"}}]})
            return httpx.Response(200, json={"choices": [{"message": {"content": '{"fields": {}}'}}]})

        monkeypatch.setattr(
            runner.httpx,
            "AsyncClient",
            lambda **options: real_client(transport=httpx.MockTransport(transient), **options),
        )
        store = MeasurementStore(tmp_path / failure)
        assert asyncio.run(runner.request_page(
            b"image", base_url="http://provider", api_key="x", model="m",
            measurement_store=store, measurement_context={"job_id": "job", "task": "metadata"},
        )) == {"fields": {}, "warnings": []}
        assert attempts == 2
        operations = sorted(store.operations(job_id="job"), key=lambda item: item["attempt"])
        assert [(item["status"], item["retryable"]) for item in operations] == [
            (failure, True), ("success", False),
        ]

    attempts = 0

    def timeout(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ReadTimeout("secret response", request=request)

    monkeypatch.setattr(runner.httpx, "AsyncClient", lambda **options: real_client(transport=httpx.MockTransport(timeout), **options))
    try:
        asyncio.run(runner.request_page(b"image", base_url="http://provider", api_key="x", model="m"))
    except RuntimeError as exc:
        assert str(exc) == "provider_timeout"
    else:
        raise AssertionError("read timeout was accepted")
    assert attempts == 2

    import app.workers.tasks as tasks
    assert tasks.safe_error(RuntimeError("raw provider secret")) == "ocr_failed"


def test_metadata_uses_transcription_only_for_local_validation(monkeypatch):
    import app.services.ocr_runner as runner

    real_client = httpx.AsyncClient
    request_prompt = ""

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal request_prompt
        request_prompt = request.read().decode()
        return httpx.Response(200, json={"choices": [{"message": {"content": """{"fields":{"so_tai_lieu":{"value":23,"confidence":0.9,"bbox":[0.2,0.8,0.4,0.85]}}}"""}}]})

    monkeypatch.setattr(
        runner.httpx,
        "AsyncClient",
        lambda **options: real_client(transport=httpx.MockTransport(handler), **options),
    )
    result = asyncio.run(runner.request_page(
        b"image", base_url="http://provider", api_key="x", model="m",
        expected_fields=("so_tai_lieu",), ocr_text="Số tài liệu: ...33...",
    ))

    assert "Số tài liệu: ...33..." not in request_prompt
    assert result["fields"]["so_tai_lieu"]["bbox"] == []
    assert result["fields"]["so_tai_lieu"]["review_reason"] == "validation_warning"


def test_provider_probe_distinguishes_reachability_from_readiness(monkeypatch):
    import app.services.ocr_runner as runner

    fitz.TOOLS.reset_mupdf_warnings()
    with fitz.open(stream=runner.PROBE_PNG, filetype="png") as image:
        pixmap = image[0].get_pixmap()
    assert not fitz.TOOLS.mupdf_warnings()
    assert tuple(int.from_bytes(runner.PROBE_PNG[offset:offset + 4]) for offset in (16, 20)) == (256, 256)
    assert pixmap.n == 3

    real_client = httpx.AsyncClient

    def use(handler):
        monkeypatch.setattr(
            runner.httpx,
            "AsyncClient",
            lambda **options: real_client(transport=httpx.MockTransport(handler), **options),
        )
        return asyncio.run(runner.probe_provider(base_url="http://provider", api_key="secret", model="model"))

    assert use(lambda _: httpx.Response(401)) == "reachable"
    assert use(lambda _: httpx.Response(200, json={"choices": [{"message": {"content": '{"fields": {}}'}}]})) == "ready"

    def unavailable(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("secret endpoint", request=request)

    assert use(unavailable) == "unreachable"


def test_page_planner_and_metadata_scope(tmp_path, monkeypatch, pdf_bytes):
    import app.workers.tasks as tasks

    assert tasks.plan_pages(1, "auto") == [0]
    assert tasks.plan_pages(2, "first,last") == [0, 1]
    assert tasks.plan_pages(5, "auto") == [0, 3, 4]
    assert tasks.plan_pages(5, "auto", 2) == [0, 3]
    assert tasks.plan_pages(3, "all", 2) == [0, 1]

    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen", "model": "test", "vlm_task": "metadata", "vlm_pages": "first,last", "vlm_max_pages": 1})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    store.begin_start(job["id"])
    calls = []

    async def fake_request(_: bytes, **options):
        calls.append((options["task"], options["page_index"]))
        return {"fields": {}, "warnings": []}

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", fake_request)
    result = asyncio.run(tasks.process_job_async(job["id"]))
    assert calls == [("metadata", 0)]
    assert result["documents"][0]["pages"][0]["ocr_scope"] == "metadata"


def test_auto_metadata_searches_backward_until_one_signature_page_is_complete(tmp_path, monkeypatch):
    import app.workers.tasks as tasks

    pdf = fitz.open()
    for _ in range(5):
        pdf.new_page(width=100, height=100)
    content = pdf.tobytes()
    pdf.close()
    store = JobStore(tmp_path)
    job = store.create({
        "file_count": 1, "provider": "qwen", "model": "test",
        "vlm_task": "metadata", "vlm_pages": "auto",
    })
    store.add_pdf(job["id"], "document.pdf", content)
    store.begin_start(job["id"])
    calls = []

    def field(value, page_index):
        return {
            "value": value, "source_text": value, "confidence": 0.9,
            "bbox": [], "page_index": page_index, "needs_review": True,
        }

    async def fake_request(_: bytes, **options):
        page_index = options["page_index"]
        calls.append((page_index, options["expected_fields"]))
        if page_index == 0:
            return {"fields": {"so_van_ban": field("01", 0)}, "warnings": []}
        if page_index == 3:
            return {"fields": {"chuc_vu_nguoi_ky": field("BÍ THƯ SAI TRANG", 3)}, "warnings": []}
        if page_index == 2:
            return {"fields": {
                "quyen_han_ky_thay": field("TM. ĐẢNG ỦY", 2),
                "chuc_vu_nguoi_ky": field("BÍ THƯ", 2),
                "nguoi_ky": field("Nguyễn Văn A", 2),
            }, "warnings": []}
        return {"fields": {}, "warnings": []}

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", fake_request)
    result = asyncio.run(tasks.process_job_async(job["id"]))
    fields = result["documents"][0]["fields"]

    assert calls == [
        (0, tasks.ADMIN_FIELDS),
        (4, tasks.SIGNATURE_FIELDS),
        (3, tasks.SIGNATURE_FIELDS),
        (2, tasks.SIGNATURE_FIELDS),
    ]
    assert fields["so_van_ban"]["page_index"] == 0
    assert fields["chuc_vu_nguoi_ky"]["value"] == "BÍ THƯ"
    assert {fields[name]["page_index"] for name in tasks.SIGNATURE_FIELDS} == {2}
    assert fields["so_van_ban"]["evidence_reason"] == "bbox_missing"
    assert result["documents"][0]["pages"][1]["status"] == "skipped"
    assert (result["completed_pages"], result["total_pages"]) == (4, 4)


def test_crop_evidence_rejects_blank_regions(tmp_path):
    import app.workers.tasks as tasks

    blank = fitz.open()
    blank.new_page(width=200, height=200)
    blank_pdf = tmp_path / "blank.pdf"
    blank_pdf.write_bytes(blank.tobytes())
    blank.close()
    blank_image = tasks.render_pdf(blank_pdf, tmp_path / "blank")[0]
    assert not tasks.crop_field_evidence(blank_image, [0.1, 0.1, 0.9, 0.9], tmp_path / "blank-crop.png")
    assert not (tmp_path / "blank-crop.png").exists()

    ink = fitz.open()
    page = ink.new_page(width=200, height=200)
    page.insert_text((20, 100), "SIGNER", fontsize=40)
    ink_pdf = tmp_path / "ink.pdf"
    ink_pdf.write_bytes(ink.tobytes())
    ink.close()
    ink_image = tasks.render_pdf(ink_pdf, tmp_path / "ink")[0]
    assert tasks.crop_field_evidence(ink_image, [0.05, 0.25, 0.95, 0.65], tmp_path / "ink-crop.png")


def test_worker_records_blank_crop_without_overwriting_validation_reason(tmp_path, monkeypatch):
    import app.workers.tasks as tasks

    pdf = fitz.open()
    page = pdf.new_page(width=200, height=200)
    page.insert_text((20, 30), "INK", fontsize=20)
    content = pdf.tobytes()
    pdf.close()
    store = JobStore(tmp_path)
    job = store.create({
        "file_count": 1, "provider": "qwen", "model": "test",
        "vlm_task": "metadata", "vlm_pages": "all",
    })
    store.add_pdf(job["id"], "document.pdf", content)
    store.begin_start(job["id"])

    async def fake_request(_: bytes, **options):
        return {"fields": {
            "so_van_ban": {
                "value": "1", "source_text": "Số: 1", "confidence": 0.9,
                "bbox": [0.1, 0.7, 0.4, 0.9], "page_index": options["page_index"],
                "needs_review": False,
            },
            "nguoi_ky": {
                "value": "A", "source_text": "B", "confidence": None,
                "raw_confidence": 0.9, "bbox": [], "page_index": options["page_index"],
                "needs_review": True, "review_reason": "validation_warning",
            },
        }, "warnings": ["invalid_field_value"]}

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", fake_request)
    fields = asyncio.run(tasks.process_job_async(job["id"]))["documents"][0]["fields"]

    assert fields["so_van_ban"]["evidence_reason"] == "crop_blank"
    assert fields["so_van_ban"]["review_reason"] == "missing_evidence"
    assert fields["nguoi_ky"]["review_reason"] == "validation_warning"
    assert fields["nguoi_ky"].get("evidence_reason", "") == ""


def test_worker_persists_all_safe_warning_codes(tmp_path, monkeypatch, pdf_bytes):
    import app.workers.tasks as tasks

    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen", "model": "test", "vlm_task": "metadata"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes); store.begin_start(job["id"])

    async def fake_request(_: bytes, **_options):
        return {"fields": {}, "warnings": ["unknown_field", "invalid_field_value"]}

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path)); monkeypatch.setattr(tasks, "request_page", fake_request)
    result = asyncio.run(tasks.process_job_async(job["id"]))
    page = result["documents"][0]["pages"][0]
    assert page["warnings"] == ["unknown_field", "invalid_field_value"]
    assert page["status"] == "completed_with_warnings"
    assert result["failed_pages"] == 0
    event = next(item for item in result["events"] if item["code"] == "page_pass_failed")
    assert event["warning_codes"] == page["warnings"]
    assert next(item for item in result["events"] if item["code"] == "job_completed")["severity"] == "warning"


def test_combined_dossier_segments_every_page_and_waits_for_confirmation(tmp_path, monkeypatch):
    import app.workers.tasks as tasks

    pdf = fitz.open()
    for _ in range(3):
        pdf.new_page(width=100, height=100)
    content = pdf.tobytes(); pdf.close()
    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen", "model": "test", "processing_mode": "combined_dossier"})
    store.add_pdf(job["id"], "dossier.pdf", content); store.begin_start(job["id"])
    classifications = iter(["cover", "document_start", "continuation"])
    calls = []

    async def fake_request(_: bytes, **options):
        calls.append((options["task"], options["page_index"]))
        return {"classification": next(classifications)}

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path)); monkeypatch.setattr(tasks, "request_page", fake_request)
    result = asyncio.run(tasks.process_job_async(job["id"]))
    assert result["status"] == "awaiting_segmentation_review"
    assert calls == [("segmentation", 0), ("segmentation", 1), ("segmentation", 2)]
    assert [item["logical_document_type"] for item in result["source_pdfs"][0]["proposal"]] == ["dossier_cover", "administrative_document"]
    assert result["segmentation_completed_pages"] == result["segmentation_total_pages"] == 3
    assert JobStore(tmp_path).read(job["id"])["status"] == "awaiting_segmentation_review"


def test_multi_pdf_dossier_uses_file_boundaries_without_provider_segmentation(tmp_path, monkeypatch, pdf_bytes):
    import app.workers.tasks as tasks

    store = JobStore(tmp_path)
    job = store.create({"file_count": 2, "provider": "qwen", "model": "test", "processing_mode": "combined_dossier"})
    store.add_pdf(job["id"], "Scan_0001.pdf", pdf_bytes)
    store.add_pdf(job["id"], "Scan_0000.pdf", pdf_bytes)
    store.begin_start(job["id"])

    async def unexpected_request(*_args, **_options):
        raise AssertionError("provider segmentation must not run for multiple PDFs")

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", unexpected_request)
    result = asyncio.run(tasks.process_job_async(job["id"]))
    proposals = {
        source["file_name"]: source["proposal"][0]["logical_document_type"]
        for source in result["source_pdfs"]
    }
    assert proposals == {
        "Scan_0000.pdf": "dossier_cover",
        "Scan_0001.pdf": "administrative_document",
    }
