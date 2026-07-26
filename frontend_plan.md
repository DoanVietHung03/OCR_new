# Kế hoạch frontend Next.js

Đây là nguồn chuẩn duy nhất cho frontend Next.js, workflow người dùng, visual
parity và browser evidence. Backend contract, worker, cutover và Milestone C nằm
trong [`implementation_plan.md`](implementation_plan.md).

**Trạng thái kiểm tra lại 2026-07-24:** Repair Gate `FE-X1`–`FE-X3` và counterpart backend đã
pass local. `FE-X8`–`FE-X13` và phạm vi local của `FE-X15` đã pass; `FE-X14` còn
chờ benchmark fingerprint. `FE-X7`/`FE-X16` còn chờ bốn fixture và restart thật.
Các điều kiện còn thiếu nằm tại [`incomlpeted.md`](incomlpeted.md).
Milestone C là internal production-like pilot; live evidence vẫn
ghi duy nhất trong `BE-C-EVIDENCE`.

## Cách dùng hai kế hoạch

- Frontend sở hữu route, input, copy, rendering, interaction, accessibility và
  visual evidence; backend sở hữu schema, persistence và execution semantics.
- Mỗi mục `FE-Xn` link thẳng tới `BE-Xn`. Chỉ đánh dấu hoàn thành khi hai phía
  pass hoặc một phía ghi rõ `N/A` cùng lý do.
- Không chép lại backend contract dài trong file này. OpenAPI generated là nguồn
  chuẩn duy nhất cho public fields.
- Ảnh trong `docs/ui-parity/` là local UI evidence, không phải provider hoặc live
  runtime evidence.

