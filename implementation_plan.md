# Kế hoạch công việc còn lại cho OCR monorepo

**Trạng thái hiện tại:** Milestone A và B đã implement, pass 18 test backend,
typecheck/build và 3 browser smoke local ngày 2026-07-21. Bằng chứng
Nginx/Redis/Celery/provider thật vẫn để ở Gate Milestone C. Legacy
`src/ocr/` + `web/` vẫn là runtime rollback cho đến khi Gate Milestone C pass.

File này chỉ theo dõi việc chưa làm, đang làm hoặc đã làm nhưng đang lỗi. Các
phase đã hoàn tất 100% không được liệt kê lại.

## 1. Khoảng trống còn lại

### Chỉ còn acceptance trên strong server

- Chưa có bằng chứng runtime thật cho Nginx, Redis, Celery worker và provider.
- Chưa chạy ba PDF acceptance cố định, restart/interrupted, round-trip với
  legacy hoặc rollback rehearsal trên `OCR_DATA_DIR` thật.
- Chưa thể ký `docs/phase4_acceptance.md`; không suy diễn các gate này từ
  unit/integration test local.

## 2. Quyết định đã khóa

### PDF-only và lưu trữ

- Chỉ nhận PDF: bỏ ZIP/ảnh và bỏ `kind` khỏi contract/UI mới. Client legacy có
  thể gửi field thừa trong cửa sổ chuyển đổi, nhưng upload vẫn chỉ nhận PDF.
- Mỗi job tối đa 15 PDF, tổng 200 MiB; mỗi PDF tối đa 100 trang.
- Ngay lúc upload, kiểm tra tên `.pdf`, chữ ký `%PDF`, cấu trúc, mật khẩu và
  số trang. Một PDF hỏng, có mật khẩu hoặc vượt 100 trang làm toàn job `error`;
  không enqueue, render hoặc gọi provider. Người dùng tạo job mới.
- `OCR_DATA_DIR` và artifacts chỉ lưu offline trên host. OCR vẫn gọi một
  OpenAI-compatible endpoint được cấu hình; không thêm database.
- Trong cửa sổ rollback một ngày, legacy và stack mới phải đọc/ghi được job
  của nhau mà không chuyển đổi hoặc restore backup.

### Provider và error contract

- Provider/model chỉ do server cấu hình; browser chỉ hiển thị engine/status.
- `OCR_ENDPOINT_EXTERNAL` là cờ explicit, mặc định `true`. Job dùng endpoint
  external phải có consent trước khi gửi ảnh trang.
- Khi tạo job, snapshot các giá trị không bí mật: `provider`, `model`,
  `prompt_version`, `endpoint_external`. Không lưu URL, API key hoặc header.
  Muốn đổi cấu hình phải drain queue trước.
- Job/API chỉ lưu safe error code như `provider_timeout`,
  `provider_unavailable`, `invalid_model_json`; log kỹ thuật phải redact và
  không chứa raw provider response hoặc secret.
- Mỗi trang retry đúng một lần chỉ với lỗi kết nối trước response hoặc HTTP
  `429/502/503/504`; tôn trọng `Retry-After` tối đa 10 giây. Không retry
  read-timeout, JSON sai hoặc validation lỗi.

### Lifecycle, Celery và quyền ghi

- `/start` one-shot: chỉ transition nguyên tử `ready → starting` được enqueue.
  Gọi lại chỉ trả trạng thái hiện tại. Publish thất bại/không chắc chắn chuyển
  `interrupted`; không tự gửi lại.
- Production worker chạy `--concurrency=1 --prefetch-multiplier=1`.
- Backend sở hữu `job.json` đến hết transition nguyên tử `ready → starting`;
  sau đó chỉ worker được ghi khi job active. Cancel chỉ tạo marker; worker ghi
  trạng thái terminal ở page boundary.
