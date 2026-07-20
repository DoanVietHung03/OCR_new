from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_job_contract_and_safe_upload(tmp_path, monkeypatch):
    import app.api.routes as routes
    monkeypatch.setattr(routes, "store", routes.JobStore(tmp_path))
    response = client.post("/api/jobs", json={"file_count": 1, "ocr_method": "qwen"})
    assert response.status_code == 200
    job = response.json()
    uploaded = client.put(f"/api/jobs/{job['id']}/files?path=docs/a.pdf", content=b"%PDF-1.4 fake")
    assert uploaded.status_code == 200
    assert uploaded.json()["job"]["status"] == "ready"
    assert client.put(f"/api/jobs/{job['id']}/files?path=../escape.pdf", content=b"%PDF-1.4 fake").status_code == 400

def test_error_envelope_and_openapi():
    assert client.get("/api/jobs/not-a-uuid").json()["detail"] == {"code": "not_found", "message": "not_found"}
    assert "/api/jobs" in client.get("/openapi.json").json()["paths"]
    assert client.get("/api/system-metrics").json() == {"cpu_percent": None, "memory_percent": None, "gpu": None}
