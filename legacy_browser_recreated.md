# Kế hoạch tái tạo giao diện legacy trên Next.js

## 1. Trạng thái và phạm vi quyết định

Tài liệu này là kế hoạch đã được chốt sau buổi phỏng vấn thiết kế ngày
2026-07-21. Chưa có runtime code nào được thay đổi theo kế hoạch này.

Mục tiêu là tái tạo trải nghiệm browser legacy từ `web/` trong frontend Next.js
ở `frontend/`, giữ nguyên API/lifecycle/filesystem/rollback contract của stack
mới. Ngoại lệ backend duy nhất được duyệt là hoàn thiện telemetry thật cho
`GET /api/system-metrics`; endpoint hiện chỉ là stub trả `null`.

Persona chính là nhân viên nghiệp vụ xử lý hồ sơ đầu-cuối:

1. chọn và upload PDF;
2. theo dõi job;
3. kiểm tra từng document/page/field;
4. sửa và duyệt kết quả;
5. bổ sung manual crop làm evidence khi cần.

Logs và System Monitor là công cụ hỗ trợ. Chúng không được lấn át luồng nghiệp
vụ chính.

Đây là công việc documentation/planning. Trước khi triển khai runtime, phải
đồng bộ ngoại lệ telemetry và acceptance desktop-first vào
`implementation_plan.md`. Không tự commit nếu người dùng chưa yêu cầu.

## 2. Nguồn chuẩn và thứ tự ưu tiên

1. `implementation_plan.md` và `AGENTS.md`: kiến trúc, PDF-only, lifecycle,
   rollback, quy trình kiểm tra và Milestone C.
2. Tài liệu này: quyết định đã khóa riêng cho đợt tái tạo UI và telemetry tối
   thiểu.
3. `web/app.js`, `web/styles.css`, `web/i18n.js`: hành vi và visual legacy đã
   điều chỉnh cho repo hiện tại.
4. `../OCR_paper/web/src/`: nguồn đối chiếu cảm giác bố cục, không phải nguồn
   contract.
5. Pydantic v2/OpenAPI và `frontend/lib/api-schema.ts`: nguồn chuẩn duy nhất
   cho public fields.
6. `frontend/app/` và `frontend/lib/api.ts`: implementation hiện tại cần mở
   rộng, không thay bằng một frontend khác.

Kết quả đối chiếu hiện có:

- `web/styles.css` và `../OCR_paper/web/src/styles.css` có cùng SHA-256.
- `web/i18n.js` và `../OCR_paper/web/src/i18n.js` có cùng SHA-256.
- `web/app.js` là nguồn port chính xác hơn vì đã bỏ ZIP/ảnh/folder và chỉ nhận
  PDF.
- Tên checkout đúng là `../OCR_paper`, không phải `../ORC_paper`.

Nếu tài liệu này và `implementation_plan.md` còn mâu thuẫn về host telemetry
hoặc viewport mobile, phải sửa tài liệu trước khi viết runtime code; không tự
suy diễn ưu tiên.

## 3. Định nghĩa hoàn thành và phần cố ý không làm

“Tái tạo legacy” có nghĩa:

- khôi phục shell, brand, mật độ dữ liệu và hierarchy thị giác;
- làm lại upload/dropzone, dashboard job và phản hồi trạng thái;
- cung cấp workspace review document/page/field, correction diff và evidence;
- thay nhập tọa độ tay bằng visual crop;
- hiển thị report từ dữ liệu thật, logs legacy khi có và telemetry server thật;
- giữ VI/EN, keyboard accessibility và layout desktop responsive.

Không làm:

- ZIP, ảnh rời, folder upload hoặc `webkitdirectory`;
- chọn provider/model/task/pages/max-pages từ browser;
- Codes, Account, Admin, Settings hoặc navigation placeholder;
- Documents, Logs hoặc Reports thành màn hình tổng hợp riêng;
- benchmark/quality histogram/resource-per-method không có public data;
- progress bar suy diễn từ status/counters;
- mock card, mock telemetry hoặc empty screen chỉ để giống legacy;
- UI kit, icon package, chart library, state manager, BFF, database,
  WebSocket hoặc shared-types package;