- Không tự retry/resume toàn job. Worker/Redis restart làm job active thành
  `interrupted`, giữ artifacts; task cũ xuất hiện lại phải no-op. Redis không
  có AOF/volume và không phải nguồn bền vững.
- Cho phép xóa thủ công job không active: `uploading`, `ready`, mọi trạng thái
  terminal. Chặn xóa `starting`, `queued`, `running`, `cancelling`.

### Review, correction, crop và rerun

- Correction chỉ áp dụng cho job terminal. Backend kiểm tra `old_value`; lệch
  trả `409 correction_conflict`. Giữ OCR gốc trong `ocr_value`, persist giá
  trị sửa/metadata vào `job.json` và ghi audit bất biến dưới cùng backend lock.
- Manual crop chỉ là evidence, không tự đổi OCR value. Persist URL, bbox,
  page, field, source `manual_crop` và timestamp; xác thực crop thuộc đúng job.
- Approval không có correction vẫn persist `review_status="approved"`,
  `approved_at` và audit record.
- Rerun tạo job mới từ cùng PDF với cấu hình server hiện tại, xin consent lại
  khi external và không mang kết quả/correction/crop/approval cũ. Job cũ giữ
  nguyên và chỉ bị xóa bằng thao tác Delete riêng.

### UI, test và rollout

- Visual/behavior parity được nghiệm thu bằng checklist tại desktop
  `1440×900` và mobile `390×844`; không pixel-perfect hoặc screenshot diff.
- Giữ route-mock Playwright cho trạng thái hiếm/lỗi. Thêm một happy path chạy
  Next + FastAPI thật, Celery eager chỉ trong test và fake HTTP provider cục
  bộ; local test không cần Redis, Docker, GPU hoặc provider thật.
- Strong-server acceptance dùng ba PDF cố định đã ẩn danh: PDF điện tử rõ,
  scan nhiều trang và scan khó. Fixture nằm offline ngoài Git và ngoài
  `OCR_DATA_DIR` (ví dụ `/srv/ocr-acceptance/`); báo cáo ghi SHA-256.
- Đây là browser test nội bộ nên không bắt buộc data clone. Trước khi stack mới
  dùng `OCR_DATA_DIR` thật, phải dừng nhận job, drain/dừng legacy worker và tạo
  backup có checksum. Hai worker không bao giờ chạy đồng thời trên cùng data.
- Legacy chỉ backport PDF-only, tương thích dữ liệu hai chiều và vá lỗi ngăn
  hỏng/mất dữ liệu; workflow mới còn lại chỉ triển khai ở stack mới.
- `docs/phase4_acceptance.md` là bằng chứng duy nhất cho Phase C: commit/image,
  lệnh pass/fail, backup/checksum, ba job ID + artifact/page counts, kiểm tra
  field thủ công, restart và rollback rehearsal. Không ghi dữ liệu nhạy cảm.

## 3. Milestone A — Đã implement, chờ bằng chứng strong-server

- `uv run --project backend pytest backend/tests -q`: 18 passed ngày
  2026-07-21; không cần Redis, worker, Docker, GPU hoặc provider thật.
- OpenAPI/types đã regenerate; `pnpm api:check` pass.
- Nginx limit, task `ocr.process_job`, one-shot `/start`, worker concurrency,
  safe error, restart reconciliation, correction/crop/approval, rerun sạch và
  legacy/new round-trip đều có implementation/check local.
- Chưa đóng bằng chứng runtime Nginx/Redis/Celery/provider; thực hiện cùng ba
  fixture cố định tại Milestone C, không suy diễn từ test local.

## 4. Milestone B — Đã implement và verify local

### B1. OpenAPI types

- `frontend/lib/api.ts` dùng trực tiếp schema generated; API calls giữ relative
  `/api/*`, không có BFF hoặc shared package.
- `frontend/openapi.json` và `frontend/lib/api-schema.ts` đã regenerate/commit.

### B2. PDF-only UI và parity

