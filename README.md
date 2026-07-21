# Dịch vụ OCR

Hệ thống OCR tài liệu hành chính tiếng Việt, chỉ nhận PDF. Stack chuyển đổi sử
dụng Next.js, FastAPI, Celery, Redis và một endpoint OCR tương thích OpenAI do
máy chủ cấu hình.

Milestone A và B đã được xác minh cục bộ. Milestone C vẫn phải được nghiệm thu
trên máy chủ mạnh với Nginx/Redis/Celery/provider thật, ba PDF cố định, kiểm tra
khởi động lại, tương thích hai phiên bản và diễn tập rollback. Cho đến khi gate
này đạt, `src/ocr/` và `web/` vẫn là runtime rollback.

## Cấu trúc repository

- `frontend/`: giao diện Next.js App Router và các kiểu API được sinh tự động.
- `backend/`: FastAPI, kho job bền vững, Celery task và các bài kiểm tra.
- `nginx/`: định tuyến production trên cùng một domain.
- `data/jobs/`: JSON, PDF và artifact bền vững của job; không lưu trong Redis.
- `src/ocr/`, `web/`, `tests/`: runtime rollback legacy và các bài kiểm tra.
- `docs/phase4_cutover_runbook.md`: quy trình thực hiện trên máy chủ mạnh.
- `docs/phase4_acceptance.md`: bằng chứng bắt buộc cho Milestone C.

## Các ràng buộc đã khóa

- Chỉ nhận PDF: tối đa 15 PDF và 200 MiB cho mỗi job; tối đa 100 trang mỗi PDF.
- PDF được kiểm tra trước khi dispatch. PDF không hợp lệ, có mật khẩu hoặc vượt
  giới hạn sẽ làm toàn bộ job thất bại mà không gọi provider.
- FastAPI chỉ xử lý request ngắn. Celery render trang ở 200 DPI và gọi provider.
- `/start` chỉ dispatch một lần. Worker production dùng concurrency `1` và
  prefetch `1`; job không tự động retry hoặc resume.
- Provider, model, phiên bản prompt và trạng thái endpoint bên ngoài được chụp
  lại theo từng job. URL, khóa, header, phản hồi thô của provider và lỗi không
  an toàn không bao giờ được lưu.
- Nội dung chỉnh sửa, phê duyệt, audit bất biến và bằng chứng crop thủ công được
  lưu bền vững. Rerun tạo một job sạch từ các PDF gốc.
- `data/jobs/` là nguồn dữ liệu bền vững duy nhất. Redis không có volume lưu trữ.
- Trình duyệt chỉ gọi đường dẫn tương đối `/api/*`; cấu hình provider và secret
  không bao giờ được gửi xuống frontend.

## Yêu cầu môi trường

- Python 3.12 và `uv`.
- Node.js 22 và pnpm 10.
- Docker Compose chỉ cần cho môi trường gần production và Milestone C.

## Thiết lập cục bộ

Chạy từ thư mục gốc của repository:

```powershell
Copy-Item .env.example .env
uv sync --project backend
pnpm install
```

Điền các giá trị provider thật, chỉ dùng phía máy chủ, vào `.env`. Redis host
`redis` trong file mẫu dành cho Compose; khi chạy Celery trực tiếp phải dùng
một Redis host có thể kết nối được.

Khởi động API và frontend trong hai terminal riêng:

```powershell
uv run --env-file .env --project backend uvicorn app.main:app --host 0.0.0.0 --port 50177 --reload
pnpm --dir frontend dev -- --hostname 0.0.0.0 --port 54846
```

Mặc định frontend proxy các request tương đối `/api/*` đến
`http://127.0.0.1:50177`. Chỉ đặt `OCR_BACKEND_URL` khi backend trực tiếp dùng
URL khác. Môi trường phát triển Next hiện cho phép `127.0.0.1` và `10.6.18.76`;
hãy cập nhật `allowedDevOrigins` trong `frontend/next.config.ts` nếu dùng một
máy chủ LAN khác.

Để chạy worker trực tiếp, trỏ cả hai URL Celery đến cùng một Redis có thể kết
nối được, sau đó chạy:

```powershell
uv run --env-file .env --project backend celery -A app.workers.tasks:celery_app worker --loglevel=INFO --concurrency=1 --prefetch-multiplier=1
```

## Kiểm tra

Các kiểm tra cục bộ không cần Redis, worker đang chạy, Docker, GPU hoặc provider
thật:

```powershell
uv run --project backend pytest backend/tests -q
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
git diff --check
```

Playwright kiểm tra workflow dùng mock, một luồng Next/FastAPI/eager-task thật
với fake provider cục bộ, cùng hai viewport đã khóa là desktop `1440×900` và
mobile `390×844`. Các kiểm tra này không chứng minh hành vi của
Redis/Celery/provider trong production.

Khi schema FastAPI thay đổi, chạy `pnpm api:generate` và commit cả
`frontend/openapi.json` lẫn `frontend/lib/api-schema.ts`.

## Chạy bằng Docker Compose

Chỉ Nginx publish cổng host `52409`. Backend, frontend, Redis và worker chỉ hoạt
động trong mạng nội bộ của Compose.

```bash
cp .env.example .env
# chỉnh các giá trị chỉ dùng phía máy chủ trước khi chạy
docker compose config
docker compose up -d --build redis backend worker frontend nginx
docker compose ps
curl -fsS http://127.0.0.1:52409/health
```

Không dùng Compose với `OCR_DATA_DIR` thật cho đến khi đã dừng nhận upload,
drain và dừng worker legacy, đồng thời tạo bản sao lưu có checksum. Không bao
giờ chạy worker legacy và worker mới trên cùng một thư mục job.

## Runtime rollback legacy

```powershell
python -m pip install -e .
$env:PYTHONPATH = "src"
python -m ocr
```

Giữ runtime này sẵn sàng cho đến khi Milestone C đạt và cửa sổ rollback một
ngày kết thúc.

## Cổng và dữ liệu

- Runtime legacy: `62472`.
- FastAPI chạy trực tiếp: `50177`.
- Next.js chạy trực tiếp: `54846`.
- Điểm truy cập Compose: `52409`.
- Redis nội bộ trong Compose: `6380`.

`OCR_ENDPOINT_EXTERNAL` mặc định là `true`; mỗi job phải ghi nhận sự đồng ý
trước khi gửi ảnh trang đến endpoint bên ngoài. `BACKEND_PORT` cố ý không được
hỗ trợ — backend luôn lắng nghe tại `50177`.

Xem [implementation_plan.md](implementation_plan.md) để biết gate còn lại và
[docs/phase4_cutover_runbook.md](docs/phase4_cutover_runbook.md) để thực hiện
cutover và rollback.