- JSON editor cho legacy field phức tạp;
- host agent, Docker socket, đặc quyền container hoặc GPU bắt buộc trong
  Compose;
- pixel-perfect gate hoặc screenshot pixel diff;
- xóa/sửa `web/` và `src/ocr/` rollback runtime.

## 4. Contract facts đã xác minh

Các quyết định UI phải phản ánh đúng implementation hiện tại:

- `/engines/{id}/check` chỉ kiểm tra cấu hình URL/model, không probe provider.
  UI gọi đây là “Trạng thái cấu hình”, không phải “kết nối sẵn sàng”.
- `/corrections` luôn đặt document thành `approved`, kể cả khi payload có
  corrections. Không có API “Save nhưng chưa approve”.
- Backend chỉ cho correction đối với field canonical trong `FIELDS`. Legacy
  field lạ vẫn đọc được nhưng phải read-only.
- `FieldResponse.value` là `Any` để đọc job cũ. Object/array phải read-only,
  không biến thành JSON editor.
- OCR bbox là `[left, top, right, bottom]`, nhưng contract chưa cam kết pixel
  hay normalized. Crop API lại nhận `{x, y, width, height}` theo natural image
  pixels. Không dùng OCR bbox để khởi tạo crop.
- Manual crop là evidence append-only; không có replace/delete API.
- Backend mới không ghi logs; `StateResponse.logs` luôn rỗng. `JobResponse.logs`
  chỉ có thể có dữ liệu từ job legacy và chứa kiểu bất kỳ.
- `/api/system-metrics` hiện trả `cpu_percent`, `memory_percent`, `gpu` đều
  `null`; đây là stub, chưa phải telemetry thật.
- Dashboard metrics được tính trên toàn bộ tập khớp filter, không phải toàn hệ
  thống và không chỉ page hiện tại.
- Upload trùng final filename làm job chuyển `error`; một file lỗi cũng làm
  toàn job lỗi và job đó không resume được.

## 5. Information architecture đã khóa

### 5.1 Shell

Sidebar desktop chỉ có:

- brand IntelliDoc OCR;
- `Jobs`;
- `New OCR`;
- `System Monitor` ở nhóm utility phía dưới;
- hai nút VI/EN có active state.

Không thêm item để lấp khoảng trống. `New OCR` mở upload panel inline trên
dashboard, không mở route hay modal riêng. Từ job detail, action này chạy
dirty-state guard rồi về dashboard với panel đã mở.

### 5.2 Route

- `/`: shell, metrics, upload panel, filter và job list.
- `/jobs/[jobId]`: job header, document navigator, review workspace, report,
  conditional logs và actions.
- System Monitor là modal utility, không phải route.

Không tạo route riêng cho Upload, Documents, Logs hoặc Reports.

### 5.3 Responsive target

Thiết kế desktop/laptop-first và tự co giãn bằng CSS Grid/Flexbox/minmax:

- `1440×900`: visual baseline chính;
- `1366×768`: layout smoke cho laptop;
- `390×844`: chỉ kiểm tra an toàn tối thiểu—không overflow ngang, trang không
  vỡ và modal đóng được.

Không xây workflow review/crop mobile chuyên biệt. Dưới breakpoint desktop,
layout có thể xếp một cột an toàn; functional acceptance chỉ ở desktop.

## 6. Hành vi chi tiết

### 6.1 Upload

- Dropzone lớn hỗ trợ click và drag/drop bằng native File API.
- Chấp nhận tên `.pdf` không phân biệt hoa/thường dù MIME browser rỗng. Không
  parse PDF ở frontend; backend vẫn kiểm tra `%PDF`, cấu trúc, mật khẩu và tối
  đa 100 trang.