- Dashboard và job detail phủ upload, progress, mọi document/page, correction,
  approval, crop evidence, report, filter/pagination/bulk action và safe errors.
- CSS/native APIs giữ frontend dependency-light; VI/EN, UTF-8, favicon và
  `localStorage["intellidoc.language"]` được kiểm tra tại `1440×900` và
  `390×844`.

### B3. Browser verification đã pass

- 3 smoke pass: route-mock workflow, real Next/FastAPI/eager task/fake HTTP
  provider, và mobile English PDF-only với upload/start safe errors.
- Integration kiểm tra upload, polling/result, correction reload, crop reload,
  approval, rerun và delete preview/delete. Đây không phải bằng chứng
  Redis/Celery/Nginx production.

### Gate Milestone B — pass local 2026-07-21

- Typecheck, production build, OpenAPI/generated-types check và 3 Playwright
  smoke pass.
- Mọi API action tương thích có UI path; không còn control ZIP/ảnh hoặc lỗi
  hydration khi đọc ngôn ngữ đã lưu.

## 5. Milestone C — Strong-server acceptance và rollback

### C1. Acceptance nội bộ

1. Dừng nhận job, drain/dừng legacy worker, backup `OCR_DATA_DIR` và ghi
   checksum/path.
2. Build/start Nginx, frontend, backend, worker và Redis; chỉ Nginx publish
   host port `52409`.
3. Xác nhận health, worker concurrency/prefetch và task registered.
4. Chạy ba fixture từ thư mục acceptance offline qua browser, gồm ít nhất một
   PDF lớn hơn 1 MiB; kiểm tra API, fields, artifacts, report và UI thủ công.
5. Restart backend/worker/Redis; terminal data vẫn đọc được, active job thành
   `interrupted`, task cũ không chạy lại.
6. Dừng stack mới rồi chạy legacy tuần tự trên cùng data để chứng minh tương
   thích hai chiều; không bao giờ chạy hai worker đồng thời.
7. Điền `docs/phase4_acceptance.md` và chỉ đóng gate khi đủ bằng chứng.

### C2. Rollback và cleanup

- Nếu acceptance thất bại, dừng stack mới rồi route về legacy. Chỉ restore
  backup khi dữ liệu thực sự hỏng.
- Giữ legacy rollback-ready một ngày.
- Chỉ xóa `src/`, `web/`, packaging/tests legacy sau cửa sổ rollback và một yêu
  cầu cleanup riêng.

### Gate Milestone C

- Docker/Nginx/Redis/Celery/provider pass end-to-end với ba fixture.
- Restart, persistence, cross-version và rollback rehearsal có bằng chứng.
- Không còn `413`, `503 worker_unavailable`, task trùng hoặc favicon `404`.
- `README.md`, `AGENTS.md`, `.env.example`, runbook và acceptance report phản
  ánh đúng lệnh, port và trạng thái thực tế.

## 6. Lệnh kiểm tra bắt buộc

```bash
# Backend, không cần Redis/provider thật
uv run --project backend pytest backend/tests -q

# Frontend, generated API types và browser smoke
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check

# Strong server
docker compose config
docker compose up -d --build redis backend worker frontend nginx
docker compose ps
docker compose logs --tail=200 backend worker redis nginx
docker compose exec worker celery -A app.workers.tasks:celery_app inspect registered
curl -fsS http://127.0.0.1:52409/health
```

Cuối cùng chạy `git diff --check` và kiểm tra Markdown/VI/EN không có ký tự
thay thế UTF-8.

## Ràng buộc

- Không thêm database, provider SDK, UI kit, state manager, WebSocket, auth,
  auto-retention, persistent code catalog hoặc host telemetry.
- Không đổi route `/api/*`, artifact URL, filesystem layout hoặc safe error
  envelope ngoài các semantics đã khóa ở trên.
- Không xóa legacy runtime trước Gate Milestone C và rollback window.
