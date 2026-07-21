# Kế hoạch Legacy+ Browser trên Next.js

## 1. Trạng thái và mục tiêu mới

Tài liệu này là đặc tả đang có hiệu lực cho đợt nâng cấp browser. Mục tiêu không
còn là bản tái tạo tối giản, mà là **Legacy+ Browser**: phục hồi đầy đủ vẻ ngoài,
mật độ thông tin và tiện ích vận hành của browser trong
`C:\HProjecT\OCR_paper\Web\src`, đồng thời thay các phần giả lập hoặc thiếu an
toàn bằng contract typed, dữ liệu thật và persistence thật.

Hai mốc phải được phân biệt rõ:

- **Baseline v1:** bản Next.js tối giản đã hoàn thành 14/14 checkpoint local ngày
  2026-07-21. Đây là nền kỹ thuật cần giữ, không còn là đích parity cuối cùng.
- **Legacy+ v2:** Phase 0–6 đã implement và verify local ngày 2026-07-21. Browser
  mục tiêu đạt 18/18 checkpoint local; checkpoint 19 vẫn chờ Milestone C trên
  strong server nên chưa được gọi là production-ready.

Milestone C vẫn chưa đạt. Test local, mock provider và ảnh chụp UI không thay thế
bằng chứng Nginx/Redis/Celery/provider thật, restart, cross-version và rollback
trong `docs/phase4_acceptance.md`.

## 2. Nguồn chuẩn và thứ tự ưu tiên

1. `OCR_paper/Web/src/app.js`, `styles.css`, `i18n.js`: nguồn tham chiếu về bố
   cục, điều hướng, mật độ thông tin và workflow browser cũ.
2. `OCR_paper/src/ocr_poc/web.py`: nguồn tham chiếu cho dữ liệu giàu như field
   evidence, page detail, artifact, quality và logs; không được sao chép payload
   nhạy cảm hoặc hành vi giả persistence.
3. Tài liệu này: phạm vi Legacy+ và các nâng cấp đã được duyệt.
4. `implementation_plan.md`: invariant kiến trúc, lifecycle, compatibility,
   rollback và Milestone C.
5. OpenAPI do FastAPI sinh: nguồn chuẩn duy nhất của public API fields.

Khi nguồn cũ mâu thuẫn với PDF-only, an toàn dữ liệu, typed API hoặc durable
truth hiện tại, invariant của monorepo thắng. Khi browser cũ chỉ dựng dữ liệu
giả, Legacy+ phải hiển thị dữ liệu thật hoặc trạng thái “không có dữ liệu”.

## 3. Phạm vi được duyệt

### 3.1 Chỉ loại trừ ba kiểu upload cũ

Legacy+ **không** phục hồi:

- ZIP upload;
- ảnh upload trực tiếp;
- folder upload hoặc `webkitdirectory`.

Upload vẫn chỉ nhận PDF, tối đa 15 file/job, 200 MiB/job và 100 trang/PDF. Mọi
chức năng browser cũ khác đều thuộc phạm vi parity nếu có thể nối với dữ liệu
thật và không phá invariant.

### 3.2 Những gì phải phục hồi và nâng cấp

- shell/sidebar đầy đủ: Jobs, Upload, Manage/Documents, Logs, Report, Codes và
  System Monitor;
- dashboard giàu thông tin, filter, search, pagination, timing, benchmark và
  resource summary khi có dữ liệu thật;
- upload panel có Provider Profile, task, pages, max-pages, readiness và consent;
- Manage/Documents để rà soát tài liệu xuyên job;
- job detail giàu thông tin, page/document navigation, preview, OCR text,
  quality, evidence, suggestions, debug timeline và artifact explorer;
- review/correction/approval/crop giữ đúng durable audit hiện tại;
- structured logs, operations/quality report và benchmark có nguồn dữ liệu rõ;
- Codes CRUD với API và persistence thật;
- System Monitor chi tiết hơn nhưng theo allowlist an toàn;
- VI/EN, accessibility, responsive và deep-link tốt hơn browser cũ.

### 3.3 Những thứ vẫn bị cấm