- Runtime limits 15 file/200 MiB lấy từ `StateResponse.limits`; copy tĩnh vẫn
  nêu 100 trang/PDF vì đây là architecture invariant.
- Chặn duplicate filename không phân biệt hoa/thường trước khi tạo job; không
  tự rename.
- Hiển thị filename, size, remove từng file và Clear. Disable thay đổi file
  trong lúc upload.
- Upload tuần tự từng file, hiển thị file hiện tại và `uploaded/selected`.
- `upload_name` là `TênFileĐầu.pdf +N`, không nối 15 filename vào một chuỗi.
- Consent external mặc định bỏ chọn và áp dụng theo từng job; không lưu vào
  localStorage. Chỉ hiện khi `endpoint_external=true`.
- Badge engine nói `Đã cấu hình/Chưa cấu hình`; nút là `Kiểm tra lại cấu hình`.
  Disable Start khi chưa cấu hình, nhưng không tuyên bố provider reachable.
- Nếu partial upload làm job lỗi, giữ `File[]` trong browser và cho tạo job mới
  với cùng lựa chọn. Không resume/retry job cũ.
- Start thành công tự điều hướng sang job detail.

### 6.2 Dashboard

- Header, New OCR, metrics, search, status/engine filter, pagination và jobs.
- `q`, `status`, `engine`, `page` nằm trong URL query params. Search debounce
  ngắn; không dùng localStorage/state manager.
- Metrics thay đổi theo filter và được ghi nhãn “Kết quả đang lọc”. Không gọi
  `/state` lần hai để dựng global metrics.
- Job row/card hiển thị display name, short ID, provider/model snapshot an
  toàn, status, file/page/failed-page/correction counters và timestamps.
- Không progress bar khi API chưa có stable stage và total work. Dùng status +
  counters thật.
- Action duy nhất luôn có là `Open`. Active job có `Cancel`; terminal job có
  `Rerun`; chỉ job deletable có `Delete`. Không có `Follow`.
- Checkbox chỉ bật cho job deletable. Selection chỉ thuộc page hiện tại; đổi
  filter/page thì xóa. Polling giữ ID còn visible/deletable và bỏ ID stale.
- Delete preview dùng modal một bước, liệt kê job xóa và blocked/stale items;
  không yêu cầu gõ lại ID.
- Poll dashboard 10 giây khi document visible. Nếu refresh lỗi, giữ snapshot
  thành công gần nhất, hiện stale banner và Retry; chỉ dùng full-page error khi
  lần tải đầu thất bại.

### 6.3 Lifecycle actions

- Cancel luôn có confirm vì job không resume được; sau confirm disable action
  cho đến khi status đổi.
- Rerun có modal nói rõ job cũ giữ nguyên, job mới chỉ sao chép PDF, không mang
  corrections/approval/crop. External endpoint phải xin consent lại. Thành
  công mở job mới.
- Delete chỉ dùng backend preview/result và lifecycle invariant; không ẩn lỗi
  API bằng optimistic UI.
- `interrupted` là terminal; chỉ Rerun/Delete, không auto resume.

### 6.4 Job detail và document selection

- Header hiển thị display/full ID, status, provider/model/prompt snapshot,
  counters, safe error và actions.
- Document navigator là hàng tab/list compact phía trên workspace, không phải
  cột thứ ba.
- Document mặc định theo thứ tự: có lỗi; chưa duyệt; document đầu tiên.
- Đổi document reset selected page/field/crop. Nếu có draft thì yêu cầu xác
  nhận bỏ thay đổi.
- Document lỗi hoặc không có field không được approve; chỉ hiển thị safe error
  và action Rerun job. Không có document-level Retry giả.

### 6.5 Viewer và page navigation

