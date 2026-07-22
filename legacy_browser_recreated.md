# Kế hoạch frontend Legacy+ Browser

Đây là nguồn chuẩn duy nhất cho frontend Next.js, workflow người dùng, visual
parity và browser evidence. Backend contract, worker, cutover và Milestone C nằm
trong [`implementation_plan.md`](implementation_plan.md).

**Trạng thái 2026-07-22:** Repair Gate `FE-X1`–`FE-X3` và counterpart backend đã
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
| `FE-X6` | [`BE-X6`](implementation_plan.md#be-x6) | Không port ZIP/ảnh/folder và kiến trúc cũ |
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

Upload vẫn PDF-only, tối đa 15 file/job, 200 MiB/job và 100 trang/PDF. ZIP, ảnh,
folder/directory tree và mutable local-only PDF nằm ngoài parity plan tại `FE-X6`.

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
| Schema/data | Generated OpenAPI types, durable reload, two-way legacy readability và rollback |

Legacy+ hiện tốt hơn browser cũ về durability, correction conflict, API typing,
accessibility và data safety. Vì vậy ưu tiên dữ liệu worker/contract trước CSS;
không gọi những baseline trên là gap hoặc dựng lại UI lần nữa.

## Kế hoạch đang mở

### FE-X1

**Task/page input — PASS LOCAL 2026-07-22.** Counterpart: [`BE-X1`](implementation_plan.md#be-x1).

- Giữ control Provider Profile, `metadata|full_ocr`, page scope và max pages hiện
  có; `full_ocr` khóa `all`/max `0`, metadata cho các scope server công bố.
- Copy phải giải thích rõ metadata nhanh chỉ xử lý page plan, còn full OCR xử lý
  toàn bộ trang; không hứa “nhanh” khi profile không hỗ trợ.
- Job detail phân biệt tổng **trang PDF** với số trang provider thực sự xử lý
  (`2/5 trang metadata` cho `first,last`) và đánh dấu page `skipped` trong navigation.
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

**Browser strong-server acceptance — BLOCKED bởi P0, evidence PENDING.** Counterpart:
[`BE-X5`](implementation_plan.md#be-x5).

Sau khi `X1`–`X4` vẫn pass và `X7`–`X11`/`X16` pass local, dùng browser qua Nginx
`:52409` để chạy bốn fixture,
kiểm tra upload trên 1 MiB, task/page results, partial warning, review/correction/
approval/crop, artifacts/report, rerun/delete và reload sau restart. Ghi toàn bộ
evidence vào [`BE-C-EVIDENCE`](implementation_plan.md#be-c-evidence); không tạo
evidence ledger thứ hai ở frontend.

### FE-X6

**Biên parity — OUT OF SCOPE, PROTECT.** Counterpart:
[`BE-X6`](implementation_plan.md#be-x6).

Không thêm ZIP/ảnh/folder picker, directory tree, client-side mutable PDF,
client-side quality aggregate, raw diagnostics, UI kit, state manager hoặc chức
năng chỉ tồn tại trong state browser. Giữ PDF picker/drag-drop và API durable hiện
có. Mọi thay đổi phạm vi cần yêu cầu riêng, không được lẫn vào parity work.

Reference cũ: `OCR_paper/Web/src/app.js:1724-1747,3111-3133,3492-3503`.

### FE-X7

**P0 — Field evidence tối thiểu cho job mới — IN PROGRESS 2026-07-22.** Counterpart:
[`BE-X7`](implementation_plan.md#be-x7).

Provenance, trạng thái unavailable và native evidence dialog đã pass local;
fixture/provider/restart thật vẫn thuộc gate còn mở của `BE-X7`.

- Field card render source/page/confidence, typed review reason, suggestion +
  provenance và page-level `evidence_url`; thiếu dữ liệu hiển thị unavailable.
- Chọn thumbnail mở native `<dialog>` Fit/100% và tải image; không dùng OCR `bbox`
  làm crop seed hoặc tự dựng crop trên client.
- Job mới từ fixture phải có cùng UX evidence như job legacy có data tương ứng;
  artifact thiếu chỉ làm block cục bộ unavailable.
- Chưa thêm debug timeline, retry variants, layout/result side-by-side hoặc
  paper-like preview cho tới khi backend persist dữ liệu thật và fixture cần.

Reference cũ: `OCR_paper/Web/src/app.js:1960-2255`.

### FE-X8

**P0 — Expected/missing field workflow — PASS LOCAL 2026-07-22.** Counterpart:
[`BE-X8`](implementation_plan.md#be-x8).

- Render ordered `expected_fields`/`required_fields` từ public contract,
  kể cả field provider bỏ sót; dùng “Chưa nhận dạng” và input scalar trống.
- Hai schema là văn bản hành chính 11 field và Bìa 13 field. Browser không dùng
  `fields.document_type` legacy để suy `logical_document_type` hoặc hard-code
  field order; unknown/non-scalar legacy field vẫn visible read-only.
- Gửi missing field với `old_value=null`; giữ draft/conflict/discard guard và copy
  **Lưu và duyệt**. Unknown/non-scalar legacy field vẫn visible read-only.
- Gate: reviewer thêm `ngay_ban_hanh`/`nguoi_ky` hoặc field bìa bị thiếu, reload
  thấy audit/value; không cần sửa JSON thủ công.

Reference cũ: `OCR_paper/Web/src/app.js:547-575,2363-2388`.

### FE-X9

**P0 — Approval blocker/risk UX — PASS LOCAL 2026-07-22.** Counterpart:
[`BE-X9`](implementation_plan.md#be-x9).

- Hiển thị blocker/risk typed `{code, field?, page_index?}` cạnh action. **Lưu và duyệt** là atomic:
  khi backend trả blocker, giữ draft và không hiển thị correction đã lưu/approved;
  chỉ clear draft khi response xác nhận approved.
- Warning mềm không vô hiệu hóa nút; page warning/partial result tiếp tục render
  theo `FE-X2`. Client không suy ra blocker từ confidence/page đang mở.
- Cho approve độc lập từng logical document; dossier chỉ approved khi Bìa và mọi
  văn bản con approved, nếu chưa đủ hiển thị `partially_approved`.
- Gate: blocker giải thích được vì sao chưa duyệt; sửa blocker rồi submit lại mới
  approved; approve không correction vẫn được khi blocker rỗng.

### FE-X10

**P0 — Rerun snapshot minh bạch — PASS LOCAL 2026-07-22.** Counterpart:
[`BE-X10`](implementation_plan.md#be-x10).

- Dialog rerun hiển thị read-only Processing Mode, Provider Profile, task, page
  scope và max-pages sẽ được giữ; consent external vẫn explicit.
- Hai action explicit cho combined job: reuse segmentation đã xác nhận rồi confirm
  lại, hoặc tạo job mới và phân đoạn lại. Không cho đổi mode/engine/task; nếu
  source profile unavailable, hiển thị safe conflict và giữ nguyên source job.
- Gate: rerun `metadata/first,last` và `full_ocr/all` dẫn đến job mới hiển thị đúng
  config nguồn, không đổi phạm vi/chi phí ngầm.

Dialog snapshot, hai mode reuse/resegment và safe conflict profile đã pass
focused browser gate.

### FE-X11

**P0/P1 — Provider readiness trung thực — PASS LOCAL 2026-07-22.** Counterpart:
[`BE-X11`](implementation_plan.md#be-x11).

- Với một profile, đổi copy/dropdown gây hiểu nhầm thành “Cấu hình OCR hiện tại”.
  Chỉ render selector khi API thật sự trả nhiều profile.
- Nút kiểm tra phân biệt configured, reachable, ready và safe failure; không hứa
  engine hoạt động chỉ vì settings có giá trị, không hiện URL/model/key/raw reply.
- Capability điều khiển Processing Mode/task/page input. Configured profile được
  create/upload; readiness chỉ chặn Start/Continue và không làm mất job/draft.

UI một profile dùng copy “Cấu hình OCR hiện tại”, readiness hiển thị safe status
và capability điều khiển các lựa chọn; focused browser gate đã pass.

### FE-X12

**P1 — Dashboard progress, failure recovery và operation timeline — PASS LOCAL
2026-07-22; X16 kéo progress/audit tối thiểu vào P0.**
Counterpart: [`BE-X12`](implementation_plan.md#be-x12).

- P0 chỉ hiển thị native progress từ persisted
  `segmentation_completed_pages/segmentation_total_pages` và trạng thái hiện tại;
  không ETA/fake percent hoặc timeline UI đầy đủ.

- Running job hiển thị stage, completed/total và progress bar chỉ khi backend trả
  counters; không nội suy từ polling hoặc fake percent.
- Failure card hiển thị safe code/operator hint, action retry/rerun theo
  `retryable`, mở Logs và copy diagnostics allowlisted: job ID, code, timestamp,
  profile ID, page index.
- Logs thêm filter `code`; job detail render timeline human-readable. JSON download
  vẫn có cho diagnostics nhưng không dùng JSON `<pre>` làm UI chính.
- Gate: timeline/progress còn đúng sau reload/restart, terminal dừng polling và
  job detail cũng dừng interval khi tab hidden.

Reference cũ: `OCR_paper/Web/src/app.js:1495-1532,2529-2587`.

### FE-X13

**P1 — Manage triage, field context và artifact explorer — PASS LOCAL 2026-07-22.** Counterpart:
[`BE-X13`](implementation_plan.md#be-x13).

- Manage có quick filter/count cho blocker/risk, low confidence, suggestion và
  manual crop; deep-link đúng job/document/page/field đầu tiên cần review.
- Khi chọn field, đồng bộ page và evidence thumbnail; artifact group theo
  document/page/field/kind, image có preview native dialog, non-image giữ download.
- Không tính risk/count client-side từ page hiện tại. Debug timeline/retry variants
  và paper-like overview là P2 có dữ liệu, không phải gate của mục này.
- Gate: mọi quick filter dùng aggregate typed, refresh giữ target và artifact
  missing không làm sập workspace.

Reference cũ: `OCR_paper/Web/src/app.js:1893-2255`.

### FE-X14

**P1/P2 — Reports, benchmark và corrected export — PARTIAL LOCAL 2026-07-22.** Counterpart:
[`BE-X14`](implementation_plan.md#be-x14).

- Ẩn benchmark card khi không có compatible sample; thay JSON raw bằng bảng nhỏ
  typed. Report group theo Provider Profile và chỉ hiển thị persisted timing,
  success/failure, quality/evidence coverage thật.
- Thêm download corrected JSON sau approval. Overview và Report không được là hai
  tab trùng nhau; nếu chưa có report/export riêng thì bỏ tab Report và giữ
  Overview + Artifacts.
- Field-quality sâu, resource drilldown và HTML/PDF offline report là P2, chỉ mở
  khi có workflow đo lường/bàn giao thật.
- Gate: unavailable không hiện `0%`/empty benchmark giả, fingerprint khác nhau
  không bị so sánh và export tải/reload được.

Đã hoàn thành local: report typed theo Provider Profile, benchmark unavailable
được ẩn, corrected JSON xuất hiện trong Artifacts sau reload và tab Report trùng
lặp đã bỏ. Benchmark có fingerprint thật còn theo
[`incomlpeted.md`](incomlpeted.md).

Reference cũ: `OCR_paper/Web/src/app.js:1440-1475,2655-2837`.

### FE-X15

**P2 — URL state, visual density và utility native — PASS LOCAL 2026-07-22 cho phạm vi có dữ liệu.**
Counterpart: [`BE-X15`](implementation_plan.md#be-x15).

- Persist `view`, document, selected page và selected field trong URL; refresh,
  back/forward khôi phục đúng. System Monitor dùng deep-linkable query state.
- Thêm previous/next/direct jump cho PDF dài; polling dừng khi tab hidden. Giữ
  dirty guard khi URL navigation đổi review target.
- Sau khi có dữ liệu thật: thu gọn bảy dashboard metric thành bốn metric vận hành
  chính, giảm whitespace/H1 tại 1366×768, group artifact/report nhất quán. Không
  copy CSS cũ hoặc lấy số dòng CSS làm mục tiêu.
- Hoàn thiện VI/EN cho `pages/min`, `Runtime`, `physical`, `OCR operations`, Code
  group IDs và `prompt`; giữ ID kỹ thuật khi cần kèm label dịch được.
- Utility không dependency: Ctrl/Cmd+S và Enter chỉ lưu đúng ngữ cảnh, Esc cancel,
  copy job ID, select-all terminal jobs trên page; log download/dashboard và
  delete `total_bytes` chỉ thêm khi operator xác nhận cần. Không để Enter textarea
  submit ngoài ý muốn.

Đã hoàn thành local bằng browser API/native controls: URL giữ view/document/page/
field, monitor deep-link, previous/next/direct jump, dirty guard, Ctrl/Cmd+S,
copy ID, select-all terminal và VI/EN kỹ thuật. Density/data-driven polish và
utility cần operator xác nhận được liệt kê trong [`incomlpeted.md`](incomlpeted.md).

### FE-X16

**P0 — Source PDF, Bìa và logical-document workflow — IN PROGRESS 2026-07-22.** Counterpart:
[`BE-X16`](implementation_plan.md#be-x16).

- Upload có ba Processing Mode với `administrative_document` mặc định. Browser
  không auto-detect; `combined_dossier` giải thích mọi trang sẽ được segmentation
  trước extraction và vẫn cho chọn `metadata|full_ocr` theo capability.
- Trong Job Detail, render cây source PDF → Bìa → văn bản, source-page viewer và
  danh sách segment theo thứ tự. Dùng native action “Tách trước trang này”, “Gộp
  với phần trước”, đổi type, Exclude/Restore; không drag-and-drop.
- Reviewer xác nhận từng source PDF kèm revision. Inline validation chặn gap,
  overlap, thiếu đúng một Bìa, thiếu văn bản, hoặc còn `unclassified`; conflict
  `409 segmentation_conflict` giữ local draft và cho reload/discard.
- Sau khi mọi source confirmed, happy path tiếp tục OCR; provider unavailable giữ
  durable `segmentation_confirmed` và hiện action Continue. State chờ sống qua
  reload/restart; Cancel chuyển terminal rồi mới cho Delete.
- Mỗi page hiển thị `page_index` trong logical document và
  `source_page_index` trong PDF khi khác nhau. Excluded page vẫn visible/audited;
  evidence dùng page artifact, không tự crop từ OCR `bbox`.
- P0 chỉ yêu cầu tree/segmentation/review trong Job Detail. Global Manage triage,
  cross-job dossier filter và artifact explorer nâng cao vẫn thuộc `FE-X13` P1.
- Gate: fixture rõ proposal khớp ground truth; fixture khó sửa được boundary bằng
  pointer/keyboard-safe UI rồi extraction, missing-field correction và approval
  độc lập sống qua reload.

Reference cũ: `OCR_paper/Web/src/app.js:588-617,1987-1996,2489-2503`.

Upload đã có ba mode; Job Detail đã có source thumbnails, segment list, đổi type,
tách/gộp native, confirm theo revision và Continue. Focused mocked-browser flow
đã pass. Conflict reload/discard đã có UX giữ draft hoặc tải bản server mới.
Vẫn cần fixture thật, evidence cho boundary khó và review/approval độc lập trước
khi đóng.

## Thứ tự triển khai parity

0. **Fixture-first:** khóa composition manifest/page ranges trước khi xây UI.
1. **Tính đúng:** `FE-X16` → `FE-X8` → `FE-X7` → `FE-X9` → `FE-X10` →
   `FE-X11`, mỗi mục đi cùng backend counterpart và generated contract.
2. **Vận hành:** `FE-X12` → `FE-X13` sau khi backend persist dữ liệu.
3. **Workspace:** phần evidence/artifact/URL/visual utility của `FE-X13`/`FE-X15`.
4. **Đo lường có nhu cầu:** `FE-X14` P1/P2; corrected export không chặn
   Milestone C.

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
| Evidence/missing field/approval/rerun/readiness | `X8`–`X11` PASS LOCAL; `X7` IN PROGRESS | Nhóm P0 pass focused/local và fixture |
| Segmentation/Bìa/logical documents | IN PROGRESS P0 `X16` | Bốn fixture, confirm/restart/review và legacy read pass |
| Progress/timeline/triage | PASS LOCAL `X12`–`X13` | Persisted counters/failure/timeline, backend triage, deep-link và missing artifact pass |
| Report/export/URL/polish | `X14` PARTIAL LOCAL; `X15` PASS LOCAL | Benchmark fingerprint thật; data-driven polish chỉ mở khi operator yêu cầu |
| Repair Gate baseline | PASS `X1`–`X4` | Các regression contract tiếp tục pass |
| Milestone C internal pilot | BLOCKED `X5` | P0 pass và strong-server evidence ledger được ký |

Không dùng lại con số `18/19` cho trạng thái hiện tại cho đến khi các gate còn lại
đã pass. Repair Gate ngày 2026-07-22 là baseline hiện hành: backend `28 passed`;
suite mở rộng hiện tại `39 passed`,
legacy compatibility `10 passed`, browser `17 passed`, `1 skipped`, gồm task/page retry
và partial review, typecheck/build/OpenAPI/compile/diff đều pass.

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

Legacy+ chỉ đạt Milestone C **internal production-like pilot** khi Repair Gate vẫn
pass, nhóm P0 `FE-X7`–`FE-X11`/`FE-X16` và counterpart backend pass,
`BE-C-EVIDENCE` được ký bằng runtime thật, và cửa sổ rollback một ngày kết thúc.
Không gọi đây là customer-production-ready; phần P1/P2 còn lại được liệt kê trong
`incomlpeted.md` và không xóa legacy runtime trong kế hoạch frontend.
