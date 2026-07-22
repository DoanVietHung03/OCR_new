# Kế hoạch frontend Legacy+ Browser

Đây là nguồn chuẩn duy nhất cho frontend Next.js, workflow người dùng, visual
parity và browser evidence. Backend contract, worker, cutover và Milestone C nằm
trong [`implementation_plan.md`](implementation_plan.md).

**Trạng thái 2026-07-22:** Repair Gate `FE-X1`–`FE-X3` và counterpart backend đã
pass local. Task/page payload đi đúng contract, form giữ nguyên khi retry và page
warning không còn che viewer/field hợp lệ. Milestone C vẫn cần live repro
`63-btc.pdf` cùng evidence strong-server trong `BE-C-EVIDENCE`.

## Cách dùng hai kế hoạch

- Frontend sở hữu route, input, copy, rendering, interaction, accessibility và
  visual evidence; backend sở hữu schema, persistence và execution semantics.
- Mỗi mục `FE-Xn` link thẳng tới `BE-Xn`. Chỉ đánh dấu hoàn thành khi hai phía
  pass hoặc một phía ghi rõ `N/A` cùng lý do.
- Không chép lại backend contract dài trong file này. OpenAPI generated là nguồn
  chuẩn duy nhất cho public fields.
- Ảnh trong `docs/ui-parity/` là local UI evidence, không phải provider hoặc
  production evidence.