- URL provider, API key, secret header hoặc raw provider configuration trong
  browser/API công khai;
- raw provider response, unredacted request/response payload hoặc raw command
  output trong job/log/report;
- progress, quality, benchmark, suggestions, artifact hoặc telemetry giả;
- database, Redis persistence, UI kit, state manager, BFF, shared-types package
  hoặc WebSocket chỉ để phục vụ đợt UI này;
- xóa `src/ocr/`, `web/` hoặc thay đổi rollback runtime trước Milestone C và cửa
  sổ rollback;
- dùng OCR `bbox` mơ hồ làm seed cho crop.

## 4. Ngôn ngữ miền chuẩn

- **Legacy Reference Browser:** browser trong `OCR_paper`, dùng làm tham chiếu
  visual/workflow, không phải nguồn chuẩn về security hoặc persistence.
- **Legacy+ Browser:** browser Next.js mới đạt parity với Legacy Reference và
  nâng cấp bằng typed API, dữ liệu thật, durable state và accessibility.
- **Provider Profile:** lựa chọn OCR công khai do server định nghĩa; browser chỉ
  nhận ID, nhãn, capability và readiness an toàn.
- **Code Catalog:** danh mục mã nghiệp vụ dùng trong review/report, có CRUD,
  revision và persistence thật.
- **Review Evidence:** dữ liệu giải thích hoặc chứng minh kết quả OCR; chỉ hiện
  khi worker đã ghi nguồn, confidence, crop hoặc artifact tương ứng.

Glossary ngắn cho toàn repo được giữ trong `CONTEXT.md`.

## 5. Information architecture và routes

Sidebar desktop phải phản ánh browser cũ, nhưng mỗi mục là route/deep-link thật:

| Mục | Route | Dữ liệu chính |
|---|---|---|
| Jobs | `/` | Dashboard và danh sách job |
| Upload | `/upload` | Tạo job PDF-only |
| Manage | `/documents` | Chỉ mục tài liệu xuyên job |
| Logs | `/logs` | Safe structured events |
| Report | `/reports` | Operations, quality, benchmark thật |
| Codes | `/codes` | Code Catalog bền vững |
| Job detail | `/jobs/[id]` | Overview/review/artifacts/report/logs của một job |

System Monitor mở bằng dialog toàn cục và vẫn có URL state hoặc deep-link có thể
khôi phục. Trong job detail, tab hiện tại phải nằm trong URL, ví dụ
`?view=overview|review|artifacts|report|logs`; refresh/back/forward không làm mất
selection hợp lệ.

Mobile `390×844` có navigation đóng/mở được, không overflow ngang và dialog luôn
đóng được. Desktop anchors là `1440×900` và `1366×768`.

## 6. Visual direction: giống browser cũ, nhưng tốt hơn

- tái sử dụng visual language đã được chứng minh trong `OCR_paper`: sidebar tối,
  gradient, card/panel dày thông tin, badge trạng thái, bảng gọn, modal có chiều
  sâu và phân cấp rõ;
- khôi phục hierarchy và density của đúng cùng một state, không chỉ “lấy cảm
  hứng” từ màu sắc;
- giữ token màu/khoảng cách/typography tập trung trong CSS; không đưa UI kit vào;
- dùng semantic HTML, focus ring rõ, skip link, keyboard navigation, focus trap,
  `aria-live` có kiểm soát và `prefers-reduced-motion`;
- text dài, ID, filename và payload read-only phải wrap/truncate có tooltip hoặc
  affordance Copy, không phá layout;
- loading dùng skeleton/placeholder trung tính; không dựng số liệu giả;
- empty/error/unavailable state phải được thiết kế đẹp như happy path.

Ảnh parity chỉ hợp lệ khi Legacy Reference và Legacy+ cùng viewport, ngôn ngữ,
dữ liệu và UI state. Ảnh dashboard cũ so với upload screen mới không phải bằng
chứng parity.

## 7. Hành vi chi tiết

### 7.1 Upload và Provider Profile

- drag/drop và file picker chỉ nhận `.pdf`; validate duplicate, signature, quota,
  encryption và page limit trước khi Start;
