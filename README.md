# Dịch vụ OCR

Hệ thống OCR tài liệu hành chính tiếng Việt, chỉ nhận PDF. Stack chuyển đổi sử
dụng Next.js, FastAPI, Celery, Redis và một endpoint OCR tương thích OpenAI do
máy chủ cấu hình.

Milestone A, B và 14 checkpoint browser baseline v1 đã hoàn thiện, xác minh cục
bộ ngày 2026-07-21. Baseline này không còn là đích UI cuối. Kế hoạch **Legacy+
v2** nhằm phục hồi toàn bộ browser tham chiếu trong `OCR_paper`, chỉ loại trừ
ZIP/ảnh/folder upload, hiện chưa triển khai và đang ở 0/19 checkpoint. Milestone
C vẫn phải được nghiệm thu trên máy chủ mạnh sau khi Legacy+ đóng gate local.
Cho đến khi Gate C đạt, `src/ocr/` và `web/` vẫn là runtime rollback.

Giao diện Next.js hiện là baseline desktop-first:
upload PDF inline, dashboard có filter/lifecycle action, workspace kiểm tra từng
document/page/field, Lưu và duyệt, visual crop theo tọa độ ảnh tự nhiên, report,
legacy logs có điều kiện và System Monitor. Ảnh/checklist đã ẩn danh nằm trong
`docs/ui-parity/`; đây là bằng chứng local, không thay thế Milestone C.

Checkpoint baseline v1 trong `legacy_browser_recreated.md` đạt 14/14; 20 backend
tests, 10 legacy compatibility tests và 10 browser tests mặc định đã pass;
capture mode pass 11/11. Bảng Legacy+ v2 riêng đang là 0/19. Đây là contract/UI
evidence local, không phải bằng chứng chất lượng OCR hoặc production readiness.

## Cấu trúc repository

- `frontend/`: giao diện Next.js App Router và các kiểu API được sinh tự động.
- `backend/`: FastAPI, kho job bền vững, Celery task và các bài kiểm tra.
- `nginx/`: định tuyến production trên cùng một domain.
- `data/jobs/`: JSON, PDF và artifact bền vững của job; không lưu trong Redis.
- `src/ocr/`, `web/`, `tests/`: runtime rollback legacy và các bài kiểm tra.
- `legacy_browser_recreated.md`: đặc tả Legacy+ v2, checkpoint đang làm và lịch
  sử 14 checkpoint baseline v1.
- `CONTEXT.md`: glossary ngắn cho Legacy+, Provider Profile, Codes và evidence.
- `docs/ui-parity/`: bốn ảnh ẩn danh và mô tả browser evidence local.
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
- `/api/system-metrics` chỉ trả CPU/RAM, dung lượng filesystem chứa
  `OCR_DATA_DIR` và GPU mà backend nhìn thấy theo best-effort. Endpoint không trả
  hostname, path, process, raw command output, secret hoặc provider config;
  Compose mặc định không yêu cầu GPU.

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
python -m compileall -q src backend/app
git diff --check
```

Playwright kiểm tra workflow dùng mock, một luồng Next/FastAPI/eager-task thật
với fake provider cục bộ, desktop `1440×900`, laptop `1366×768` và safety smoke
mobile `390×844`. Các kiểm tra này không chứng minh hành vi của
Redis/Celery/provider trong production.

Khi schema FastAPI thay đổi, chạy `pnpm api:generate` và commit cả
`frontend/openapi.json` lẫn `frontend/lib/api-schema.ts`.

## Chạy bằng Docker Compose

Nginx publish cổng host `52409`; frontend đồng thời publish `54846` để địa chỉ
Next.js ghi trong container log có thể truy cập trực tiếp. Cả hai đường đều dùng
được đầy đủ `/api/*`; backend, Redis và worker vẫn chỉ hoạt động trong mạng nội
bộ của Compose. Dùng `52409` cho luồng production/cutover và `54846` khi cần
truy cập trực tiếp frontend.

```bash
cp .env.example .env
# chỉnh các giá trị chỉ dùng phía máy chủ trước khi chạy
docker compose config
docker compose up -d --build redis backend worker frontend nginx
docker compose ps
curl -fsS http://127.0.0.1:52409/health
curl -fsSI http://127.0.0.1:54846/
curl -fsS http://127.0.0.1:54846/api/state > /dev/null
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
- Next.js chạy trực tiếp hoặc frontend Compose: `54846`.
- Điểm truy cập Compose: `52409`.
- Redis nội bộ trong Compose: `6380`.

`OCR_ENDPOINT_EXTERNAL` mặc định là `true`; mỗi job phải ghi nhận sự đồng ý
trước khi gửi ảnh trang đến endpoint bên ngoài. `BACKEND_PORT` cố ý không được
hỗ trợ — backend luôn lắng nghe tại `50177`.

Xem [legacy_browser_recreated.md](legacy_browser_recreated.md) để theo dõi 19
checkpoint Legacy+ v2 và baseline v1, [implementation_plan.md](implementation_plan.md)
để biết công việc còn lại và
[docs/phase4_cutover_runbook.md](docs/phase4_cutover_runbook.md) để thực hiện
cutover và rollback.