| Frontend | Backend counterpart | Joint gate |
|---|---|---|
| `FE-X1` | [`BE-X1`](implementation_plan.md#be-x1) | Task/page input chạy đúng provider pass/page set |
| `FE-X2` | [`BE-X2`](implementation_plan.md#be-x2) | Partial result vẫn review được, trang lỗi được định vị |
| `FE-X3` | [`BE-X3`](implementation_plan.md#be-x3) | Generated schema không drift |
| `FE-X4` | [`BE-X4`](implementation_plan.md#be-x4) | Review/report/artifact dùng durable data thật |
| `FE-X5` | [`BE-X5`](implementation_plan.md#be-x5) | Browser pass qua production-like stack thật |
| `FE-X6` | [`BE-X6`](implementation_plan.md#be-x6) | Folder picker vẫn PDF-only, nếu được duyệt |

## Phạm vi và nguồn chuẩn

**Legacy Reference Browser** là browser trong
`C:\HProjecT\OCR_paper\Web\src`, dùng tham chiếu layout, mật độ thông tin và
workflow; không phải nguồn chuẩn security, public API hoặc persistence.

**Legacy+ Browser** là browser Next.js hiện tại: phục hồi tiện ích vận hành bằng
typed API, dữ liệu thật, durable state và accessibility tốt hơn.

Thứ tự ưu tiên khi có mâu thuẫn:

1. Invariant và public contract trong `implementation_plan.md`.
2. OpenAPI do FastAPI sinh.
3. File này cho workflow/visual frontend.
4. `OCR_paper/Web/src/app.js`, `styles.css`, `i18n.js` để tham khảo.

Browser cũ dùng dữ liệu giả thì Legacy+ phải dùng dữ liệu thật hoặc hiển thị
“không có dữ liệu”. Cấm URL/key/header provider, raw response, stack trace,
filesystem path, progress/quality/benchmark giả và unredacted payload.

Upload vẫn PDF-only, tối đa 15 file/job, 200 MiB/job và 100 trang/PDF. ZIP và ảnh
upload trực tiếp nằm ngoài phạm vi. Folder picker là đề xuất riêng tại `FE-X6`.

## Information architecture

| Mục | Route/state | Dữ liệu chính |
|---|---|---|
| Jobs | `/` | Dashboard, search/filter/sort/page và lifecycle action |
| Upload | `/upload` | PDF selection, Provider Profile, task/page scope, consent |
| Manage | `/documents` | Document index xuyên job |
| Logs | `/logs` | Typed Safe Events |
| Report | `/reports` | Operations/quality/benchmark thật hoặc unavailable |
| Codes | `/codes` | Durable Code Catalog |
| Job detail | `/jobs/[id]?view=...` | Overview, review, artifacts, report và logs |
| System Monitor | Dialog/deep-linkable state | Safe telemetry backend nhìn thấy |

Search/filter/sort/page, selected document/page và job tab phải khôi phục được
qua URL khi refresh/back/forward. Polling chỉ chạy khi job active hoặc monitor mở;
terminal dừng polling và stale refresh giữ snapshot gần nhất kèm cảnh báo.

## Visual và interaction invariant

- Giữ hierarchy/density đã chứng minh: sidebar tối, card/panel giàu thông tin,
  badge, bảng gọn và modal có phân cấp; token tập trung trong CSS.
- Chỉ dùng Next/React, CSS và native browser APIs; không UI kit/state manager.
- Semantic HTML, skip link, focus ring, focus trap, keyboard navigation,
  `aria-live` có kiểm soát và `prefers-reduced-motion` phải tiếp tục hoạt động.
- Text/ID/filename dài phải wrap hoặc truncate có affordance; không phá layout.
- Loading/empty/error/unavailable đều trung thực; không fabricate số liệu.
- Desktop anchors: `1440×900`, `1366×768`. Mobile `390×844` chỉ yêu cầu không
  overflow ngang, layout nguyên vẹn, navigation/modal đóng được.
- Ảnh parity chỉ hợp lệ khi hai browser cùng viewport, language, data và UI state.

## Kế hoạch đang mở

### FE-X1

**Task/page input — PASS LOCAL 2026-07-22.** Counterpart: [`BE-X1`](implementation_plan.md#be-x1).

- Giữ control Provider Profile, `metadata|full_ocr`, page scope và max pages hiện
  có; `full_ocr` khóa `all`/max `0`, metadata cho các scope server công bố.
- Copy phải giải thích rõ metadata nhanh chỉ xử lý page plan, còn full OCR xử lý
  toàn bộ trang; không hứa “nhanh” khi profile không hỗ trợ.
- Browser chỉ gửi `provider_profile_id`, task/pages/max-pages và consent; không
  gửi URL/key/header/model tùy ý.
- E2E phải chứng minh payload đúng và kết quả live hiển thị selected pages/status
  do backend trả, không chỉ kiểm tra dropdown đã đổi state.
- Giữ selection khi create/upload/start thất bại để người dùng retry.

UI/task reference cũ: `OCR_paper/Web/src/app.js:1696-1720,3466-3479,4083-4092`.

### FE-X2

**Partial-result review — PASS LOCAL 2026-07-22.** Counterpart:
[`BE-X2`](implementation_plan.md#be-x2).

- Không dùng `document.errors.length > 0` để thay toàn workspace bằng màn hình
  “Kết quả model không hợp lệ”. Nếu còn page/field dùng được, vẫn hiển thị viewer,
  fields, correction và evidence.
- Hiển thị banner `n/m trang thành công`, safe error summary và đánh dấu đúng page
  lỗi trong page navigation. Chỉ hiện màn hình lỗi toàn document khi không còn
  kết quả sử dụng được.
- Warning không được tự buộc rerun toàn job. Approval UI phải phản ánh blocker do
  backend công bố thay vì suy đoán từ mọi warning.
- Browser test bắt buộc: một document có fields tốt và một page warning; viewer,
  fields, banner và failed-page marker cùng xuất hiện.

### FE-X3

**Generated contract — PASS LOCAL 2026-07-22.** Counterpart:
[`BE-X3`](implementation_plan.md#be-x3).

- `frontend/lib/api.ts` chỉ dùng generated types từ
  `frontend/lib/api-schema.ts`; không thêm DTO viết tay.
- Page/pass/error fields mới phải có render fallback cho job cũ và unknown legacy
  extras. Unknown/non-scalar field vẫn visible read-only.
- Chạy `pnpm api:check`, typecheck, build và browser smoke sau mỗi OpenAPI change.

### FE-X4

**Workflow regression — PROTECT.** Counterpart:
[`BE-X4`](implementation_plan.md#be-x4).

- Dashboard dùng persisted counters/timing; progress không nội suy. Search/filter/
  sort/page nằm trong URL; lifecycle action tuân theo state matrix.
- Documents index có pagination/filter/sort/deep-link và hiển thị review/quality/
  warning an toàn.
- Job detail có document/page navigation số, previous/next, direct jump,
  Fit/100%, preview fallback và không preload toàn bộ job lớn.
- Scalar fields sửa được; suggestion chỉ Apply khi người dùng yêu cầu.
  `/corrections` luôn mang nghĩa **Lưu và duyệt**; giữ draft guard và conflict.
- Manual crop bắt đầu từ rectangle người dùng vẽ trên natural pixels, hỗ trợ
  pointer/keyboard/clamp/min-size; crop chỉ là evidence.
- Artifacts/Safe Events thiếu cục bộ không làm sập workspace. Copy/download chỉ
  dùng sanitized public data.
- Reports dùng timing/count/coverage thật; thiếu confidence/sample là unavailable,
  không phải `0%`. Codes CRUD phải sống qua reload/restart.
- System Monitor chỉ hiển thị allowlisted nullable metrics; dừng polling khi tab
  hidden, dialog đóng hoặc component unmount.
- Giữ Vietnamese mặc định, English đầy đủ và
  `localStorage["intellidoc.language"]`.

### FE-X5

**Browser strong-server acceptance — READY, evidence vẫn PENDING.** Counterpart:
[`BE-X5`](implementation_plan.md#be-x5).

Sau khi `X1`–`X3` pass local, dùng browser qua Nginx `:52409` để chạy ba fixture,
kiểm tra upload trên 1 MiB, task/page results, partial warning, review/correction/
approval/crop, artifacts/report, rerun/delete và reload sau restart. Ghi toàn bộ
evidence vào [`BE-C-EVIDENCE`](implementation_plan.md#be-c-evidence); không tạo
evidence ledger thứ hai ở frontend.

### FE-X6

**Folder picker PDF-only — PROPOSED, chưa được duyệt triển khai.** Counterpart:
[`BE-X6`](implementation_plan.md#be-x6).

Nếu được duyệt, dùng native `<input webkitdirectory>` như một cách chọn nhiều file:
lọc `.pdf`, áp dụng giới hạn hiện có, báo non-PDF/path/basename trùng trước khi tạo
job rồi tái sử dụng create → upload → start. Không upload directory tree, ZIP, ảnh,
relative path hoặc thêm API mới.

Reference cũ: `OCR_paper/Web/src/app.js:1724-1747,3111-3133,3492-3503`.

## Public-data mapping cần bảo vệ

| UI block | Public source |
|---|---|
| Dashboard | `GET /api/state` |
| Provider configuration | `GET /api/provider-profiles`, engine readiness endpoint |
| Upload | limits và create/upload/start endpoints |
| Lifecycle action | cancel, rerun, delete-preview và bulk-delete |
| Review | `GET /api/jobs/{id}` và `/corrections` |
| Crop | page artifact và `/manual-crop` |
| Manage | `GET /api/documents` |
| Artifacts | `GET /api/jobs/{id}/artifacts` |
| Logs/timeline | `GET /api/events` |
| Reports | `GET /api/reports` |
| Codes | `/api/codes` CRUD |
| System Monitor | `GET /api/system-metrics` |

## Regression checklist

| Nhóm | Trạng thái hiện tại | Điều kiện đóng |
|---|---|---|
| Shell/routes, visual parity, VI/EN, accessibility, responsive | PROTECT | Route/deep-link và ba viewport vẫn pass |
| Provider/task upload | PASS LOCAL `X1` | Input chạy đúng backend task/page semantics |
| Dashboard và Manage | PROTECT | Chỉ dùng persisted/typed data |
| Rich job workspace | PASS LOCAL `X2` | Partial warning không che page/field tốt |
| Review/crop | PROTECT | Correction/conflict/draft/crop reload pass |
| Artifacts/timeline/logs | PASS LOCAL `X2` | Per-page safe diagnostics render đúng |
| Reports/benchmark/Codes/Monitor | PROTECT | Nullable/unavailable và durable data vẫn đúng |
| Generated API/compatibility | PASS LOCAL `X3` | OpenAPI check và legacy read pass |
| Local closure | PASS | `X1`–`X4` cùng local gate pass |
| Milestone C | READY `X5` | Strong-server evidence ledger được ký |

Không dùng lại con số `18/19` cho trạng thái hiện tại cho đến khi các mục OPEN đã
pass. Kết quả ngày 2026-07-21 chỉ là baseline lịch sử: backend `27 passed`, legacy
compatibility `10 passed`, browser mặc định `11 passed, 1 capture-only skipped`,
capture mode `12 passed`, typecheck/build/OpenAPI/compile/diff đều pass.

## UI evidence hiện có

Các ảnh sanitized được giữ trong `docs/ui-parity/`:

| Ảnh | State/viewport |
|---|---|
| `legacy-dashboard.png` | Legacy dashboard, 1440×900 |
| `legacy-dashboard-1366x768.png` | Legacy dashboard, 1366×768 |
| `recreated-dashboard.png` | Legacy+ cùng fixture, 1440×900 |
| `recreated-dashboard-1366x768.png` | Legacy+ cùng fixture, 1366×768 |
| `review-workspace.png` | Review workspace, 1440×900 |
| `crop-modal.png` | Natural-pixel crop, 1366×768 |
| `mobile-upload-390x844.png` | Mobile PDF-only safety state |

Visual acceptance là interaction/checklist review, không phải pixel-diff gate.
Ảnh trên đã phát hiện action-grid overflow ở 1366px và Run comparison không trung
thực; cả hai từng được sửa. Repair Gate được đóng bằng browser test mới, không
dùng ảnh cũ thay cho interaction evidence.

## Lệnh kiểm tra frontend và joint gate

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

Legacy+ chỉ production-ready khi `FE-X1`–`FE-X5` và counterpart backend tương ứng
pass, `BE-C-EVIDENCE` được ký bằng runtime thật, và cửa sổ rollback một ngày kết
thúc. Không xóa legacy runtime trong kế hoạch frontend.