- selection tồn tại khi request thất bại để người dùng retry; upload tuần tự để
  tránh làm tăng peak memory;
- browser gọi `GET /api/provider-profiles` và chỉ thấy `id`, label VI/EN,
  capability, task/page constraints, `endpoint_external` và safe readiness;
- browser gửi `provider_profile_id`, task, pages và max-pages trong allowlist;
  không gửi URL/key/header/model tùy ý;
- backend resolve profile thành provider/model/prompt rồi snapshot các giá trị ổn
  định, an toàn vào job;
- external profile luôn yêu cầu consent theo từng job; rerun phải xin lại;
- readiness không được tuyên bố provider reachable nếu server mới chỉ xác minh
  cấu hình cục bộ.

Thiết kế này phục hồi khả năng lựa chọn engine/task/pages của browser cũ mà không
đưa cấu hình nhạy cảm sang browser.

### 7.2 Jobs dashboard

- metric từ dữ liệu thật: total/active/completed/error, document/page/correction
  counts và thời gian cập nhật;
- search/filter/sort/page trong URL; selection không hợp lệ phải tự dọn;
- row/card hiển thị display name, short ID, status, profile/provider/model snapshot
  an toàn, file/page progress, timestamps, duration và warning/error code;
- progress chỉ dùng persisted page/file counters; không nội suy phần trăm giả;
- cancel/rerun/delete theo state matrix hiện tại, dùng dialog truy cập được;
- benchmark/resource summary chỉ hiện khi có các sample tương thích và ghi rõ
  profile, fixture group, thời điểm; nếu không thì hiện “chưa có dữ liệu”.

### 7.3 Manage/Documents

`GET /api/documents` tạo chỉ mục read-only từ durable jobs hiện có, hỗ trợ search,
filter, sort và pagination. Bản đầu được phép scan `OCR_DATA_DIR` vì dữ liệu gốc
vẫn là filesystem; chỉ tối ưu/index thêm khi đo được vấn đề thực tế.

Mỗi hàng cho biết job, document, loại, review status, quality/warning an toàn,
updated time và deep-link thẳng vào đúng document. Unknown/non-scalar legacy
fields vẫn đọc được nhưng chỉ hiển thị read-only.

### 7.4 Job detail, document và page navigation

- header giàu thông tin: full/short ID, display name, status, Provider Profile,
  provider/model/prompt snapshot, lifecycle timestamps và action hợp lệ;
- document list có review/quality/error badge và giữ selection trong URL;
- page navigation dạng số, previous/next, direct jump, Fit/100%; không tải trước
  toàn bộ ảnh của job lớn;
- preview lỗi phải có fallback và link artifact an toàn;
- paper preview, OCR text, line/overlay data chỉ hiện khi schema xác định rõ hệ tọa
  độ và worker đã ghi dữ liệu;
- polling chỉ chạy khi job active hoặc monitor mở; terminal dừng polling; stale
  refresh giữ snapshot gần nhất kèm cảnh báo.

### 7.5 Review, correction, approval và crop

- scalar field sửa được; raw/source/confidence/method/suggestion/evidence hiển thị
  cạnh field khi có dữ liệu thật;
- suggestion không tự ghi đè value; người dùng phải chủ động Apply;
- `/corrections` vẫn **Lưu và duyệt** trong một call; không tạo trạng thái
  “đã lưu correction nhưng chưa duyệt” giả;
- giữ original OCR value, immutable audit, approval kể cả không có correction và
  conflict detection theo old value/revision;
- draft guard áp dụng cho sidebar, route, browser Back, đổi document và đóng tab;
- manual crop bắt đầu từ rectangle người dùng vẽ trên ảnh natural pixels, có
  pointer/keyboard, clamp/min-size và preview; crop chỉ là append-only evidence;
- OCR `bbox` không có contract pixel/normalized ổn định nên không được dùng làm
  crop seed. Nếu worker sinh vùng chứng cứ, phải có schema tọa độ natural-pixel
  riêng và versioned.

### 7.6 Artifact explorer và debug timeline

