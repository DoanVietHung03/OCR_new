# Kế hoạch backend OCR monorepo

Đây là nguồn chuẩn duy nhất cho backend, public contract, durable state, worker,
cutover và bằng chứng Milestone C. Kế hoạch frontend nằm trong
[`legacy_browser_recreated.md`](legacy_browser_recreated.md).

**Trạng thái 2026-07-22:** Repair Gate `BE-X1`–`BE-X3` và `FE-X1`–`FE-X3` đã pass
local: worker thực thi đúng task/page plan, parser giữ partial result, frontend vẫn
review được trang/field tốt và generated contract không drift. Milestone C vẫn
chưa pass cho đến khi repro `63-btc.pdf` và toàn bộ evidence strong-server được
ghi tại `BE-C-EVIDENCE`. `src/ocr/` và `web/` vẫn là runtime rollback.

## Cách dùng hai kế hoạch

- Backend sở hữu schema, validation, persistence, worker, provider, deployment
  và evidence vận hành; frontend không chép lại các contract này.
- Mỗi mục giao nhau dùng mã `X1`–`X6` và backlink đối xứng. Một mục chỉ được đóng
  khi counterpart đã pass hoặc ghi rõ `N/A` cùng lý do.
- Public schema thay đổi bắt buộc kiểm tra `BE-X3` và `FE-X3`.
- Checkbox/test local không thay thế evidence provider/worker thật trong
  [`BE-C-EVIDENCE`](#be-c-evidence).
- Chỉ giữ việc đang lỗi, chưa làm hoặc regression contract cần bảo vệ; lịch sử
  chi tiết đã hoàn thành thuộc Git history.

| Mã | Backend sở hữu | Frontend counterpart | Joint gate |
|---|---|---|---|
| `X1` | Task, page planner, validation | [`FE-X1`](legacy_browser_recreated.md#fe-x1) | UI input đi xuyên suốt tới đúng provider pass/page set |
| `X2` | Parser, page status, safe error | [`FE-X2`](legacy_browser_recreated.md#fe-x2) | Partial result vẫn review được và trang lỗi được định vị |
| `X3` | Pydantic/OpenAPI | [`FE-X3`](legacy_browser_recreated.md#fe-x3) | Generated types không drift, không có DTO viết tay |
| `X4` | Durable review/report/artifact data | [`FE-X4`](legacy_browser_recreated.md#fe-x4) | Workflow dùng dữ liệu thật và reload được |
| `X5` | Runtime/cutover/evidence | [`FE-X5`](legacy_browser_recreated.md#fe-x5) | Browser pass qua Nginx/FastAPI/Celery/provider thật |
| `X6` | PDF validation/quota | [`FE-X6`](legacy_browser_recreated.md#fe-x6) | Folder picker chỉ là cách chọn nhiều PDF, nếu được duyệt |

## Domain contract

| Thuật ngữ | Nghĩa chuẩn |
|---|---|
| Legacy Reference Browser | Browser trong `C:\HProjecT\OCR_paper\Web\src`, chỉ dùng tham chiếu visual/workflow |
| Legacy+ Browser | Browser Next.js hiện tại dùng typed API, dữ liệu thật và durable state |
| Provider Profile | Lựa chọn OCR do server định nghĩa; public contract chỉ có ID, nhãn, capability và readiness an toàn |
| OCR Job | Source PDFs, lifecycle, documents, artifacts, audit và safe events được lưu trong job JSON/artifacts |
| Review Evidence | Source/confidence/crop/artifact có provenance do worker hoặc review flow ghi |
| Code Catalog | Danh mục mã có revision, lưu atomic tại `OCR_DATA_DIR/_codes.json` |
| Safe Event | Event typed và sanitized; không phải raw provider log hoặc stack trace |
| Unavailable | Dữ liệu không tồn tại/không truy cập được; không được thay bằng `0` hoặc số liệu giả |

## Invariant đã khóa

### PDF và durable state

- Chỉ nhận PDF: tối đa 15 file/job, 200 MiB/job, 100 trang/PDF; render 200 DPI.
- Upload phải kiểm tra extension, `%PDF`, cấu trúc, mật khẩu và số trang trước
  dispatch. Một PDF sai làm job lỗi và không gọi provider.
- `OCR_DATA_DIR` job JSON/artifacts là durable truth. Redis chỉ điều phối task;
  không thêm database, Redis AOF/volume hoặc store thứ hai.
- Giữ `/api/*`, artifact URL, filesystem layout và khả năng đọc hai chiều với
  legacy. Đọc job cũ không được tự rewrite.

### Provider, lifecycle và error

- FastAPI không render PDF hoặc gọi provider; Celery sở hữu toàn bộ OCR.
- Server giữ URL/key/header/model thật. Job chỉ snapshot provider, model,
  prompt version và external status; external endpoint yêu cầu consent từng job.
- `/start` chuyển nguyên tử `ready → starting` đúng một lần. Publish không chắc
  chắn thành `interrupted`; không auto-resume hoặc retry cả job.
- Production worker luôn `--concurrency=1 --prefetch-multiplier=1`.
- Một page chỉ retry một lần với pre-response connection failure hoặc HTTP
  `429/502/503/504`; `Retry-After` tối đa 10 giây. Không retry read timeout,
  invalid JSON hoặc validation error.
- Chỉ persist stable safe error. Cấm secret, URL, header, raw provider response,
  unredacted request/response và document text trong log.
- Backend ghi trước dispatch, worker ghi khi active, backend ghi lại sau terminal.
  Cancel dùng marker; stale task phải no-op.

### Review và lifecycle action

- Correction kiểm tra `old_value`, lệch trả `409 correction_conflict`; giữ
  `ocr_value`, immutable audit và approval kể cả không có correction.
- Manual crop là append-only evidence, không tự thay OCR value. OCR `bbox` không
  có contract tọa độ ổn định và không được dùng làm crop seed.
- Rerun chỉ copy source PDFs vào job sạch; không mang correction/crop/approval cũ.
- Chỉ xóa `uploading`, `ready` hoặc terminal; không xóa active job.
- Code Catalog dùng atomic replace, process-local lock và revision conflict;
  chưa có nhu cầu distributed lock.

## Kế hoạch đang mở

### BE-X1

**Task và page planner — PASS LOCAL 2026-07-22.** Counterpart: [`FE-X1`](legacy_browser_recreated.md#fe-x1).

- `vlm_task`, `vlm_pages`, `vlm_max_pages` được validate/persist và worker thực thi
  bằng một planner trung tâm.
- `full_ocr` phải OCR text trên mọi trang, persist text/status từng trang, rồi
  lấy metadata trên page plan phù hợp. `metadata` chỉ chạy metadata prompt trên
  page plan đã chọn.
- Dùng đúng một planner trung tâm: `all` lấy mọi trang; `first,last` lấy trang
  đầu/cuối; `auto` ban đầu lấy trang đầu và hai trang cuối; `max_pages` cắt ổn
  định sau khi loại trùng. Cue chữ ký/con dấu chỉ bật sau khi có fixture cố định.
- Test tối thiểu: `all/auto/first,last/max`, PDF 1–2 trang, thứ tự ổn định và số
  provider call/pass theo task.
- Repro live dùng `63-btc.pdf`, SHA-256
  `5C1C6F9D0E2448832BE88D2CFCF1EF61B4FC77DE1AF7449C37367619E00261BE`, chạy cả
  `metadata` và `full_ocr`, ghi selected pages/status/fields/report nhưng không
  ghi nội dung tài liệu vào log.

Nguồn đối chiếu cũ: `OCR_paper/src/ocr_poc/vlm_pages.py:24-151`,
`vlm_runner.py:37-95`, `Qwen/run_api.py:1046-1064,1126-1160`. Chỉ port semantics;
không copy subprocess runner hoặc kiến trúc store cũ.

### BE-X2

**Parser và partial result — PASS LOCAL 2026-07-22.** Counterpart: [`FE-X2`](legacy_browser_recreated.md#fe-x2).

- Parse JSON object từ content string/text blocks/Markdown; canonicalize alias;
  nhận field scalar hoặc object; chỉ giữ allowlist.
- Page boundary cung cấp `page_index`. Khi provider thiếu evidence, dùng
  `confidence=None`, `bbox=[]`, `needs_review=true`. Field lạ bị bỏ kèm safe
  warning, không làm hỏng field tốt.
- `{"fields": {}}` hợp lệ khi trang không có metadata. Chỉ dùng
  `invalid_model_json` khi không tìm được `fields` object sử dụng được.
- Log nội bộ phân biệt `missing_content`, `malformed_json`, `unknown_field`,
  `incomplete_field`, `invalid_field_value`; public job chỉ nhận stable safe code.
- Persist từng page ít nhất `page_index`, `ocr_scope`, `status`, `error` và OCR
  text khi task yêu cầu. `failed_pages` phải tổng hợp từ page state.
- Một page fail không được xóa fields/page tốt. Approval chỉ bị chặn bởi blocker
  thật, không phải mọi warning.
- Test content blocks, fenced JSON, alias, field lạ xen field tốt, thiếu evidence
  và page-indexed safe error. Không retry invalid JSON và không persist raw data.

Nguồn đối chiếu cũ: `OCR_paper/Qwen/run_api.py:244-370,839-872`,
`src/ocr_poc/vlm_runner.py:157-175` và `vlm_report.py:1533-1639`.

### BE-X3

**Generated contract — PASS LOCAL 2026-07-22.** Counterpart:
[`FE-X3`](legacy_browser_recreated.md#fe-x3).

- Pydantic v2/OpenAPI là nguồn chuẩn public fields. Page/pass/error fields mới
  phải optional hoặc có migration-safe default để job cũ vẫn đọc được.
- Regenerate `frontend/openapi.json` và `frontend/lib/api-schema.ts`; chạy
  `pnpm api:check`. Không thêm handwritten DTO hoặc shared-types package.
- Contract test phải chứng minh legacy extras vẫn đọc được và read không rewrite.

### BE-X4

**Durable workflow regression — PROTECT.** Counterpart:
[`FE-X4`](legacy_browser_recreated.md#fe-x4).

- Giữ corrections/approval/crop, Documents index, artifact manifest, Safe Events,
  reports, Code Catalog và safe telemetry đã pass local.
- Artifact thiếu/hỏng là trạng thái cục bộ, không làm sập document/job response.
- Report chỉ dùng persisted timing/counts/coverage; thiếu sample phải nullable hoặc
  unavailable, không dựng benchmark hay quality.
- Telemetry chỉ trả CPU/RAM, disk chứa `OCR_DATA_DIR`, runtime và GPU best-effort;
  cấm hostname, IP, username, path, process, environment dump và raw output.

### BE-X5

**Strong-server acceptance — READY, evidence vẫn PENDING.** Counterpart:
[`FE-X5`](legacy_browser_recreated.md#fe-x5).

Chỉ đóng khi có Nginx/Redis/Celery/provider thật, ba fixture cố định, restart,
compatibility và rollback evidence trong [`BE-C-EVIDENCE`](#be-c-evidence).

### BE-X6

**Folder picker PDF-only — PROPOSED, chưa được duyệt triển khai.** Counterpart:
[`FE-X6`](legacy_browser_recreated.md#fe-x6).

Nếu được duyệt, backend không thêm folder/path contract: tiếp tục nhận tối đa 15
PDF qua API hiện có, xác thực từng file tại trust boundary và từ chối basename
trùng. Không nhận ZIP, ảnh, `kind` hoặc server-side directory scan.

Tham chiếu cũ: `OCR_paper/Web/src/app.js:1724-1747,3111-3133,3492-3503`.

## Milestone C: runbook và rollback

### Điều kiện trước khi chạy

1. `BE-X1`–`BE-X3` và `FE-X1`–`FE-X3` đã pass focused/local tests.
2. Chuẩn bị ba PDF đã ẩn danh ngoài Git và `OCR_DATA_DIR`: digital rõ, scan nhiều
   trang và scan khó; ít nhất một file lớn hơn 1 MiB; ghi SHA-256.
3. Dừng nhận upload, drain/dừng legacy worker, rồi backup `OCR_DATA_DIR` có path,
   size và checksum. Không chạy hai worker version trên cùng data directory.

### Khởi động và kiểm tra

```bash
docker compose config
docker compose up -d --build redis backend worker frontend nginx
docker compose ps
docker compose logs --tail=200 backend worker redis nginx
docker compose exec worker celery -A app.workers.tasks:celery_app inspect registered
curl -fsS http://127.0.0.1:52409/health
curl -fsSI http://127.0.0.1:54846/
curl -fsS http://127.0.0.1:54846/api/state > /dev/null
```

Qua browser Nginx `:52409`, chạy ba fixture và kiểm tra job ID, page/artifact
counts, report cùng field thủ công. Sau đó restart backend/worker/Redis: terminal
job vẫn đọc được, active job thành `interrupted`, stale task không chạy lại.

Dừng stack mới trước khi chạy legacy tuần tự trên cùng data để kiểm tra round-trip
hai chiều và rollback route. Nếu thất bại, route về legacy; chỉ restore backup khi
dữ liệu thực sự hỏng. Giữ legacy rollback-ready một ngày; cleanup là yêu cầu riêng.

## BE-C-EVIDENCE

Đây là ledger bằng chứng Milestone C duy nhất. Điền trên strong server; không ghi
secret, provider URL, raw response, document text hoặc API key. Local test không
thay thế được các mục dưới đây.

### Build và môi trường

- Date/operator: _pending_
- Commit: _pending_
- Image digests: _pending_
- Host/runtime versions: _pending_
- Sanitized `docker compose config`: _pending_

### Bảo vệ dữ liệu và worker cutover

- Uploads paused: _pending_
- Legacy queue drained và worker stopped: _pending_
- `OCR_DATA_DIR` resolved path: _pending_
- Backup path, size, SHA-256: _pending_
- Chỉ một worker version sử dụng directory: _pending_

### Fixture cố định

| Fixture | SHA-256 | Bytes/pages | Job ID | Artifacts/report | Manual field check |
|---|---|---|---|---|---|
| Clear digital PDF | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Multi-page scan | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Difficult scan | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

### Runtime gate

- Repair repro `63-btc.pdf` cho hai task: _pending_
- Nginx health `52409`; frontend và `/api/*` `54846`: _pending_
- Backend/Redis internal-only: _pending_
- Worker registered `ocr.process_job`, concurrency `1`, prefetch `1`: _pending_
- Upload trên 1 MiB không `413`: _pending_
- Không `worker_unavailable`, duplicate task, secret hoặc raw response trong log:
  _pending_
- Partial-page result, correction reload, crop, approval, rerun, delete: _pending_

### Restart, compatibility và rollback

- Terminal job sống qua backend/worker/Redis restart: _pending_
- Active job thành `interrupted`; stale task no-op: _pending_
- New-to-legacy và legacy-to-new round-trip: _pending_
- New stack stopped trước khi legacy started: _pending_
- Rollback route rehearsal: _pending_
- Backup restore required: _pending (expected: no)_

### Lệnh và sign-off

Ghi exact command, timestamp, exit status và sanitized evidence path:

```text
pending
```

- Gate result: **PENDING**
- Approver/date: _pending_
- One-day rollback window ends: _pending_

## Lệnh kiểm tra local

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

Local checks là contract evidence, không chứng minh chất lượng OCR hoặc production
runtime. Không thêm database, provider SDK, UI kit, state manager, BFF,
WebSocket, auth, auto-retention hoặc host agent.

## Cơ sở kỹ thuật còn hiệu lực

- Python 3.12; timezone-aware UTC; [Python 3.12 notes](https://docs.python.org/3.12/whatsnew/3.12.html).
- FastAPI/Pydantic v2 sinh OpenAPI; settings không phải API model:
  [FastAPI settings](https://fastapi.tiangolo.com/advanced/settings/).
- Celery/Redis chỉ điều phối; filesystem là durable truth:
  [Celery documentation](https://docs.celeryq.dev/en/stable/).
- `uv sync --project backend`; không tạo Python workspace không cần thiết:
  [uv project sync](https://docs.astral.sh/uv/concepts/projects/sync/).
- Next App Router, native CSS/browser APIs và relative `/api/*`; không thêm package
  UI/state cho chức năng nền tảng đã có.
