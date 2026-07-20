def test_worker_uses_environment_redis_urls(monkeypatch):
    import importlib
    import app.workers.tasks as tasks
    monkeypatch.setenv("CELERY_BROKER_URL", "redis://test-redis:6390/2")
    monkeypatch.setenv("CELERY_RESULT_BACKEND", "redis://test-redis:6390/3")
    try:
        tasks = importlib.reload(tasks)
        assert tasks.celery_app.conf.broker_url == "redis://test-redis:6390/2"
        assert tasks.celery_app.conf.result_backend == "redis://test-redis:6390/3"
    finally:
        monkeypatch.undo()
        importlib.reload(tasks)
