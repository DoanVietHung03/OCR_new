"""Real FastAPI + eager Celery + local fake provider for Playwright only."""

import json
import os
import shutil
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread


class Provider(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        content = json.dumps({"fields": {
            "co_quan_ban_hanh": "Cơ quan thử nghiệm",
            "so_van_ban": {"value": "DOC-001", "confidence": 0.99, "page_index": 0},
            "ngay_ban_hanh": "2026-07-22",
            "trich_yeu": "Tài liệu kiểm thử",
        }})
        body = json.dumps({"choices": [{"message": {"content": content}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    data_dir = tempfile.mkdtemp(prefix="ocr-playwright-")
    os.environ.update({
        "OCR_DATA_DIR": data_dir,
        "OCR_BASE_URL": "http://127.0.0.1:50180/v1",
        "OCR_API_KEY": "test-only",
        "OCR_MODEL": "fake-model",
        "OCR_ENDPOINT_EXTERNAL": "false",
        "CELERY_TASK_ALWAYS_EAGER": "true",
    })
    provider = ThreadingHTTPServer(("127.0.0.1", 50180), Provider)
    Thread(target=provider.serve_forever, daemon=True).start()
    try:
        import uvicorn

        uvicorn.run("app.main:app", host="127.0.0.1", port=50179, log_level="warning")
    finally:
        provider.shutdown()
        shutil.rmtree(data_dir, ignore_errors=True)
