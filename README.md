# Dịch vụ OCR

Hệ thống OCR tài liệu hành chính tiếng Việt, chỉ nhận PDF. Stack chuyển đổi sử
dụng Next.js, FastAPI, Celery, Redis và một endpoint OCR tương thích OpenAI do
máy chủ cấu hình.

Milestone A, B và frontend Next.js đã có closure local ngày 2026-07-21.
Repair Gate đã pass local ngày 2026-07-22; contract local
của `X7`–`X13`, `X16`, phần local của `X15` và `X17A`–`X17E` đã pass.
`X7`/`X16` vẫn IN PROGRESS ở gate tổng thể vì còn thiếu fixture/provider live;
`X14` còn benchmark thật và `X17F` còn one-PDF/provider/fixture/server evidence.
Điều kiện hoàn thành các phần phụ thuộc bên ngoài nằm trong
[`incomlpeted.md`](incomlpeted.md).
Milestone C chỉ là internal production-like pilot,
không phải customer-production approval.

Giao diện Next.js có route Jobs, Upload, Manage/Documents, Logs, Reports,
Codes, Sizing & Cost, [Hướng dẫn sử dụng](http://localhost:54846/guide),
[Tra cứu tham số](http://localhost:54846/guide/reference) và job workspace.
Dữ liệu giàu gồm Provider Profile, OCR text/quality/
evidence/suggestion, artifact manifest, Safe Events, report/benchmark nullable,
Code Catalog `_codes.json` và System Monitor allowlist. Mọi số liệu đều lấy từ
API/dữ liệu bền vững hoặc hiển thị unavailable trung thực.
Trang Upload cho chọn nhiều PDF trực tiếp hoặc chọn một thư mục chứa nhiều PDF
bằng native browser picker; cả hai dùng cùng giới hạn và flow upload tuần tự.
Closure audit còn kiểm chứng sort, job timing, document warnings, scoped Logs,
report throughput/coverage và CPU load đều đi qua generated typed contract.

Repair Gate ngày 2026-07-22 đạt 28 backend tests, 10 legacy compatibility tests,
focused browser coverage cho task/page retry và partial-result UI, typecheck,
build, OpenAPI/types và diff checks. Đây là baseline cần bảo vệ. Contract local
hiện có field policy dùng chung, strict write DTO, missing-field
atomic approval, typed blocker/risk/error/Safe Events, field evidence, Processing
Mode, review segmentation theo revision, Continue, rerun reuse/resegment,
readiness probe, durable progress/failure/timeline và triage. Create/rerun từ chối
Provider Profile chưa cấu hình hoặc không hỗ trợ mode/task/page scope đã chọn.
Sizing & Cost đo từng provider attempt, aggregate tài nguyên/token/cost bền vững,
giữ catalog/snapshot dưới `OCR_DATA_DIR/_sizing*`, và chỉ mở calculator/capacity
theo sample/coverage gate; thiếu dữ liệu luôn hiển thị unavailable.
Bộ backend đạt 54 tests ở baseline; browser `20 passed` và eager
Celery/fake-provider pass. Đây chưa phải bằng chứng bốn fixture, restart hoặc
provider production-like thật.

## Cấu trúc repository

- `frontend/`: giao diện Next.js App Router và các kiểu API được sinh tự động.
- `backend/`: FastAPI, kho job bền vững, Celery task và các bài kiểm tra.
- `nginx/`: định tuyến deployment trên cùng một domain.
- `data/jobs/`: JSON, PDF và artifact bền vững của job; không lưu trong Redis.
- `implementation_plan.md`: nguồn chuẩn backend, Repair Gate, cutover và ledger
  bằng chứng Milestone C.
- `frontend_plan.md`: nguồn chuẩn frontend, workflow, regression gate
  và mapping ảnh parity.
- `User_guide.md`: đặc tả nội dung/acceptance cho guide; nội dung sử dụng trực
  tiếp nằm tại `/guide` và `/guide/reference`, không phụ thuộc backend.
- `incomlpeted.md`: các việc còn phụ thuộc fixture, provider, strong server hoặc
  xác nhận operator, kèm điều kiện nghiệm thu.
- `docs/ui-parity/`: ảnh ẩn danh tại 1440×900, 1366×768 và 390×844.

## Các ràng buộc đã khóa

- Chỉ nhận PDF: tối đa 15 PDF và 200 MiB cho mỗi job; tối đa 100 trang mỗi PDF.
- Có thể chọn các PDF riêng lẻ hoặc chọn một thư mục PDF; không hỗ trợ ZIP, ảnh
  hay quản lý directory tree.
- PDF được kiểm tra trước khi dispatch. PDF không hợp lệ, có mật khẩu hoặc vượt
  giới hạn sẽ làm toàn bộ job thất bại mà không gọi provider.
- FastAPI chỉ xử lý request ngắn. Celery render trang ở 200 DPI và gọi provider.
- Job mới chọn một `processing_mode`: `administrative_document`,
  `dossier_cover` hoặc `combined_dossier`. Mode chọn schema/prompt; Provider
  Profile chọn engine/model và capability, hai khái niệm không suy lẫn nhau.
- Với `combined_dossier` nhiều PDF, worker sắp theo tên file: PDF đầu là một Bìa
  trọn vẹn, mỗi PDF sau là một văn bản trọn vẹn và không gọi provider để phân
  đoạn. Nếu chỉ có một PDF gộp, worker vẫn phân đoạn từng trang bằng provider.
  Reviewer có thể xác nhận từng PDF hoặc xác nhận tất cả PDF hợp lệ; hệ thống
  vẫn gửi tuần tự từng revision rồi mới dispatch extraction. Folder nhiều PDF
  chỉ cho chọn Bìa/Văn bản; `excluded` chỉ dành cho trang trắng/phân cách trong
  một PDF gộp, còn `unclassified` là trạng thái lỗi cần sửa chứ không phải lựa chọn.
- `/start` chỉ dispatch một lần. Worker production dùng concurrency `1` và
  prefetch `1`; job không tự động retry hoặc resume.
- Provider, model, phiên bản prompt và trạng thái endpoint bên ngoài được chụp
  lại theo từng job. URL, khóa, header, phản hồi thô của provider và lỗi không
  an toàn không bao giờ được lưu.
- Backend công bố ordered expected/required fields, typed blockers/risks và
  `logical_document_type`. Văn bản mới dùng schema 11 field, Bìa dùng schema 13
  field với `khoa` và không có `hop_so`; dữ liệu legacy vẫn đọc được nhưng không
  bị áp policy mới hoặc rewrite.
- Với văn bản hành chính, `Metadata nhanh + Tự động` lấy metadata đầu văn bản ở
  trang đầu rồi tìm riêng nhóm quyền hạn/chức vụ/người ký từ cuối về đầu, dừng
  khi gặp trang có đủ chức vụ + người ký. `Số trang tối đa` giới hạn tổng số
  trang candidate; `Tất cả trang` và `Trang đầu và cuối` giữ nguyên nghĩa.
- Prompt chữ ký đọc cả chữ in bị con dấu đỏ hoặc nét ký che một phần. Crop tự
  động chỉ được công bố cho field thắng cuối cùng và vùng có nội dung; bbox trắng
  hoặc `value/source_text` mâu thuẫn được đánh dấu cần rà soát thay vì hiển thị
  bằng chứng sai. Lý do thiếu evidence được phân biệt thành bbox thiếu, bbox
  không hợp lệ hoặc crop gần như trắng; cảnh báo đối chiếu giá trị được giữ
  riêng. Crop không trắng chỉ chứng minh artifact tồn tại, reviewer vẫn phải
  kiểm tra đúng ngữ nghĩa hoặc vẽ Manual crop; pipeline không gọi thêm OCR hay
  provider chỉ để kiểm tra crop.
- Nội dung chỉnh sửa, phê duyệt, audit bất biến và bằng chứng crop thủ công được
  lưu bền vững. Approval độc lập từng logical document. Rerun tạo job sạch và
  explicit reuse hoặc chạy lại segmentation; job nguồn luôn bất biến.
- `data/jobs/` là nguồn dữ liệu bền vững duy nhất. Redis không có volume lưu trữ.
- Code Catalog lưu atomic tại `OCR_DATA_DIR/_codes.json`, có revision conflict;
  không thêm database.
- Trình duyệt chỉ gọi đường dẫn tương đối `/api/*`; cấu hình provider và secret
  không bao giờ được gửi xuống frontend.
- `/api/system-metrics` chỉ trả CPU/RAM, dung lượng filesystem chứa
  `OCR_DATA_DIR` và GPU mà backend nhìn thấy theo best-effort. Endpoint không trả
  hostname, path, process, raw command output, secret hoặc provider config;
  Compose mặc định không yêu cầu GPU.

## Yêu cầu môi trường

- Python 3.12 và `uv`.
- Node.js 22 và pnpm 10.
- Docker Compose chỉ cần cho môi trường live internal-pilot và Milestone C.

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

Local contract gate không cần Redis, worker đang chạy, Docker, GPU hoặc provider
thật và vẫn bắt buộc trước strong-server gate:

```powershell
uv run --project backend pytest backend/tests -q
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
python -m compileall -q backend/app
git diff --check
```

Playwright kiểm tra workflow dùng mock, một luồng Next/FastAPI/eager-task thật
với fake provider cục bộ, desktop `1440×900`, laptop `1366×768` và safety smoke
mobile `390×844`. Các kiểm tra này không chứng minh hành vi của
Redis/Celery/provider trên live internal-pilot stack.

Khi schema FastAPI thay đổi, chạy `pnpm api:generate` và commit cả
`frontend/openapi.json` lẫn `frontend/lib/api-schema.ts`.

## Chạy bằng Docker Compose

Nginx publish cổng host `52409`; frontend đồng thời publish `54846` để địa chỉ
Next.js ghi trong container log có thể truy cập trực tiếp. Cả hai đường đều dùng
được đầy đủ `/api/*`; backend, Redis và worker vẫn chỉ hoạt động trong mạng nội
bộ của Compose. Dùng `52409` cho luồng internal-pilot/cutover và `54846` khi cần
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
drain worker và tạo bản sao lưu có checksum.

## Cổng và dữ liệu

- FastAPI chạy trực tiếp: `50177`.
- Next.js chạy trực tiếp hoặc frontend Compose: `54846`.
- Điểm truy cập Compose: `52409`.
- Redis nội bộ trong Compose: `6380`.

`OCR_ENDPOINT_EXTERNAL` mặc định là `true`; mỗi job phải ghi nhận sự đồng ý
trước khi gửi ảnh trang đến endpoint bên ngoài. `BACKEND_PORT` cố ý không được
hỗ trợ — backend luôn lắng nghe tại `50177`.

Xem [implementation_plan.md](implementation_plan.md) cho backend, Repair Gate,
cutover và evidence Milestone C; xem
[frontend_plan.md](frontend_plan.md) cho frontend và các
counterpart `FE-X1`–`FE-X17`.