- liệt kê artifact thực sự tồn tại theo job/document/page, tên an toàn, loại,
  kích thước, timestamp và download URL hiện có;
- timeline dùng typed safe events, không parse chuỗi log tự do để suy đoán state;
- cho phép lọc theo lifecycle/provider/page/review/error nhưng không lộ payload
  thô, filesystem path hoặc secret;
- artifact thiếu/hỏng được biểu diễn rõ, không làm sập cả workspace.

### 7.7 Logs

Logs toàn cục và theo job dùng cùng `SafeEvent` contract. Event có timestamp,
severity, category, stable code, job/document/page reference và localized-safe
message. Backend có thể tổng hợp từ job lifecycle/audit hiện có; event mới cần
append-only persistence trong job, không dùng Redis làm durable truth.

Copy/Download chỉ xuất dữ liệu đã sanitize. Không bao giờ trả stack trace, raw
provider response, URL/key/header, hostname, path hoặc raw command output.

### 7.8 Reports, quality và benchmark

- operations report: throughput, duration, counts, lifecycle outcome và failure
  codes từ job thật;
- quality report: review/correction/approval, confidence/evidence coverage và
  warning thật; không biến “không có confidence” thành `0%`;
- benchmark: chỉ so sánh các run có fixture/profile/task/page scope tương thích;
  hiển thị sample size và timestamp;
- report có view trên browser và download artifact hiện hữu; không tạo file giả;
- metric không đủ dữ liệu phải nullable/unavailable và giải thích ngắn.

### 7.9 Codes với persistence thật

Public API dự kiến:

- `GET /api/codes`;
- `POST /api/codes`;
- `PUT /api/codes/{code}`;
- `DELETE /api/codes/{code}`.

Code Catalog lưu tại `OCR_DATA_DIR/_codes.json`. Việc đặt file ở cấp gốc an toàn
với `JobStore.list()` hiện tại vì hàm chỉ đọc thư mục con. Store phải:

- seed danh mục mặc định hiện có ở lần đầu, không seed lại sau khi người dùng đã
  sửa hoặc xóa;
- validate code/label/category/active flag bằng Pydantic;
- ghi UTF-8 qua temporary file rồi `os.replace`;
- dùng process-local lock và `revision`/conditional update để phát hiện conflict;
- giữ `created_at`, `updated_at` và audit tối thiểu không chứa danh tính giả;
- nằm trong cùng bind mount/backup của `OCR_DATA_DIR`, không thêm database.

Nếu triển khai nhiều backend writer thật trong tương lai, phải đánh giá lại cơ
chế lock; không xây distributed lock trước khi có nhu cầu đó.

### 7.10 System Monitor nâng cấp nhưng an toàn

Telemetry mô tả môi trường mà backend nhìn thấy, theo allowlist:

- CPU: model đã sanitize, logical/physical cores và utilization/load;
- memory: total/used/available/percent;
- disk chứa `OCR_DATA_DIR`: total/used/free/percent nhưng không trả path;
- runtime: OS family, architecture, Python/app version an toàn;
- GPU best-effort: index, sanitized name, utilization, VRAM, temperature, power
  và driver/runtime version nếu truy cập được;
- OCR operations: số job theo state và sample tài nguyên do worker đã persist.

Vẫn cấm hostname, IP, username, filesystem path, process list, environment dump,
raw command output, secret và URL/key/header/provider configuration. GPU và từng
metric là nullable kèm `status/reason`; unavailable không được hiển thị thành
`0%`. Default Compose không yêu cầu GPU access. Polling dừng khi tab hidden,
dialog đóng hoặc component unmount.

## 8. API và persistence strategy

Pydantic v2/OpenAPI tiếp tục là canonical. `frontend/lib/api.ts` chỉ dùng type
được generate; không thêm handwritten DTO. Các contract cần bổ sung theo phase:

- `ProviderProfileResponse` và `ProviderProfilesResponse`;
- `DocumentIndexItem` và paginated documents response;
- `SafeEvent` và paginated events response;
- rich optional field/page evidence với coordinate/version rõ ràng;
- operations/quality/benchmark report responses;
- `CodeCatalog`, `CodeEntry` và revision conflict;
- extended safe system metrics.

