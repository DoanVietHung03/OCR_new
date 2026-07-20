# OCR service

Dịch vụ OCR nội bộ cho PDF tiếng Việt. FastAPI phục vụ giao diện web, Celery
thực hiện OCR nền, Redis làm broker, còn dữ liệu bền vững nằm trong
`data/jobs/`.

## Yêu cầu server

- Linux khuyến nghị (Ubuntu 22.04+)
- Python 3.12+
- Redis đang chạy và cho phép server kết nối
- Một endpoint OCR tương thích OpenAI Chat Completions có vision
- Tài khoản có quyền đọc repo và ghi vào thư mục dự án

PyMuPDF chỉ dùng để mở/render/crop PDF. OCR thật được gửi tới endpoint trong
`OCR_BASE_URL`.

## Triển khai sau khi `git pull`

```bash
git clone <REPO_URL> OCR
cd OCR

python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e . --no-deps

mkdir -p data/jobs
```

Lần cập nhật sau:

```bash
cd /path/to/OCR
git pull --ff-only
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m pip install -e . --no-deps
```

## Cấu hình

Tạo `.env` trên server; không commit file này:

```dotenv
OCR_PROVIDER=qwen
OCR_BASE_URL=https://your-ocr-endpoint.example/v1
OCR_API_KEY=replace-me
OCR_MODEL=your-vision-model
OCR_TIMEOUT_SECONDS=120

CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/1
OCR_DATA_DIR=/path/to/OCR/data/jobs
```

Giá trị `OCR_PROVIDER` hiện hỗ trợ `qwen`, `openai`, và `azure_openai`.
Endpoint phải nhận `POST {OCR_BASE_URL}/chat/completions` và hỗ trợ ảnh
base64 trong message. Với `openai` hoặc `azure_openai`, người dùng phải xác
nhận việc gửi dữ liệu ra ngoài trước khi chạy job.

Nạp biến môi trường trước khi chạy cả API và worker:

```bash
set -a
source .env
set +a
```

## Chạy production thủ công

Mở ba terminal, tất cả đều chạy từ thư mục repo và đã `source .venv/bin/activate`.

Terminal 1 — API:

```bash
set -a; source .env; set +a
python -m ocr
```

API lắng nghe tại `http://0.0.0.0:8000`.

Terminal 2 — Celery worker:

```bash
set -a; source .env; set +a
celery -A ocr.tasks:celery_app worker --loglevel=INFO
```

Terminal 3 — kiểm tra Redis:

```bash
redis-cli ping
```

Kết quả đúng là `PONG`. Mở firewall/reverse proxy tới cổng 8000 nếu cần;
không mở Redis ra Internet.

## Chạy bằng systemd

Tạo `/etc/ocr/ocr.env` với nội dung giống `.env`, sau đó tạo hai service.

`/etc/systemd/system/ocr-api.service`:

```ini
[Unit]
After=network.target redis-server.service

[Service]
WorkingDirectory=/path/to/OCR
EnvironmentFile=/etc/ocr/ocr.env
ExecStart=/path/to/OCR/.venv/bin/python -m ocr
Restart=always
User=ocr

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/ocr-worker.service`:

```ini
[Unit]
After=network.target redis-server.service

[Service]
WorkingDirectory=/path/to/OCR
EnvironmentFile=/etc/ocr/ocr.env
ExecStart=/path/to/OCR/.venv/bin/celery -A ocr.tasks:celery_app worker --loglevel=INFO
Restart=always
User=ocr

[Install]
WantedBy=multi-user.target
```

Khởi động:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ocr-api ocr-worker
sudo systemctl status ocr-api ocr-worker
sudo journalctl -u ocr-api -f
sudo journalctl -u ocr-worker -f
```

## Kiểm tra trước khi nhận job

```bash
source .venv/bin/activate
PYTHONPATH=src python -m unittest discover -s tests
PYTHONPATH=src python -m compileall -q src
curl -i http://127.0.0.1:8000/
curl -s http://127.0.0.1:8000/api/engines
```

`/api/engines` trả `not_configured` nếu thiếu `OCR_BASE_URL` hoặc
`OCR_MODEL`; đó là trạng thái an toàn, không phải lỗi Redis.

## Dữ liệu và vận hành

- `data/jobs/` chứa PDF upload, PNG trang, artifact, JSON job và audit correction.
- Thư mục này không nằm trong git; cần backup riêng nếu dữ liệu quan trọng.
- Không ghi API key vào source, log, job JSON hoặc artifact.
- Redis có thể restart; trạng thái job vẫn nằm trên filesystem.
- Không xóa `data/jobs/` khi cập nhật code.

## Giới hạn MVP

- Chỉ nhận PDF.
- Tối đa 15 PDF/job, 200 MB/job, 100 trang/PDF.
- Không có authentication; chỉ triển khai trong mạng nội bộ hoặc sau reverse proxy có kiểm soát.
- Không cần GPU cho API/worker nếu endpoint VLM chạy trên server khác.