- Desktop workspace có hai cột: page viewer và field editor.
- Page navigator dùng số trang compact, không tải thumbnail cho tối đa 100
  trang. Chỉ tải ảnh trang đang chọn.
- Viewer chỉ có `Fit` và `100%`; ảnh lớn scroll trong panel. Không slider zoom,
  pan engine hoặc dependency.
- Chọn field hợp lệ tự mở page tương ứng. Tự đổi page sẽ bỏ field selection nếu
  field không thuộc page mới.
- `page_index` ngoài phạm vi hiển thị `Trang không xác định`, không clamp và
  disable crop.
- Nếu ảnh artifact lỗi, field editor vẫn hoạt động; crop của page đó bị
  disable và viewer có Retry/Open artifact.

### 6.6 Field presentation và review

- Frontend giữ map trình bày cố định cho field canonical: label VI/EN, group,
  order và input type. Field lạ vào `Khác/Other`, giữ order API và read-only.
- Field scalar canonical mới editable. Object/array hiển thị JSON pretty-print
  read-only. Field nội dung dài đã biết dùng textarea tự giãn; field khác dùng
  input một dòng.
- Confidence chỉ đổi sang phần trăm khi hữu hạn và trong `0..1`; dữ liệu khác
  hiển thị `Không có dữ liệu`. Không tự đặt threshold/risk badge.
- OCR bbox chỉ là metadata. Không dùng nó làm crop overlay/selection cho đến
  khi backend có coordinate contract chuẩn.
- Cho phép giá trị sửa rỗng; hiển thị rõ diff `giá trị mới: trống`. Không tự
  `trim()` hoặc normalize input.
- Chỉ gửi field có `new_value !== current value`; sửa rồi hoàn nguyên không tạo
  correction/audit giả.
- Có draft: primary action là `Lưu và duyệt`. Không có draft và chưa duyệt:
  action là `Duyệt`. Đã duyệt và không có draft: chỉ hiển thị trạng thái +
  `approved_at`, không gửi approval trùng.
- UI không hiển thị “approved by” vì contract chỉ có timestamp và backend audit
  actor hiện là `anonymous`.
- Correction diff luôn là `ocr_value` ban đầu so với current value; không dựng
  revision history khi API không trả history.
- Thêm crop evidence sau approval không làm mất approval. Một correction mới
  sẽ tạo lần `Lưu và duyệt` mới và cập nhật timestamp theo contract.

### 6.7 Dirty state và conflict

- Draft chỉ thuộc document hiện tại và không bị polling/server refresh ghi đè.
- Điều hướng trong app dùng accessible discard-confirm modal.
- Refresh/đóng tab dùng native `beforeunload`, chỉ đăng ký khi có draft.
- `409 correction_conflict` giữ nguyên draft, reload server value và hiển thị
  `Server/Bản đang sửa`. Người dùng chọn giữ draft hoặc dùng server rồi gửi
  lại; không auto merge.

### 6.8 Visual crop

1. Chọn field và page hợp lệ.
2. Mở natural page image trong modal.
3. Pointer down/move/up tạo rectangle overlay.
4. Clamp rectangle trong displayed image.
5. Đổi CSS coordinates sang natural image pixels.
6. Chặn non-finite hoặc rectangle nhỏ hơn `2×2`.
7. Preview và cho Reset/Cancel/Save.
8. Gửi `CropRectangle` hiện có.
9. Reload job và đưa evidence mới vào đúng document/field.

Crop editor luôn bắt đầu trống; không dùng OCR bbox. Rectangle focusable; arrow
keys di chuyển, `Shift + Arrow` resize, có hướng dẫn ngắn. Evidence append-only,
mới nhất trước. Khi chọn field, chỉ hiển thị evidence của field đó; chưa chọn
field thì hiển thị toàn document. Không giả lập Replace/Delete.

### 6.9 Report và logs

- Report là section inline trong job detail: documents, pages, corrections,
  failures, approval summary và link artifact/report thật nếu có.
