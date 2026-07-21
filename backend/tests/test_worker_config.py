import asyncio
import importlib

import httpx

from app.services.jobs import JobStore


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

    store = JobStore(tmp_path)
    job = store.create({"file_count": 1, "provider": "qwen", "model": "snapshot-model"})
    store.add_pdf(job["id"], "document.pdf", pdf_bytes)
    store.begin_start(job["id"])
    models = []

    async def fake_request(_: bytes, **options):
        models.append(options["model"])
        return {"fields": {"so_van_ban": {
            "value": "1", "confidence": 0.9, "bbox": [0, 0, 1, 1], "page_index": 0,
        }}}

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", fake_request)
    result = asyncio.run(tasks.process_job_async(job["id"]))

    assert result["status"] == "completed"
    assert result["page_count"] == 1
    assert models == ["snapshot-model"]
    assert (store.path(job["id"]) / "artifacts" / "document" / "page-1.png").is_file()


def test_cancel_and_restart_never_call_provider(tmp_path, monkeypatch, pdf_bytes):
    import app.workers.tasks as tasks

    store = JobStore(tmp_path)
    cancelled = store.create({"file_count": 1, "provider": "qwen", "model": "test"})
    store.add_pdf(cancelled["id"], "cancelled.pdf", pdf_bytes)
    store.begin_start(cancelled["id"])
    store.cancel(cancelled["id"])
    interrupted = store.create({"file_count": 1, "provider": "qwen", "model": "test"})
    store.add_pdf(interrupted["id"], "interrupted.pdf", pdf_bytes)
    store.begin_start(interrupted["id"])

    async def should_not_run(*_args, **_kwargs):
        raise AssertionError("provider called")

    monkeypatch.setenv("OCR_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(tasks, "request_page", should_not_run)
    assert asyncio.run(tasks.process_job_async(cancelled["id"]))["status"] == "cancelled"
    tasks.reconcile_interrupted()
    assert store.read(interrupted["id"])["status"] == "interrupted"
    assert asyncio.run(tasks.process_job_async(interrupted["id"]))["status"] == "interrupted"


def test_provider_retries_429_once_but_not_read_timeout(monkeypatch):
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
    assert asyncio.run(runner.request_page(b"image", base_url="http://provider", api_key="x", model="m")) == {"fields": {}}
    assert attempts == 2

    def timeout(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("secret response", request=httpx.Request("POST", "http://provider"))

    monkeypatch.setattr(
        runner.httpx,
        "AsyncClient",
        lambda **options: real_client(transport=httpx.MockTransport(timeout), **options),
    )
    try:
        asyncio.run(runner.request_page(b"image", base_url="http://provider", api_key="x", model="m"))
    except RuntimeError as exc:
        assert str(exc) == "provider_timeout"
    else:
        raise AssertionError("read timeout was accepted")

    import app.workers.tasks as tasks
    assert tasks.safe_error(RuntimeError("raw provider secret")) == "ocr_failed"