Mỗi public field mới phải có backend contract test, OpenAPI regenerate,
`pnpm api:check` và frontend typecheck. Legacy extras tiếp tục đọc được; đọc job
cũ không được tự rewrite. Stable artifact URLs và hai chiều legacy/new readability
phải được giữ trong rollback window.

Durable truth vẫn là `OCR_DATA_DIR`: job JSON/artifacts/audit/events và
`_codes.json`. Redis chỉ là broker disposable. Không thêm database.

## 9. Lifecycle và safety invariants được giữ nguyên

- FastAPI không render PDF hoặc gọi provider; Celery sở hữu OCR.
- `/start` chỉ chuyển nguyên tử `ready → starting` một lần; publish uncertainty
  thành `interrupted`, không auto-resume cả job.
- production worker giữ `--concurrency=1 --prefetch-multiplier=1`.
- retry page đúng allowlist lỗi hiện tại; không retry invalid JSON/validation/read
  timeout.
- cancel dùng marker; rerun chỉ copy source PDF sang job sạch; old job bất biến.
- chỉ xóa `uploading`, `ready` hoặc terminal; không xóa active job.
- persist stable safe error; không persist secret hoặc raw payload.
- browser gọi relative `/api/*`; TLS kết thúc ngoài Compose.

## 10. Các phase triển khai Legacy+ v2

### Phase 0 — Re-baseline và contract freeze

- chụp cùng-state sanitized baseline từ Legacy Reference tại `1440×900` và
  `1366×768`;
- lập mapping từng UI block sang field/API/persistence thật;
- ghi rõ `real`, `derived`, `nullable` hoặc `unavailable`; không có loại `mock`;
- khóa wireframe/routes và fixtures trước khi mở rộng schema.

### Phase 1 — Backend foundations

- Provider Profiles allowlist;
- durable Code Catalog;
- Documents index và Safe Events;
- rich optional field/page evidence và report contracts;
- extended safe telemetry;
- focused persistence, conflict, security và compatibility tests;
- regenerate OpenAPI/types.

### Phase 2 — Shell và visual system

- phục hồi full sidebar/routes, header, cards, tables, badges, modal và responsive
  navigation;
- chuyển token/CSS có chọn lọc từ Legacy Reference;
- accessibility primitives và shared empty/error/loading states.

### Phase 3 — Upload, dashboard và Manage

- PDF-only Upload với Provider Profile/task/pages/max-pages;
- rich Jobs dashboard và lifecycle actions;
- Documents index, filters, deep-link và pagination.

### Phase 4 — Rich review workspace

- job/document/page navigation;
- preview, OCR text, quality/evidence/suggestions khi có;
- correction/approval/conflict/draft guard;
- visual crop, artifact explorer và debug timeline.

### Phase 5 — Logs, Reports, Codes và Monitor

- structured global/job logs;
- operations/quality/benchmark report;
- real Code Catalog CRUD;
- upgraded safe System Monitor.

### Phase 6 — Closure local và documentation

- cùng-state visual comparison, responsive, keyboard và reduced-motion;
- full route/browser E2E, backend/compatibility/API drift/build checks;
- cập nhật README, AGENTS, implementation plan và evidence;
- chỉ tick Legacy+ checkpoint khi evidence tương ứng pass.

Sau Phase 6 mới chạy Milestone C strong-server acceptance cho sản phẩm mục tiêu
mới. Không dùng closure của baseline v1 để tuyên bố Legacy+ hoặc production-ready.

**Trạng thái 2026-07-21:** Phase 0–6 đã hoàn tất local. Backend cung cấp Provider
Profiles, Documents, Safe Events, typed reports/benchmark, artifact manifest,
Code Catalog bền vững và telemetry allowlist. Frontend đã có đủ sáu route chính,
rich job workspace và bằng chứng responsive/cùng-state trong `docs/ui-parity/`.
Vòng closure audit cuối đã bổ sung sort ổn định, timestamps/duration do worker
persist, loại tài liệu/cảnh báo, Logs filter theo profile/document/page, report
throughput/failure/coverage và CPU load average; các giá trị thiếu vẫn nullable.