- Không tạo route Report hoặc biểu đồ suy diễn.
- Logs chỉ render collapsed section khi `job.logs.length > 0`. String giữ
  nguyên dòng; object JSON pretty-print. Copy dùng Clipboard API, Download dùng
  Blob URL. Không có global Logs view hoặc placeholder rỗng.
- Safe error đã biết map sang VI/EN. Code lạ hiển thị thông báo chung + stable
  code; không hiển thị raw response/body.

### 6.10 System Monitor

System Monitor đọc tài nguyên của môi trường chạy backend/server, không đọc máy
browser khi browser ở máy khác.

Backend telemetry tối thiểu:

- CPU percent và memory percent bằng `psutil` trên Windows/Linux;
- disk used/total/free/percent của filesystem chứa `OCR_DATA_DIR` bằng
  `shutil.disk_usage`;
- mọi GPU mà backend nhìn thấy qua `nvidia-smi`: index, name, utilization,
  VRAM used/total và temperature;
- stable GPU status `available | unavailable | error`; không trả stderr/raw
  command output;
- không trả hostname, IP, OS, process list, path, secret hoặc provider config.

Giữ field `gpu` và khả năng trả `null` tương thích; định nghĩa nested Pydantic
models typed trước, regenerate OpenAPI/types rồi mới render UI. Thêm dependency
backend duy nhất là `psutil`; GPU dùng `shutil.which` + `subprocess` không shell,
timeout ngắn. Không thêm NVIDIA SDK.

Compose chính không cấp `gpus: all`, không mount Docker socket và không yêu cầu
NVIDIA runtime. Backend chạy trực tiếp trên host có `nvidia-smi` có thể hiển thị
GPU; Compose không thấy GPU thì báo `unavailable`. Chỉ cân nhắc Compose override
opt-in trong yêu cầu riêng.

Modal fetch khi mở, poll mỗi 2 giây chỉ khi modal mở và tab visible, dừng ngay
khi đóng/hidden/unmount; có Refresh và timestamp. UI dùng cards/CSS bars đơn
giản, không chart dependency. Endpoint không auth chỉ được trả payload tối
thiểu nêu trên.

### 6.11 VI/EN và accessibility

- Vietnamese mặc định; hai nút VI/EN cập nhật React state tức thời và lưu
  `localStorage["intellidoc.language"]`; không reload làm mất draft.
- Chỉ dịch UI và label field canonical. Không dịch OCR value, IDs, logs hoặc
  tên field lạ. Date/number format theo locale.
- Browser support: Chrome/Edge hai stable versions gần nhất trên desktop.
- Gate luồng chính theo WCAG 2.1 AA thực dụng: keyboard, focus-visible,
  semantic label/role, contrast, reduced motion, modal focus trap/restore và
  Escape. Không tuyên bố certification đầy đủ.

## 7. Action/state matrix tối thiểu

| Trạng thái | Open | Cancel | Rerun | Delete | Review/crop |
| --- | --- | --- | --- | --- | --- |
| `uploading`, `ready` | Có | Không | Không | Có | Không |
| `starting`, `queued`, `running` | Có | Có | Không | Không | Không |
| `cancelling` | Có | Đã disable | Không | Không | Không |
| terminal | Có | Không | Có | Có | Có khi document hợp lệ |

`completed_with_warnings`, `error`, `cancelled`, `interrupted` đều là terminal.
Frontend phản ánh invariant nhưng backend vẫn là trust boundary.

## 8. API/schema strategy

Ưu tiên dùng contract hiện có. Chỉ mở schema cho telemetry đã duyệt:

1. thêm/siết nested Pydantic v2 models cho disk/GPU và giữ key cũ tương thích;
2. trả safe nullable values khi metric không lấy được;
3. thêm focused backend tests cho available/unavailable/error, không phụ thuộc
   GPU thật;
