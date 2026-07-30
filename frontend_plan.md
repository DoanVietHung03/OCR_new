# Kế hoạch frontend Next.js

Đây là nguồn chuẩn duy nhất cho frontend Next.js, workflow người dùng, visual
parity và browser evidence. Backend contract, worker, cutover và Milestone C nằm
trong [`implementation_plan.md`](implementation_plan.md). Riêng nội dung chi
tiết của `FE-X18` thuộc [`User_guide.md`](User_guide.md); file này chỉ sở hữu
status, gate và backlink của mục đó.

**Trạng thái kiểm tra lại 2026-07-24:** Repair Gate `FE-X1`–`FE-X3` và counterpart backend đã
pass local. `FE-X8`–`FE-X13` và phạm vi local của `FE-X15` đã pass; `FE-X14` còn
chờ benchmark fingerprint. `FE-X7`/`FE-X16` còn chờ bốn fixture và restart thật.
Phần local của `FE-X17A`–`FE-X17E` đã triển khai; Preview/provider/fixture thật
và capacity evidence vẫn mở tại `FE-X17F`. Chi tiết nằm tại
[`Token_Cal.md`](Token_Cal.md). Các external gate của Milestone C nằm tại
[`incomlpeted.md`](incomlpeted.md).

**User guide 2026-07-28:** scope `FE-X18` đã khóa nhưng chưa triển khai. Đặc tả
chi tiết nằm tại [`User_guide.md`](User_guide.md); backend counterpart
[`BE-X18`](implementation_plan.md#be-x18) là `N/A`.

**Simple Auth 2026-07-28:** `FE-X19`/`BE-X19` đã triển khai và pass local gate;
live Nginx/direct-port/full OCR smoke còn mở. Shared login dùng một credential,
giữ HTTP/IP/port đã chốt và không thêm identity/role. Đặc tả chi tiết nằm tại
[`Simple_Auth.md`](Simple_Auth.md).

**Sidebar re-decoration 2026-07-28:** information architecture mới đã triển khai
và hoàn thành local gate: `62` backend tests, `24` browser checks, typecheck,
production build, OpenAPI generation/check, compileall và diff check đều pass.
Phạm vi và acceptance nằm tại
[`Sidebar re-decoration`](#sidebar-re-decoration), backend counterpart nằm trong
[`implementation_plan.md`](implementation_plan.md#sidebar-re-decoration-backend).

**Reliability recheck 2026-07-27:** backend `61 passed`, browser `21 passed`,
typecheck/build/OpenAPI/compile/diff đều pass. Thay đổi retry là nội bộ backend,
không đổi public API hay frontend contract; fixture/provider/server evidence
vẫn còn mở.

Semantic hardening cùng ngày không đổi public schema: backend retry một header
response rỗng trong budget hiện có, và UI nhận `completed_with_warnings` khi
required-field blocker vẫn tồn tại thay vì hiển thị clean `completed`.
Milestone C là internal production-like pilot; live evidence vẫn
ghi duy nhất trong `BE-C-EVIDENCE`.

## Cách dùng hai kế hoạch

- Frontend sở hữu route, input, copy, rendering, interaction, accessibility và
  visual evidence; backend sở hữu schema, persistence và execution semantics.
- Mỗi mục `FE-X1`–`FE-X19` link thẳng tới counterpart backend. Chỉ đánh dấu hoàn thành khi hai phía
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
| `FE-X17` | [`BE-X17`](implementation_plan.md#be-x17) | Measurement Preview dùng dữ liệu thật; chart/calculator tuân sample gate |
| `FE-X18` | [`BE-X18`](implementation_plan.md#be-x18) | Workflow guide và parameter reference VI/EN khớp UI, không thêm backend |
| `FE-X19` | [`BE-X19`](implementation_plan.md#be-x19) | Login/logout/returnTo/expiry giữ draft; toàn protected surface qua auth seam |

## Phạm vi và nguồn chuẩn

Thứ tự ưu tiên khi có mâu thuẫn:

1. Invariant và public contract trong `implementation_plan.md`.
2. OpenAPI do FastAPI sinh.
3. File này cho workflow/visual frontend.
4. `User_guide.md` cho content/IA/acceptance chi tiết của `FE-X18`.
5. `Simple_Auth.md` cho shared-login content/session/acceptance của `FE-X19`.

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
| Hàng đợi rà soát | `/documents` | Document index xuyên job; mở từ CTA theo ngữ cảnh |
| Processing logs | `/logs` | Typed Safe Events trong nhóm Công cụ hệ thống |
| Tổng quan vận hành | `/reports` | Việc cần xử lý, chất lượng và hiệu suất thật hoặc unavailable |
| Code catalog | `/codes` | Durable Code Catalog trong nhóm Công cụ hệ thống |
| Sizing & Cost | `/sizing` | Measurement, token/cost, scenario, capacity và provenance |
| User guide (planned `FE-X18`) | `/guide`, `/guide/reference` | Workflow OCR và reference mọi tham số user-visible trong phạm vi V1 |
| Job detail | `/jobs/[id]?view=...` | Overview, review, artifacts, report và logs |
| System Monitor | Dialog/deep-linkable state | Safe telemetry backend nhìn thấy; mở từ Công cụ hệ thống |

Search/filter/sort/page, selected document/page và job tab phải khôi phục được
qua URL khi refresh/back/forward. Polling chỉ chạy khi job active hoặc monitor mở;
terminal dừng polling và stale refresh giữ snapshot gần nhất kèm cảnh báo.

<a id="sidebar-re-decoration"></a>
## Sidebar re-decoration

**LOCAL COMPLETE 2026-07-28.** Đây là scope mới của `FE-X14`/`FE-X15`; local
evidence riêng của scope gồm `62` backend tests, `24` browser checks, typecheck,
production build, OpenAPI generation/check, compileall và diff check. UI đã được
kiểm tra trực quan tại `1440×900` và `390×844`; regression check khóa layout
`1366×768`, mobile no-overflow, disclosure/menu và exact deep-link.
Backend counterpart:
[`Sidebar re-decoration — backend counterpart`](implementation_plan.md#sidebar-re-decoration-backend).

### Navigation

- Sidebar chính luôn hiện đúng thứ tự: `Jobs`, `New OCR`,
  `Tổng quan vận hành`, `Sizing & Cost`.
- Khi `FE-X18` được triển khai, thêm `Hướng dẫn sử dụng` / `User guide` ngay sau
  `Sizing & Cost`; thứ tự bốn mục hiện có không đổi.
- `Công cụ hệ thống` nằm cuối sidebar, mặc định thu gọn, không persist trạng thái
  vào `localStorage`; nhóm này chứa `Processing logs`, `Code catalog` và
  `System Monitor`. Nhóm nằm liền sau navigation chính, dùng chevron xoay để
  biểu thị trạng thái và được tách khỏi vùng điều khiển phiên ở đáy.
- Desktop có thể thu sidebar về rail `88px` nhưng không ẩn navigation. Nút trên
  đường biên dùng chevron trái/phải theo trạng thái, có tooltip/ARIA và hitbox
  `32px`. Navigation dùng SVG nét đơn giản thay vì glyph phụ thuộc font. Shared
  username chỉ là nhãn tài khoản dùng chung, không phải profile menu;
  language/logout nằm trong vùng phiên có divider riêng.
- Bỏ `Manage` khỏi sidebar nhưng giữ route `/documents` và toàn bộ API. Jobs và
  Tổng quan vận hành mở route này bằng CTA `Tài liệu cần rà soát (N)`.
- Đổi nhãn `/documents` thành `Hàng đợi rà soát` / `Review queue`;
  `/reports` thành `Tổng quan vận hành` / `Operations overview`; giữ nguyên
  `/reports`, `/documents`, `/logs`, `/codes` để không phá bookmark/deep-link.
- Mobile dùng cùng hierarchy; chọn route hoặc mở Monitor phải đóng menu.

### Tổng quan vận hành

- Header ghi rõ `Phạm vi: toàn bộ dữ liệu hiện còn được lưu`, thời điểm cập nhật
  gần nhất và action `Làm mới`; trang không polling.
- Thứ tự nội dung cố định:
  1. `Cần xử lý ngay`: tài liệu cần rà soát, job đang xử lý, lỗi và cảnh báo
     gần đây; mỗi thẻ có link riêng tới danh sách đã lọc.
  2. `Chất lượng OCR`: tỷ lệ tài liệu đã duyệt, evidence coverage, số field đã
     chỉnh sửa và số tài liệu có warning.
  3. `Hiệu suất`: thời gian trung bình, pages/minute và bảng so sánh theo
     Provider Profile.
- Benchmark không còn render tại `/reports`; route này dẫn người dùng sang
  `Sizing & Cost`. Chưa thêm chart hoặc time-range filter khi backend chưa có
  dữ liệu time-series/range thật.
- Tỷ lệ duyệt được tính từ `approved_documents / documents`; mẫu số bằng zero
  phải là unavailable, không phải `0%`.

### Data, CTA và URL state

- `/reports` gọi song song `GET /api/reports` và `GET /api/documents`; chỉ dùng
  `triage_counts` từ response document, không thêm field trùng vào
  `ReportsResponse`.
- CTA đã khóa:
  - cần rà soát → `/documents?triage=needs_review`;
  - job đang xử lý → `/?status=active`;
  - lỗi → `/logs?severity=error`;
  - cảnh báo → `/logs?severity=warning`.
- `/logs` phải đọc/ghi `severity`, `category`, `job_id`,
  `provider_profile_id`, `document_id`, `page_index` và `page` trong URL; refresh,
  back và forward khôi phục đúng filter.
- `active` là filter tổng hợp do backend định nghĩa, không phải job status được
  persist. Frontend không tự liệt kê hoặc suy đoán tập active states.

### Loading, error và responsive

- Chưa có job: hiển thị `Chưa có dữ liệu vận hành` cùng CTA `Tạo OCR mới`, không
  dựng lưới toàn số zero. Có dữ liệu nhưng không có việc khẩn cấp: hiển thị
  `Không có việc cần xử lý`.
- Report và triage có loading/error/retry độc lập. Refresh lỗi phải giữ dữ liệu
  gần nhất và gắn nhãn `Có thể đã cũ`; nullable/insufficient giữ `—` kèm lý do,
  không biến thành zero hay verdict giả.
- Desktop `1440×900`/`1366×768`: nhóm cần xử lý là một hàng thẻ; Chất lượng và
  Hiệu suất chia hai cột; bảng Provider Profile chiếm toàn chiều rộng bên dưới.
- Mobile `390×844`: mọi section thành một cột; bảng cuộn trong container và
  không làm trang overflow ngang.
- Card chỉ trình bày dữ liệu; CTA là link riêng có focus rõ. Nút Công cụ hệ thống
  dùng `aria-expanded`, thao tác được bằng bàn phím và không cần animation phức tạp.

### Acceptance

- Sidebar chính có năm mục sau `FE-X18`; nhóm Công cụ hệ thống mặc định đóng và
  không làm mất route/action hiện có.
- Collapse/expand giữ rail icon hoạt động, đổi đúng hướng chevron và không trộn
  navigation hệ thống với shared account/language/logout.
- Bốn CTA mở đúng URL và đúng dữ liệu đã lọc; reload/back/forward giữ state.
- Partial API failure không làm trắng trang; empty/stale/unavailable render đúng
  contract và không fabricate dữ liệu.
- VI/EN, keyboard/focus, `1440×900`, `1366×768`, `390×844`, typecheck, build,
  browser smoke, OpenAPI check và `git diff --check` đều pass.

## Visual và interaction invariant

- Giữ hierarchy/density đã chứng minh: sidebar tối, card/panel giàu thông tin,
  badge, bảng gọn và modal có phân cấp; token tập trung trong CSS.
- Chỉ dùng Next/React, CSS và native browser APIs; exception duy nhất là Apache
  ECharts được dynamic-import tại `/sizing`. Không UI kit, React chart wrapper
  hoặc state manager.
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
| Dashboard | Search/filter/sort/pagination/URL; metric 4 trạng thái + 3 khối lượng; progress chỉ cho job active; delete từng dòng trong menu phụ; bulk delete giữ confirmation |
| Upload/lifecycle | Multi-PDF drag/drop, quota, task/page/profile/consent, start-once, cancel/rerun/delete |
| Review/correction | Viewer Fit/100%, scalar edit, suggestion Apply, original diff, conflict/draft/audit |
| Crop/partial result | Natural-pixel pointer/keyboard crop; page lỗi không che field/page tốt |
| Artifacts/events | Manifest/download typed, Safe Events sanitized; missing cục bộ không crash |
| Codes/Monitor | `_codes.json` revision-safe; allowlisted CPU/RAM/disk/runtime/GPU/operation metrics |
| VI/EN/a11y/responsive | Vietnamese mặc định, language persistence, semantic/keyboard/reduced-motion, ba viewport |
| Schema/data | Generated OpenAPI types, durable reload và đọc job cũ không rewrite |

Frontend hiện dùng durable state, correction conflict, API typing, accessibility
và data safety. Ưu tiên dữ liệu worker/contract trước CSS; không dựng lại baseline.

Route Upload giữ một card: cho nhập tên công việc tùy chọn với fallback tương
thích `PDF đầu tiên +N`, đặt chọn tệp/thư mục thành hai action nhỏ trong
dropzone, biểu diễn profile duy nhất bằng trạng thái khóa do máy chủ quản lý và
tách consent bằng nền riêng. `vlm_max_pages` chỉ hiện cho
`metadata + auto`, nested cùng note ngay trong field-card Phạm vi trang; cả bốn
control cấu hình dùng cùng surface/padding và tự co theo nội dung, không kéo cao
cả hàng. Danh sách nhiều PDF có tổng số file/dung lượng, Clear all và vùng cuộn
giới hạn với hairline giữa các dòng. Focus keyboard vẫn nhìn thấy nhưng
Bắt đầu OCR là CTA màu chính duy nhất của form.

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
- Retry provider là reliability policy nội bộ của backend với tối đa hai attempt;
  browser không resubmit page/job và chỉ hiển thị page error sau khi attempt cuối
  thất bại. Header response rỗng cũng dùng budget này; nếu vẫn rỗng, UI phải phản
  ánh page error hoặc `completed_with_warnings` cùng blocker thật. Selection vẫn
  được giữ để operator có thể rerun theo workflow hiện có.
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
- Field có giá trị nhưng thiếu crop vẫn giữ nguyên giá trị, hiển thị risk và có
  action mở đúng toàn ảnh `page_index`; thiếu evidence không khóa Save and
  approve. Chỉ bbox hợp lệ hoặc Manual crop mới được hiển thị như crop evidence.
- Review workspace không thêm nút retry page hay debug variant; attempt thật đã
  persist thuộc Sizing/diagnostics, còn rerun job tiếp tục dùng workflow hiện có.
  Chưa thêm layout/result side-by-side hoặc paper-like preview cho tới khi fixture cần.

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
Scope `Sidebar re-decoration` đã `LOCAL COMPLETE 2026-07-28` bằng gate riêng:
sidebar bốn mục, System tools disclosure, actionable report, exact URL state,
partial failure, ba viewport, `62` backend tests và `24` browser checks.

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
- Trạng thái chờ review dùng badge và progress màu cảnh báo; lifecycle action nằm
  ngoài khối số liệu. Danh sách nhiều source có chiều cao giới hạn, dòng gọn và
  nút xác nhận từng PDF là secondary; Xác nhận tất cả là primary duy nhất.
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

### FE-X17

**P1 — Sizing & Cost — LOCAL COMPLETE; LIVE EVIDENCE PENDING.** Counterpart:
[`BE-X17`](implementation_plan.md#be-x17). Đặc tả chi tiết:
[`Token_Cal.md`](Token_Cal.md).

- Thêm permanent sidebar route `/sizing`, nhưng mở theo gate:
  Measurement Preview một PDF trước; comparison từ 2 job, phân tích chuỗi thời
  gian từ 5 job chỉ khi có bucket thời gian, P95/capacity screening từ 20
  compatible jobs. Chưa đủ mẫu hiện lý
  do, không chart/zero/verdict giả.
- Overview hiển thị page/document/job/system units, response usage coverage,
  billing certainty, known/unknown cost và provenance hai lớp: nguồn giá trị +
  chất lượng sample. Filter/view/timezone phải sống qua URL.
- Document Explorer chỉ tải tree aggregate; operation detail lazy-load và
  paginate tối đa 100. Segmentation không giả document ownership, readiness
  hiển thị system overhead riêng.
- Dùng generated types và backend-owned calculation. Browser chỉ gửi filter,
  scenario/profile IDs/assumptions; local calculation khi nhập mang nhãn
  `Preview`, không trở thành report chính thức.
- Dùng đúng một `echarts` dependency, direct dynamic import chỉ tại route này,
  tree-shaken components/renderer/ARIA. Không React wrapper. Comparison chart
  có tooltip/legend/series toggle và table HTML fallback; không dùng `dataZoom`
  để thay filter. Provider/task/mode/date và giới hạn 10/25/50 lọc
  `/sizing/jobs` từ backend; untrusted string không đi vào HTML formatter.
- Price Profile không yêu cầu user nhập usage. Exchange-rate suggestion chỉ lấy
  khi user bấm, hiển thị từng nguồn/loại/time/direct link và bắt xác nhận; không
  scrape Google, auto-average hoặc auto-update profile đã lưu.
- Price form có một action lấy đồng thời official model price và quote từ
  Provider Profile + exact model + exchange source; ID/giá/tỷ giá/provenance
  được điền từ Preview, read-only cho tới khi user xác nhận rồi mới lưu. Model
  chưa được allowlist giữ manual/unavailable, không đoán giá.
- Provider Profile hiển thị `MiniMax` cho job mới dùng `MiniMax-M3`; job lịch sử
  có ID `qwen` vẫn hiển thị và lọc theo snapshot đã lưu, không đổi nhãn hồi tố.
- Danh sách Price Profile đã lưu nằm ngay dưới form, hiển thị scope/hiệu lực và
  trạng thái; save refresh Overview/Jobs để Known cost không giữ snapshot cũ.
- Price form dùng native `datetime-local` cho ngày hiệu lực, mặc định hiện tại;
  thao tác lấy gợi ý giá không được đặt lại ngày giờ user đã chọn.
- Mỗi Price Profile đã lưu có action Archive/Restore; action cập nhật catalog và
  refresh Overview/Jobs, không thêm hard-delete.
- Workload form chỉ nhập monthly volume + operating days/hours, một Processing
  Mode, peak/reserve/SLA/success target/retention assumption. Combined dossier
  dùng dossier volume + document/page averages; không cho input ngày/tháng mâu
  thuẫn.
- Capacity UI tách service time, throughput, reliability và SLA. Theoretical
  capacity units luôn ghi unvalidated cho tới khi cluster benchmark thật; self-
  host cost chưa có TCO phải hiện unavailable, không `0`.
- Retention/snapshot action dùng Preview → Confirm, revision/checksum conflict.
  Preview phải render rõ operation/rollup count từ response và bị vô hiệu khi
  date/checkbox thay đổi; không chỉ đưa count vào nút Confirm.
  Saved snapshot immutable, archive/hard-delete rõ ràng, list paginated, quota
  1.000 × 256 KiB và cảnh báo 80%.
- Export CSV table, JSON snapshot/provenance, PNG chart và print stylesheet;
  luôn kèm filter/timezone/n/coverage/generated time.
- Accessibility giữ keyboard/focus/reduced-motion, table fallback và semantic
  status; route pass `1440×900`, `1366×768`, không overflow `390×844`.

Frontend gate chỉ pass khi one-PDF Preview dùng provider measurement thật,
aggregate khớp sidecar và unavailable/insufficient/partial cost hiển thị đúng.
Bốn fixture chỉ là reproducible baseline; full capacity screening vẫn cần
20-job/coverage gate. `FE-X17` không thay thế `FE-X14` hoặc block Milestone C
hiện tại.

Đã hoàn tất phần local của `/sizing`: URL-persisted filters, Overview,
Document Explorer lazy/paginated, ECharts dynamic import + table fallback,
catalogs/calculator backend-owned, snapshot, retention Preview → Confirm và
CSV/JSON/PNG/print export. UI gate `1/2/5/20` không dựng chart, zero hay verdict
giả khi thiếu dữ liệu. Preview trên PDF/provider thật và full capacity screening
vẫn mở tại `X17F`.

Biểu đồ comparison chỉ giữ stacked bar `Prompt` + `Completion` theo job. Đã bỏ
đường `Total trend`, scatter gắn nhãn sai `Tokens / attempts` và distribution
chung mặt phẳng. `Token / attempt có usage` là metric riêng, dùng đúng
`complete_usage_attempts`; trend chỉ có nghĩa trên trục thời gian, không nối Job ID.

### FE-X18

**P1 — User guide và parameter reference — IMPLEMENTED; FULL GATE PENDING.**
Counterpart: [`BE-X18`](implementation_plan.md#be-x18) (`N/A`). Đặc tả chi tiết
và acceptance duy nhất: [`User_guide.md`](User_guide.md).

- Thêm route tĩnh `/guide` cho workflow task-first và `/guide/reference` cho mọi
  tham số/giá trị user-visible thuộc Upload, Processing, Job, Structure, OCR
  result, Review, Report/Artifacts và Sizing/Cost.
- Sidebar chỉ thêm `Hướng dẫn sử dụng` / `User guide` sau `Sizing & Cost`;
  reference không có item riêng. Hai route không fetch API, không thêm persisted
  state ngoài language hiện có và vẫn đọc được khi backend lỗi.
- Tutorial chính dùng một Văn bản hành chính với `Metadata` + `Tự động`; Bìa và
  Hồ sơ gộp là nhánh sau. Browser tips thu gọn, không biến guide thành khóa học
  tin học.
- VI/EN parity đầy đủ; một sidebar guide cố định, không lặp contextual help trên
  các màn hình workflow; giữ 5 ảnh sanitized và parameter
  entry sáu phần. Dynamic provider/price/measurement/capacity chỉ được giải thích,
  không sao chép vào guide tĩnh.
- Sizing reference phải giữ semantics `Unavailable`, fingerprint và gate
  `1/2/5/20`; có công thức/ví dụ giả lập nhưng không đưa benchmark hoặc verdict
  mua sắm khi thiếu evidence.
- Dùng TypeScript data, semantic HTML, native anchor/details và CSS hiện có;
  không thêm MDX, CMS, search, tour, analytics hoặc dependency.
- Chỉ đánh dấu `LOCAL COMPLETE` khi cả hai route, VI/EN, sidebar guide, 5 ảnh,
  accessibility tại ba viewport và full regression gate cùng pass. Không có
  user-testing gate riêng.

`FE-X18` là P1 frontend-only, không block Milestone C và không thay đổi trạng
thái live evidence của `FE-X17`.

Đã hoàn thành hai route tĩnh `/guide` và `/guide/reference`, VI/EN dùng language
state hiện có, đúng một sidebar item, không lặp contextual help trên các màn hình
workflow và có 5 ảnh fixture
sanitized. Reference có 9 nhóm, 38 entry với anchor ổn định và sáu phần nội
dung. Follow-up UI thêm scroll-spy/`aria-current` cho mục lục hai route, bỏ hai
CTA đầu guide bị trùng navigation, tách `Lưu ý` xanh trung tính và `Cẩn trọng`
vàng cam trong reference; guide không gọi API, không thêm dependency/schema/persistence. Gate local
đạt 62 backend tests, typecheck, production build/prerender, OpenAPI check,
compileall và diff check. Browser runner thực thi đủ 25 test không báo test lỗi
nhưng tiến trình teardown trên Windows không thoát trước timeout; vì vậy bằng
chứng browser full-suite vẫn được ghi rõ là teardown pending, không dùng để
thay đổi bất kỳ live gate nào của `X17` hoặc Milestone C.

### FE-X19

**P1 — Shared demo login/logout — LOCAL COMPLETE; LIVE GATE PENDING.** Counterpart:
[`BE-X19`](implementation_plan.md#be-x19). Đặc tả chi tiết và acceptance:
[`Simple_Auth.md`](Simple_Auth.md).

- `/login` dùng CSS/brand hiện có, VI/EN, username/password, show/hide, Caps Lock,
  loading và generic error; không signup/forgot-password/profile/admin.
- Login thành công quay về relative `returnTo` an toàn hoặc Jobs. Không lưu auth
  data trong localStorage; language setting hiện có giữ nguyên.
- `sidebar-tools` hiển thị shared username và Logout cạnh VI/EN; collapsed/mobile
  giữ keyboard, tooltip/ARIA label và không thêm avatar menu.
- Shared request helper thêm `X-OCR-Request` cho unsafe method và phát native
  auth-expired event khi nhận `401`.
- Session-expired modal login lại tại chỗ, giữ correction/segmentation draft,
  tiếp tục read/poll nhưng không auto-replay mutation.
- Protected response dùng `no-store`; logout rồi Back/refresh không đọc dữ liệu
  cũ. UI phải pass `1440×900`, `1366×768`, `390×844`.
- `FE-X19` không block Milestone C. `/login`, AppShell logout, shared request
  seam và modal hết phiên đã pass production build cùng 27 browser checks, gồm
  returnTo an toàn và giữ draft không replay mutation. Live port-closure/full OCR
  smoke vẫn mở.

## Thứ tự triển khai parity

0. **Fixture-first:** khóa composition manifest/page ranges trước khi xây UI.
1. **Tính đúng:** `FE-X16` → `FE-X8` → `FE-X7` → `FE-X9` → `FE-X10` →
   `FE-X11`, mỗi mục đi cùng backend counterpart và generated contract.
2. **Vận hành:** `FE-X12` → `FE-X13` sau khi backend persist dữ liệu.
3. **Workspace:** phần evidence/artifact/URL/visual utility của `FE-X13`/`FE-X15`.
4. **Đo lường:** `FE-X14` chỉ còn benchmark từ sample live; corrected export
   không chặn Milestone C.
5. **Sizing:** `FE-X17A → FE-X17F` theo backend counterpart; Preview trước,
   chart/calculator/retention/snapshot mở dần theo data gate.
6. **User guide:** `FE-X18`; audit UI/OpenAPI trước, rồi triển khai đồng thời
   workflow guide, parameter reference, VI/EN, sidebar guide và evidence ảnh.
7. **Shared demo auth:** backend `BE-X19` trước; sau đó `/login`, AppShell logout,
   session-expired draft safety và cuối cùng Nginx/direct-port live smoke.

## Public-data mapping cần bảo vệ

| UI block | Public source |
|---|---|
| Dashboard | `GET /api/state`, gồm filter tổng hợp `status=active` |
| Provider configuration | `GET /api/provider-profiles`, engine readiness endpoint |
| Upload | limits, `processing_mode` và create/upload/start endpoints |
| Segmentation | `source_pdfs[]`, per-source confirm, `/continue` và revision conflict |
| Lifecycle action | cancel, typed rerun mode, delete-preview và bulk-delete |
| Review | `GET /api/jobs/{id}` và `/corrections`: expected fields, evidence, blocker/risk |
| Crop | page artifact và `/manual-crop` |
| Hàng đợi rà soát | `GET /api/documents`: triage aggregate và deep-link target |
| Artifacts | `GET /api/jobs/{id}/artifacts` |
| Progress/failure | persisted job snapshot từ `GET /api/state` và `GET /api/jobs/{id}` |
| Logs/timeline | `GET /api/events`, durable safe events và URL-persisted filters |
| Tổng quan vận hành/export | `GET /api/reports`, `GET /api/documents` và corrected artifact URL |
| Codes | `/api/codes` CRUD |
| System Monitor | `GET /api/system-metrics` |
| Sizing overview/explorer | `/api/sizing/overview`, `/jobs`, job summary và paginated `/operations` |
| Sizing catalogs/calculator | `/api/sizing/catalog`, `/calculate`, exchange-rate suggestion |
| Sizing retention/snapshot | `/api/sizing/retention/*`, `/api/sizing/snapshots` |

## Regression checklist

| Nhóm | Trạng thái hiện tại | Điều kiện đóng |
|---|---|---|
| Shell/routes, visual parity, VI/EN, accessibility, responsive | PROTECT | Route/deep-link và ba viewport vẫn pass |
| Provider/task upload | PASS LOCAL `X1` | Input chạy đúng backend task/page semantics |
| Dashboard và Manage | PROTECT | Chỉ dùng persisted/typed data; status dài không đè cột kế bên |
| Rich job workspace | PASS LOCAL `X2` | Partial warning không che page/field tốt |
| Review/crop | PROTECT | Correction/conflict/draft/crop reload pass |
| Artifacts/timeline/logs | PASS LOCAL `X2` | Per-page safe diagnostics render đúng |
| Reports/benchmark/Codes/Monitor | PROTECT | Nullable/unavailable và durable data vẫn đúng |
| Generated API/compatibility | PASS LOCAL `X3` | OpenAPI check và legacy read pass |
| Evidence/missing field/approval/rerun/readiness | `X7`–`X11` LOCAL COMPLETE; `X7` LIVE PENDING | Nhóm P0 giữ focused/local pass; X7 còn fixture |
| Segmentation/Bìa/logical documents | `X16` LOCAL COMPLETE; LIVE PENDING | Bốn fixture, confirm/restart/review và legacy read pass |
| Progress/timeline/triage | PASS LOCAL `X12`–`X13` | Persisted counters/failure/timeline, backend triage, deep-link và missing artifact pass |
| Report/export/URL | `X14` LOCAL COMPLETE; LIVE SAMPLE PENDING; `X15` PASS LOCAL | Benchmark fingerprint thật |
| Sidebar re-decoration | LOCAL COMPLETE 2026-07-28 (`X14`/`X15`) | Navigation mới, actionable report, exact deep-link, partial error và ba viewport pass |
| Token/cost/sizing | `X17A`–`X17E` LOCAL COMPLETE; `X17F` LIVE PENDING | One-PDF/provider Preview → bốn fixture → 20-job capacity gate |
| User guide/reference | `X18` IMPLEMENTED; browser teardown pending | Hai route tĩnh, inventory đủ, VI/EN, một sidebar guide, 5 ảnh và accessibility; xác nhận runner thoát sạch sau 25 test |
| Shared demo auth | `X19` LOCAL COMPLETE; LIVE GATE PENDING | Exact host-port closure và full authenticated OCR smoke |
| Dashboard hierarchy refinement | LOCAL COMPLETE 2026-07-28 | Hai nhóm metric có một scope note; terminal không có progress; delete ở menu phụ; sidebar VI/EN dùng selected blue |
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
| `dashboard.png` | Dashboard cũ, 1440×900; cần recapture sau refinement metric/job-row trước release |
| `dashboard-1366x768.png` | Dashboard cũ, 1366×768; cần recapture sau refinement metric/job-row trước release |
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