## 11. Bảng checkpoint

### 11.1 Baseline v1 — lịch sử đã hoàn thành 2026-07-21

| # | Checkpoint | Trạng thái |
|---:|---|---|
| 1 | Shell tối giản và điều hướng Jobs/New OCR | ✅ 100% baseline |
| 2 | Upload PDF, quota, consent và retry selection | ✅ 100% baseline |
| 3 | Dashboard, URL state, search/filter/page | ✅ 100% baseline |
| 4 | Cancel/rerun/delete theo lifecycle | ✅ 100% baseline |
| 5 | Job detail, polling và stale snapshot | ✅ 100% baseline |
| 6 | Viewer, numeric page navigation, Fit/100% | ✅ 100% baseline |
| 7 | Field review và Lưu và duyệt | ✅ 100% baseline |
| 8 | Draft guard và conflict | ✅ 100% baseline |
| 9 | Visual crop natural-pixel evidence | ✅ 100% baseline |
| 10 | Inline report, conditional legacy logs, safe errors | ✅ 100% baseline |
| 11 | System Monitor tối thiểu an toàn | ✅ 100% baseline |
| 12 | VI/EN, accessibility và responsive safety | ✅ 100% baseline |
| 13 | Generated contract và rollback compatibility | ✅ 100% baseline |
| 14 | Local automated gate | ✅ 100% baseline |

Các tick trên chỉ chứng minh phạm vi v1 cũ. Chúng không được cộng vào phần trăm
hoàn thành Legacy+ v2.

### 11.2 Legacy+ v2 — checkpoint đang có hiệu lực

| # | Checkpoint | Điều kiện đạt 100% | Trạng thái |
|---:|---|---|---|
| 1 | Re-baseline cùng state | Có ảnh sanitized cùng viewport/data/state và mapping real/derived/nullable | ✅ 100% local — ảnh 1440/1366 và mapping trong `docs/ui-parity/` |
| 2 | Full shell/routes | Jobs, Upload, Manage, Logs, Report, Codes và Monitor hoạt động bằng route/deep-link thật | ✅ 100% local — route E2E/deep-link pass |
| 3 | Visual parity | Hierarchy, density, token, tables/cards/dialog của browser cũ đạt review cùng-state | ✅ 100% local — đã review ảnh và sửa table 1366/Run comparison |
| 4 | Provider Profiles | API allowlist typed; browser chọn profile/task/pages; không lộ URL/key/header | ✅ 100% local — contract/security test pass |
| 5 | Rich upload/dashboard | PDF-only, readiness/consent và metric/progress/benchmark đều từ dữ liệu thật | ✅ 100% local — stable sort, persisted duration, state/report API; không nội suy progress |
| 6 | Manage/Documents | Chỉ mục xuyên job có pagination/filter/deep-link và compatibility test | ✅ 100% local — search/filter/sort/page/type/warning/URL pass |
| 7 | Rich job workspace | Header/document/page/preview/OCR text/quality state đầy đủ và không giả dữ liệu | ✅ 100% local — profile/timestamps + rich optional fields + browser path pass |
| 8 | Evidence/suggestions | Contract typed, provenance rõ, nullable đúng và suggestion không tự ghi đè | ✅ 100% local — Apply là thao tác explicit |
| 9 | Review/crop parity | Giữ toàn bộ correction/approval/conflict/draft/crop evidence v1 trong UI mới | ✅ 100% local — conflict/draft/natural-pixel crop pass |
| 10 | Artifacts/timeline | Artifact explorer và SafeEvent timeline thật, lỗi cục bộ không sập workspace | ✅ 100% local — manifest thật + available/missing/unknown |
| 11 | Logs | Global/job structured logs có filter/copy/download sanitized và durable truth | ✅ 100% local — lifecycle/review events và filter profile/document/page từ job JSON/audit |
| 12 | Reports/benchmark | Operations/quality/benchmark typed, sample-compatible và unavailable trung thực | ✅ 100% local — duration/throughput/failure/coverage thật; empty benchmark là unavailable |
| 13 | Codes persistence | CRUD API, `_codes.json` atomic, revision conflict, restart/backup test | ✅ 100% local — CRUD/restart/copy-backup/corruption pass |
| 14 | System Monitor+ | Telemetry allowlist chi tiết, nullable đúng, không lộ thông tin cấm | ✅ 100% local — CPU load/RAM/disk/runtime/GPU/operations safe |
| 15 | VI/EN/accessibility | Toàn bộ route/dialog/table dùng được bằng keyboard, language persist, reduced motion | ✅ 100% local — native controls, keyboard crop, VI/EN E2E |
| 16 | Responsive | Pass anchors desktop và mobile safety, không overflow hoặc modal kẹt | ✅ 100% local — 1440×900, 1366×768, 390×844 |
| 17 | Generated API/compatibility | OpenAPI/types không drift; old/new round-trip; đọc job cũ không rewrite | ✅ 100% local — generated check + legacy suite pass |
| 18 | Local closure | Backend, legacy, browser E2E, typecheck, build, OpenAPI check/generation, compile và diff đều pass | ✅ 100% local — xem evidence dưới đây |
| 19 | Milestone C | Nginx/Redis/Celery/provider thật, fixtures, restart, cross-version và rollback có evidence | ⬜ Chưa đạt |