4. regenerate `frontend/openapi.json` và `frontend/lib/api-schema.ts`;
5. chỉ dùng generated types trong `frontend/lib/api.ts`/UI;
6. chạy `pnpm api:check`.

Không mở schema cho progress, stage, risk, structured logs, approval actor hoặc
bbox coordinate system trong đợt này. Không viết DTO tay.

## 9. Cấu trúc code dự kiến

Giữ ít file và chỉ tách stateful interaction có blast radius riêng:

```text
frontend/app/
  layout.tsx
  page.tsx
  globals.css
  legacy-shell.tsx
  jobs/[jobId]/
    page.tsx
    review-workspace.tsx
    review.css
frontend/lib/
  api.ts
  api-schema.ts                  # generated, không sửa tay
  i18n.ts
frontend/tests/e2e/
  smoke.spec.ts
backend/app/api/routes.py        # /system-metrics hiện có
backend/app/schemas/jobs.py      # typed telemetry schema
backend/tests/test_api.py        # focused telemetry contract
backend/pyproject.toml           # psutil
```

Không tạo component riêng cho card, badge hoặc button. Chỉ tách thêm file khi
route/review code thực sự không còn đọc được hoặc cần test độc lập.

## 10. Sáu phase triển khai

### Phase 0 — Baseline và contract mapping

- Chạy legacy và Next.js với cùng fixture/mock.
- Lưu ba ảnh sanitized dưới `docs/ui-parity/`: dashboard populated, review
  workspace và crop modal.
- Lập checklist DOM/interaction cho các state còn lại; không pixel diff.
- Ghi mapping UI block → schema/API và xác minh các contract facts ở mục 4.
- Đồng bộ `implementation_plan.md` trước runtime changes.

Gate: baseline/mapping tồn tại, không còn block dựa trên field/API giả.

### Phase 1 — Backend telemetry và generated types

- Implement CPU/RAM/OCR disk/GPU best-effort tối thiểu.
- Thêm `psutil`, safe GPU query/status và focused tests.
- Regenerate OpenAPI/types; không đổi Compose GPU access.

Gate: tests/API check pass trên máy không GPU; payload không lộ host details.

### Phase 2 — Shell, dashboard và upload

- Port tokens/CSS selectors có consumer.
- Implement sidebar tối giản, instant VI/EN, inline upload panel.
- Implement validation, consent, sequential upload, recovery, URL filters,
  truthful metrics/status và accessible delete/cancel/rerun modals.

Gate: mọi lifecycle action hiện có vẫn đúng, không progress/fake screen.

### Phase 3 — Job detail, review và report inline

- Document/page navigation, two-column viewer/editor và field presentation map.
- Draft/dirty/conflict behavior, `Lưu và duyệt`, approval state và correction
  diff.
- Report inline, safe error/artifact handling.

Gate: mọi document/page, correct+approve+reload và conflict path hoạt động.

### Phase 4 — Visual crop

- Pointer + keyboard rectangle, natural-coordinate conversion và bounds.
- Save/reload append-only evidence, filter theo selected field.
- Focused Playwright geometry/payload test.

Gate: crop desktop đúng natural pixels, không nhập tọa độ tay.

### Phase 5 — Conditional logs, System Monitor và parity

- Conditional legacy logs Copy/Download.
- System Monitor modal polling có điều kiện.
- Hoàn tất VI/EN, keyboard, accessibility và responsive checks.
- Cập nhật README/plan/AGENTS và acceptance docs nếu rollout state thay đổi.

Gate: required checks pass; không tuyên bố Milestone C/production ready nếu
chưa có strong-server evidence.

Không tự tạo commit ở bất kỳ phase nào nếu người dùng chưa yêu cầu.

## 11. Kiểm thử và evidence

Mở rộng suite Playwright hiện có, không tạo framework mới:

- shell/sidebar/instant language và URL filter state;
- drag/drop, duplicate/limit/consent, sequential upload và failed-job recovery;
- cancel/rerun/delete modals và state matrix;
- stale polling behavior;
- default document priority, dirty guard, conflict và Save-and-Approve;
- numeric page navigation, Fit/100% và artifact error fallback;
- crop pointer + keyboard, Fit→natural conversion, bounds và exact API payload;
- conditional logs;
- System Monitor open/poll/hidden/close và unavailable GPU;
- `1440×900`, `1366×768` và một `390×844` safety smoke.

Giữ real Next/FastAPI/eager-task/fake-provider flow hiện có. Mock/browser tests
là contract evidence, không chứng minh OCR quality hoặc production readiness.

Required local checks từ repo root:

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

## 12. Acceptance checklist

### Desktop/responsive

- Sidebar không ép main content tại `1440×900` và `1366×768`.
- Dashboard hierarchy rõ; action không bị che.
- Viewer/editor đồng thời usable; page list không tải 100 thumbnails.
- Crop overlay và submitted bbox khớp natural image.
- `390×844` không overflow ngang và modal đóng được; không gate workflow mobile.

### Functional

- Routes/shapes không drift ngoài typed telemetry extension.
- PDF-only, limits, external consent và one-shot lifecycle được giữ.
- Correction/approval UI nói đúng `/corrections` semantics.
- Draft/conflict không mất dữ liệu nhập.
- Corrections/approval/crop persist sau reload.
- Legacy/new jobs vẫn đọc hai chiều; field lạ/non-scalar không làm UI crash.
- Logs/report/metrics chỉ dùng dữ liệu thật.

### Telemetry/security

- CPU/RAM/disk có safe nullable response trên Windows/Linux.
- Không GPU/tool → `unavailable`; query fail → `error`; tests không cần GPU.
- Compose không bắt buộc NVIDIA runtime.
- Không lộ hostname, path, raw command output, secret hoặc provider config.
- Poll dừng khi modal đóng, tab hidden hoặc component unmount.

### Rollback/rollout

- `web/`, `src/ocr/`, data layout và artifact URLs không đổi.
- Không chạy legacy/new worker đồng thời trên cùng `OCR_DATA_DIR`.
- Không đổi `docs/phase4_acceptance.md` thành PASS nếu chưa có evidence thật.

## 13. Rủi ro và kiểm soát

| Rủi ro | Kiểm soát |
| --- | --- |
| Copy toàn bộ legacy CSS | Chỉ port token/selector có consumer theo phase |
| UI phục hồi feature đã bỏ | Dùng mục “không làm” làm review gate |
| Approval UI sai contract | Dùng `Lưu và duyệt`, không dựng Save riêng |
| Polling ghi đè draft | Draft local + dirty guard + conflict reconcile |
| Crop sai hệ tọa độ | Không dùng OCR bbox; test natural/display scale |
| Job legacy có dữ liệu lạ | Read-only fallback, không JSON editor |
| Progress/report/log giả | Chỉ render public data thật |
| Telemetry lộ host details | Payload allowlist + stable safe status |
| Compose mất portability | GPU best-effort, không `gpus: all` mặc định |
| Mobile scope phình | Chỉ safety smoke, functional desktop-only |
| Tuyên bố production sớm | Milestone C vẫn phụ thuộc strong-server evidence |

## 14. Definition of done

Đợt tái tạo được coi là xong khi:

- shell tối giản, upload, dashboard, job detail, review, crop, report, conditional
  logs và System Monitor thật đạt acceptance desktop;
- UI không tái sinh feature bị loại hoặc block không có dữ liệu;
- correction/approval/crop/lifecycle semantics khớp backend;
- telemetry typed, safe, portable và không cần GPU cho local checks;
- VI/EN, accessibility và responsive anchors pass;
- generated API types không drift và required checks pass;
- ba baseline screenshots/checklist được lưu;
- `web/` vẫn rollback-ready;
- production readiness chỉ được công nhận sau Milestone C evidence.