| Frontend | Backend counterpart | Joint gate |
|---|---|---|
| `FE-X1` | [`BE-X1`](implementation_plan.md#be-x1) | Task/page input chạy đúng provider pass/page set |
| `FE-X2` | [`BE-X2`](implementation_plan.md#be-x2) | Partial result vẫn review được, trang lỗi được định vị |
| `FE-X3` | [`BE-X3`](implementation_plan.md#be-x3) | Generated schema không drift |
| `FE-X4` | [`BE-X4`](implementation_plan.md#be-x4) | Review/report/artifact dùng durable data thật |
| `FE-X5` | [`BE-X5`](implementation_plan.md#be-x5) | Browser pass qua production-like stack thật |
| `FE-X6` | [`BE-X6`](implementation_plan.md#be-x6) | Native folder selection; không port ZIP/ảnh/directory tree hay kiến trúc cũ |
| `FE-X7` | [`BE-X7`](implementation_plan.md#be-x7) | Job mới render evidence tối thiểu có provenance |
| `FE-X8` | [`BE-X8`](implementation_plan.md#be-x8) | Expected field thiếu vẫn nhập/audit/reload được |
| `FE-X9` | [`BE-X9`](implementation_plan.md#be-x9) | UI phản ánh blocker thật, không tự suy đoán risk |
| `FE-X10` | [`BE-X10`](implementation_plan.md#be-x10) | Rerun không đổi ngầm profile/task/page scope |
| `FE-X11` | [`BE-X11`](implementation_plan.md#be-x11) | Readiness phân biệt configured/reachable/ready |
| `FE-X12` | [`BE-X12`](implementation_plan.md#be-x12) | Progress/failure/timeline chỉ dùng persisted data |
| `FE-X13` | [`BE-X13`](implementation_plan.md#be-x13) | Manage triage và field evidence deep-link đúng |
| `FE-X14` | [`BE-X14`](implementation_plan.md#be-x14) | Report/benchmark không placeholder, export tải được |
| `FE-X15` | [`BE-X15`](implementation_plan.md#be-x15) | URL state, density và utility native hoàn chỉnh |
| `FE-X16` | [`BE-X16`](implementation_plan.md#be-x16) | Hồ sơ gộp được phân đoạn, xác nhận và review bền vững |

## Phạm vi và nguồn chuẩn

Thứ tự ưu tiên khi có mâu thuẫn:

1. Invariant và public contract trong `implementation_plan.md`.
2. OpenAPI do FastAPI sinh.
3. File này cho workflow/visual frontend.

Frontend phải dùng dữ liệu thật hoặc hiển thị
“không có dữ liệu”. Cấm URL/key/header provider, raw response, stack trace,
filesystem path, progress/quality/benchmark giả và unredacted payload.

Upload vẫn PDF-only, tối đa 15 file/job, 200 MiB/job và 100 trang/PDF. Browser
cho chọn nhiều PDF hoặc chọn một thư mục chứa nhiều PDF bằng native directory
picker rồi dùng nguyên flow upload tuần tự hiện có. ZIP, ảnh, directory tree
management và mutable local-only PDF nằm ngoài parity plan tại `FE-X6`.

## Information architecture

| Mục | Route/state | Dữ liệu chính |
|---|---|---|
| Jobs | `/` | Dashboard, search/filter/sort/page và lifecycle action |
| Upload | `/upload` | PDF selection, Processing Mode, Provider Profile, task/page scope, consent |
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

## Baseline đã có — chỉ bảo vệ, không rebuild

| Năng lực | Contract hiện tại cần giữ |
|---|---|
| Shell/routes | Jobs, Upload, Manage, Logs, Reports, Codes, job detail; Monitor là dialog |
| Dashboard | Search, filter provider/status, sort, pagination, URL query và bulk delete |
| Upload/lifecycle | Multi-PDF drag/drop, quota, task/page/profile/consent, start-once, cancel/rerun/delete |
| Review/correction | Viewer Fit/100%, scalar edit, suggestion Apply, original diff, conflict/draft/audit |
| Crop/partial result | Natural-pixel pointer/keyboard crop; page lỗi không che field/page tốt |
| Artifacts/events | Manifest/download typed, Safe Events sanitized; missing cục bộ không crash |
| Codes/Monitor | `_codes.json` revision-safe; allowlisted CPU/RAM/disk/runtime/GPU/operation metrics |
| VI/EN/a11y/responsive | Vietnamese mặc định, language persistence, semantic/keyboard/reduced-motion, ba viewport |
| Schema/data | Generated OpenAPI types, durable reload và đọc job cũ không rewrite |

Frontend hiện dùng durable state, correction conflict, API typing, accessibility
và data safety. Ưu tiên dữ liệu worker/contract trước CSS; không dựng lại baseline.

Route Upload giữ một card: bỏ tiêu đề lặp, đặt chọn tệp/thư mục thành hai action
nhỏ trong dropzone, biểu diễn profile duy nhất bằng trạng thái khóa do máy chủ
quản lý và tách consent bằng nền riêng. `vlm_max_pages` chỉ hiện cho
`metadata + auto`; focus keyboard vẫn nhìn thấy nhưng Bắt đầu OCR là CTA màu
chính duy nhất của form.

## Kế hoạch đang mở

Các bullet dưới đây là acceptance contract đã được bảo vệ local; phần còn mở
được ghi ngay trong trạng thái của từng mục và đều cần fixture/runtime bên ngoài.

### FE-X1

**Task/page input — LOCAL COMPLETE; LIVE REPRO PENDING.** Counterpart: [`BE-X1`](implementation_plan.md#be-x1).

- Giữ control Provider Profile, `metadata|full_ocr`, page scope và max pages hiện
  có; `full_ocr` khóa `all`/max `0`, metadata cho các scope server công bố.
- Copy phải giải thích rõ metadata nhanh chỉ xử lý page plan, còn full OCR xử lý
  toàn bộ trang; không hứa “nhanh” khi profile không hỗ trợ. Lượt metadata của
  full OCR vẫn dùng ảnh trực tiếp; browser không gửi hoặc hiển thị transcription
  như context của provider.
- Với văn bản hành chính, `metadata + auto` xử lý metadata đầu văn bản ở trang
  đầu rồi tìm nhóm chữ ký từ cuối về đầu và dừng khi đủ chức vụ + người ký;
  `max_pages` là trần số trang candidate. `all` và `first,last` giữ nghĩa literal.
- Job detail phân biệt tổng **trang PDF** với số trang provider thực sự xử lý
  (`2/5 trang metadata` cho `first,last`) và đánh dấu page `skipped` trong navigation.
- Browser chỉ gửi `provider_profile_id`, task/pages/max-pages và consent; không
  gửi URL/key/header/model tùy ý.
- E2E phải chứng minh payload đúng và kết quả live hiển thị selected pages/status
  do backend trả, không chỉ kiểm tra dropdown đã đổi state.
- Giữ selection khi create/upload/start thất bại để người dùng retry.

Browser eager-task/fake-provider là local contract evidence. Kết quả từ
`63-btc.pdf`/provider production-like vẫn là external evidence, không được gộp
vào nhãn `PASS LOCAL CONTRACT`.

### Contract local đã hoàn tất — REGRESSION ONLY

<a id="fe-x2"></a><a id="fe-x3"></a><a id="fe-x4"></a><a id="fe-x6"></a><a id="fe-x8"></a><a id="fe-x9"></a><a id="fe-x10"></a><a id="fe-x11"></a><a id="fe-x12"></a><a id="fe-x13"></a><a id="fe-x15"></a>

`FE-X2`–`FE-X4`, `FE-X6`, `FE-X8`–`FE-X13` và `FE-X15` đã hoàn tất về
logic/workflow và được bảo vệ bởi bộ local checks bắt buộc. Chi tiết triển khai
đã hoàn thành thuộc Git history; regression checklist bên dưới vẫn là điều
kiện bảo vệ.

### FE-X5

**Browser strong-server acceptance — BLOCKED bởi P0, evidence PENDING.** Counterpart:
[`BE-X5`](implementation_plan.md#be-x5).

Sau khi `X1`–`X4` vẫn pass và `X7`–`X11`/`X16` pass local, dùng browser qua Nginx
`:52409` để chạy bốn fixture,
kiểm tra upload trên 1 MiB, task/page results, partial warning, review/correction/
approval/crop, artifacts/report, rerun/delete và reload sau restart. Ghi toàn bộ
evidence vào [`BE-C-EVIDENCE`](implementation_plan.md#be-c-evidence); không tạo
evidence ledger thứ hai ở frontend.

### FE-X7

**P0 — Field evidence tối thiểu cho job mới — LOCAL COMPLETE; LIVE EVIDENCE PENDING.** Counterpart:
[`BE-X7`](implementation_plan.md#be-x7).

Provenance, trạng thái unavailable và native evidence dialog đã pass local;
fixture/provider/restart thật vẫn thuộc gate còn mở của `BE-X7`.

Generated field contract không còn `unknown` cho scalar suggestion hoặc hai danh
sách suggestion/evidence; workspace hiển thị source, confidence và reason đã persist.

- Field card render source/page/confidence, typed review reason, suggestion +
  provenance và page-level `evidence_url`; thiếu dữ liệu hiển thị unavailable
  kèm lý do an toàn đã dịch (`bbox_missing`, `bbox_invalid`, `crop_blank`).
- Mọi field có bbox hợp lệ, không gần như trắng dùng thumbnail crop evidence do worker tạo và mở
  native `<dialog>` Fit/100%; client không tự crop và không dùng bbox làm seed
  cho Manual crop. `validation_warning` từ `value/source_text` hoặc đối chiếu
  full-OCR cục bộ phải hiển
  thị trạng thái cần rà soát và không được có crop gây hiểu nhầm.
- Chỉ hiện “OCR gốc/Giá trị mới” khi field thật sự có correction; `ocr_value=null`
  mặc định của field chưa sửa không được tạo diff giả.
- Job mới từ fixture phải có cùng UX evidence như job legacy có data tương ứng;
  artifact thiếu chỉ làm block cục bộ unavailable.
- Chưa thêm debug timeline, retry variants, layout/result side-by-side hoặc
  paper-like preview cho tới khi backend persist dữ liệu thật và fixture cần.

### FE-X14

**P1 — Benchmark tương thích — LIVE SAMPLE PENDING.** Counterpart:
[`BE-X14`](implementation_plan.md#be-x14).

- Ẩn benchmark card khi không có compatible sample; thay JSON raw bằng bảng nhỏ
  typed. Report group theo Provider Profile và chỉ hiển thị persisted timing,
  success/failure, quality/evidence coverage thật.
- Thêm download corrected JSON sau approval. Overview và Report không được là hai
  tab trùng nhau; nếu chưa có report/export riêng thì bỏ tab Report và giữ
  Overview + Artifacts.
- Gate: unavailable không hiện `0%`/empty benchmark giả, fingerprint khác nhau
  không bị so sánh và export tải/reload được.

Đã hoàn thành local: report typed theo Provider Profile, benchmark unavailable
được ẩn, corrected JSON xuất hiện trong Artifacts sau reload và tab Report trùng
lặp đã bỏ. Benchmark có fingerprint thật còn theo
[`incomlpeted.md`](incomlpeted.md).

### FE-X16

**P0 — Source PDF, Bìa và logical-document workflow — LOCAL COMPLETE; LIVE EVIDENCE PENDING.** Counterpart:
[`BE-X16`](implementation_plan.md#be-x16).

- Upload có ba Processing Mode với `administrative_document` mặc định. Browser
  không auto-detect; `combined_dossier` giải thích nhiều PDF được sắp theo tên,
  PDF đầu là Bìa và mỗi PDF sau là một văn bản; một PDF gộp mới cần provider
  segmentation theo trang. Vẫn cho chọn `metadata|full_ocr` theo capability.
- Trong Job Detail, render cây source PDF → Bìa → văn bản, source-page viewer và
  danh sách segment theo thứ tự. Dùng native action “Tách trước trang này”, “Gộp
  với phần trước”, đổi type, Exclude/Restore; không drag-and-drop.
- Reviewer xác nhận từng source PDF kèm revision. Inline validation từng source
  chặn gap, overlap hoặc còn `unclassified`; backend kiểm tra toàn job có đúng
  một Bìa và ít nhất một văn bản khi xác nhận source cuối. Conflict
  `409 segmentation_conflict` giữ local draft và cho reload/discard.
- Với nhiều source, “Xác nhận tất cả PDF” gọi tuần tự endpoint revision hiện có
  cho mọi source hợp lệ chưa xác nhận; không thêm bulk API hoặc bỏ qua conflict.
  Selector nhiều source chỉ có Bìa/Văn bản. Một source có thể chọn Excluded cho
  trang trắng/phân cách; Unclassified chỉ hiện như trạng thái bắt buộc sửa.
- Sau khi mọi source confirmed, happy path tiếp tục OCR; provider unavailable giữ
  durable `segmentation_confirmed` và hiện action Continue. State chờ sống qua
  reload/restart; Cancel chuyển terminal rồi mới cho Delete.
- Mỗi page hiển thị `page_index` trong logical document và
  `source_page_index` trong PDF khi khác nhau. Excluded page vẫn visible/audited;
  frontend dùng field-evidence crop do worker persist dưới đúng logical document,
  không tự tính crop hoặc bbox.
- P0 chỉ yêu cầu tree/segmentation/review trong Job Detail. Global Manage triage,
  cross-job dossier filter và artifact explorer nâng cao vẫn thuộc `FE-X13` P1.
- Gate: fixture rõ proposal khớp ground truth; fixture khó sửa được boundary bằng
  pointer/keyboard-safe UI rồi extraction, missing-field correction và approval
  độc lập sống qua reload.

Upload đã có ba mode; Job Detail đã có source thumbnails, segment list, đổi type,
tách/gộp native tại boundary bất kỳ, inline validation, confirm theo revision và
Continue. Focused mocked-browser flow đã pass cả invalid draft, conflict giữ draft,
revision mới và Continue. Conflict reload/discard đã có UX giữ draft hoặc tải bản server mới.
Vẫn cần fixture thật, evidence cho boundary khó và review/approval độc lập trước
khi đóng.

## Thứ tự triển khai parity

0. **Fixture-first:** khóa composition manifest/page ranges trước khi xây UI.
1. **Tính đúng:** `FE-X16` → `FE-X8` → `FE-X7` → `FE-X9` → `FE-X10` →
   `FE-X11`, mỗi mục đi cùng backend counterpart và generated contract.
2. **Vận hành:** `FE-X12` → `FE-X13` sau khi backend persist dữ liệu.
3. **Workspace:** phần evidence/artifact/URL/visual utility của `FE-X13`/`FE-X15`.
4. **Đo lường:** `FE-X14` chỉ còn benchmark từ sample live; corrected export
   không chặn Milestone C.

## Public-data mapping cần bảo vệ

| UI block | Public source |
|---|---|
| Dashboard | `GET /api/state` |
| Provider configuration | `GET /api/provider-profiles`, engine readiness endpoint |
| Upload | limits, `processing_mode` và create/upload/start endpoints |
| Segmentation | `source_pdfs[]`, per-source confirm, `/continue` và revision conflict |
| Lifecycle action | cancel, typed rerun mode, delete-preview và bulk-delete |
| Review | `GET /api/jobs/{id}` và `/corrections`: expected fields, evidence, blocker/risk |
| Crop | page artifact và `/manual-crop` |
| Manage | `GET /api/documents`: triage aggregate và deep-link target |
| Artifacts | `GET /api/jobs/{id}/artifacts` |
| Progress/failure | persisted job snapshot từ `GET /api/state` và `GET /api/jobs/{id}` |
| Logs/timeline | `GET /api/events`, durable safe events |
| Reports/export | `GET /api/reports` và corrected artifact URL |
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
| Evidence/missing field/approval/rerun/readiness | `X7`–`X11` LOCAL COMPLETE; `X7` LIVE PENDING | Nhóm P0 giữ focused/local pass; X7 còn fixture |
| Segmentation/Bìa/logical documents | `X16` LOCAL COMPLETE; LIVE PENDING | Bốn fixture, confirm/restart/review và legacy read pass |
| Progress/timeline/triage | PASS LOCAL `X12`–`X13` | Persisted counters/failure/timeline, backend triage, deep-link và missing artifact pass |
| Report/export/URL | `X14` LOCAL COMPLETE; LIVE SAMPLE PENDING; `X15` PASS LOCAL | Benchmark fingerprint thật |
| Repair Gate baseline | PASS `X1`–`X4` | Các regression contract tiếp tục pass |
| Milestone C internal pilot | BLOCKED `X5` | P0 pass và strong-server evidence ledger được ký |

Không dùng lại con số `18/19` cho trạng thái hiện tại cho đến khi các gate còn lại
đã pass. Repair Gate ngày 2026-07-22 là baseline được bảo vệ; lần kiểm tra lại
ngày 2026-07-24 có backend `49 passed`, browser `19 passed`, gồm task/page retry
và partial review, typecheck/build/OpenAPI/compile/diff đều pass.

## UI evidence hiện có

Các ảnh sanitized được giữ trong `docs/ui-parity/`:

| Ảnh | State/viewport |
|---|---|
| `dashboard.png` | Dashboard, 1440×900 |
| `dashboard-1366x768.png` | Dashboard, 1366×768 |
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
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
python -m compileall -q backend/app
git diff --check
```

Frontend chỉ đạt Milestone C **internal production-like pilot** khi Repair Gate vẫn
pass, nhóm P0 `FE-X7`–`FE-X11`/`FE-X16` và counterpart backend pass,
`BE-C-EVIDENCE` được ký bằng runtime thật.
Không gọi đây là customer-production-ready; các gate live còn lại được liệt kê
trong `incomlpeted.md`.