**Tổng Legacy+ v2 hiện tại: 18/19 checkpoint đạt 100%; 18/18 checkpoint local đã
đóng.** Checkpoint còn lại là acceptance vận hành, không phải code/UI local.

## 12. Test và evidence bắt buộc

### Backend

- Provider Profile không lộ secret và reject ID/option ngoài allowlist;
- Code Catalog create/update/delete, invalid data, conflict, atomic write và
  persistence sau restart;
- Documents/Safe Events/report pagination, filtering và sanitization;
- rich optional schemas đọc được legacy extras mà không rewrite;
- telemetry từng metric nullable, command/tool absent, timeout và redaction;
- current lifecycle, corrections, crop, rerun, delete và worker tests vẫn pass.

### Browser

- route/deep-link/back-forward cho toàn sidebar và job tabs;
- PDF-only upload với profile/task/pages/consent và retry;
- dashboard/manage/log/report/codes/monitor happy, empty, error, unavailable;
- rich review, suggestion apply, dirty/conflict, approval và crop;
- Code Catalog CRUD tồn tại sau reload/backend restart;
- keyboard-only, focus return, screen-reader names, VI/EN persistence;
- screenshots cùng-state tại `1440×900`, `1366×768` và mobile safety `390×844`.

### Gate local

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

Test local là contract evidence, không chứng minh chất lượng OCR/provider thật.

Closure local 2026-07-21: backend `27 passed`; legacy compatibility `10 passed`;
browser mặc định `11 passed, 1 capture-only skipped`; capture mode `12 passed`;
TypeScript, production build 9 route, OpenAPI/generated types, compileall và
`git diff --check` pass. Bộ ảnh sanitized nằm trong `docs/ui-parity/`.

## 13. Definition of done

Legacy+ local đã hoàn thành khi 18 checkpoint đầu pass. Sản phẩm chỉ hoàn thành
toàn bộ và được gọi là production-ready khi:

- browser Next.js đạt visual và functional parity với Legacy Reference trong
  toàn bộ phạm vi, **chỉ thiếu ZIP/ảnh/folder upload**;
- mọi tiện ích phục hồi dùng API/dữ liệu/persistence thật hoặc biểu diễn
  unavailable trung thực;
- browser không nhận provider secret/config tùy ý; Provider Profile allowlist và
  per-job external consent hoạt động;
- Codes có CRUD và durable atomic persistence trong `OCR_DATA_DIR`;
- telemetry giàu hơn nhưng vẫn qua allowlist và không lộ thông tin cấm;
- generated types, compatibility, accessibility, responsive và toàn bộ local
  gate pass với evidence cụ thể;
- checkpoint 19 được tick sau kiểm chứng strong-server;
- Milestone C có bằng chứng strong-server thật trước khi tuyên bố production-ready.
