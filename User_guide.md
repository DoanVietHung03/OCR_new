# Kế hoạch User guide

**Trạng thái: IMPLEMENTED; SIZING SYNCED 2026-07-31; FULL BROWSER GATE PENDING.**

Tài liệu này là nguồn chuẩn chi tiết của `FE-X18` cho hai route frontend
`/guide` và `/guide/reference`. Counterpart [`BE-X18`](implementation_plan.md#be-x18)
là `N/A`: không thêm backend endpoint, schema, database hoặc quyền truy cập.
[`frontend_plan.md#fe-x18`](frontend_plan.md#fe-x18) chỉ giữ trạng thái, gate và
backlink; không chép lại đặc tả này.

Nội dung dưới đây là kế hoạch đã chốt, không phải bằng chứng route hoặc chức năng
đã được triển khai.

## 1. Mục tiêu

User guide phải giúp người dùng nghiệp vụ:

1. tự hoàn thành luồng PDF → OCR → theo dõi → rà soát → `Lưu và duyệt`;
2. chọn đúng Processing Mode, Provider Profile, task và page scope;
3. hiểu ý nghĩa, giá trị, đơn vị và tác động của mọi tham số user-visible trong
   workflow OCR;
4. hiểu field OCR, confidence, evidence, suggestion, warning, risk, blocker,
   status, report và artifact;
5. đọc đúng token, cost, sample gate, fingerprint, percentile, throughput,
   capacity và `Unavailable` tại `Sizing & Cost`;
6. chọn đúng hành động khi job chờ xác nhận, có cảnh báo, conflict hoặc lỗi;
7. tìm và gửi được deep-link tới đúng hướng dẫn mà không cần biết kiến trúc
   backend/provider.

Guide hướng dẫn hoàn thành công việc và giải thích tham số; không phải khóa học
tin học cho người hoàn toàn chưa biết dùng máy tính. Thành công local được đánh
giá bằng content contract, accessibility và regression gate, không bắt buộc một
vòng user-testing riêng.

## 2. Kiến trúc đã chốt

- Thêm hai route tĩnh:
  - `/guide`: workflow task-first;
  - `/guide/reference`: từ điển mọi tham số và giá trị user-visible thuộc phạm
    vi V1.
- Sidebar chỉ có một mục:
  - VI: `Hướng dẫn sử dụng`;
  - EN: `User guide`.
- Đặt mục này sau `Sizing & Cost`, trước đường ngăn của `Công cụ hệ thống`.
  `/guide/reference` không có sidebar item riêng.
- Cả hai route dùng Next/React, CSS, `Link`, native `<details>/<summary>`,
  semantic HTML và anchor URL; không fetch API.
- Chỉ dùng language state hiện có tại
  `localStorage["intellidoc.language"]`; không persist guide state khác.
- Không thêm MDX, CMS, search library, UI kit, state manager, onboarding modal,
  product tour, completion tracking hoặc analytics.
- Guide vẫn đọc được khi backend OCR lỗi. Giá trị runtime/configuration hiện
  hành luôn xem tại màn hình sở hữu dữ liệu, không sao chép vào guide tĩnh.
- Mọi anchor dùng slug ASCII ổn định, không đổi theo VI/EN hoặc tiêu đề hiển thị.

## 3. Phạm vi người dùng và nội dung

### 3.1 Đối tượng chính

- Nhân viên nghiệp vụ biết thao tác website và chọn file nhưng chưa hiểu đầy đủ
  OCR, provider, confidence, evidence, job lifecycle hoặc sizing.
- Reviewer cần tra cách sửa, crop, xử lý blocker và duyệt.
- Người quay lại sau một thời gian cần nhớ workflow hoặc ý nghĩa tham số.

### 3.2 Đối tượng phụ

- Operator cần gửi deep-link chính xác cho user.
- Người phụ trách chi phí/capacity cần hiểu cách đọc kết quả `Sizing & Cost`
  nhưng không cần biết API hoặc hạ tầng triển khai.

### 3.3 Phạm vi V1

- Giải thích đầy đủ: Upload, Processing Mode, Provider Profile, task/page scope,
  Job, Structure Review, OCR result, Review/Approve, Report, Artifacts và
  Sizing/Cost.
- `Codes`, `Processing Logs` và `System Monitor` chỉ được giới thiệu mục đích,
  vị trí và lúc cần dùng; không lập từ điển chi tiết cho quản trị/hạ tầng.
- Mọi control, trạng thái, chỉ số và giá trị user-visible trong phạm vi trên
  phải xuất hiện trong parameter inventory được audit từ UI/OpenAPI hiện hành
  trước khi code.

### 3.4 Ngoài phạm vi

- Docker, Redis, Celery, Nginx, filesystem, API/OpenAPI và cấu hình provider.
- Hướng dẫn chỉnh URL, API key, header, model secret hoặc raw response.
- Chứng nhận nghiệp vụ/pháp lý cho kết quả OCR.
- Khuyến nghị mua GPU/provider/cấu hình khi benchmark tương thích chưa đủ.
- Hướng dẫn quản trị chi tiết Code Catalog, Processing Logs hoặc System Monitor.
- Chatbot, video hosting, CMS, tour và theo dõi tiến độ học.

## 4. Information architecture

### 4.1 Workflow `/guide`

| Thứ tự | Anchor | Nội dung | Kết quả cần đạt |
|---|---|---|---|
| 1 | `#start-here` | Bắt đầu tại đây | Chọn tutorial hoặc nhu cầu cần tra |
| 2 | `#ocr-basics` | OCR là gì | Hiểu OCR có thể sai và luôn cần rà soát |
| 3 | `#prepare-pdf` | Chuẩn bị PDF | Biết PDF-only, quyền xử lý và giới hạn upload |
| 4 | `#choose-mode` | Chọn Processing Mode | Chọn Văn bản, Bìa hoặc Hồ sơ gộp |
| 5 | `#first-ocr` | Tạo job OCR đầu tiên | Hoàn thành tutorial Văn bản + Metadata + Tự động |
| 6 | `#job-status` | Theo dõi trạng thái | Biết chờ, thao tác hoặc phục hồi |
| 7 | `#structure-review` | Xác nhận cấu trúc hồ sơ | Sửa boundary/type rồi tiếp tục extraction |
| 8 | `#review-approve` | Rà soát, sửa và duyệt | Kiểm tra nguồn, xử lý blocker và duyệt |
| 9 | `#results` | Kết quả sau hoàn thành | Tìm report, artifact, log và review queue |
| 10 | `#sizing-cost` | Định cỡ và chi phí | Đọc dữ liệu đo, Known cost và lập kịch bản |
| 11 | `#errors` | Lỗi và cách phục hồi | Chọn hành động theo tình huống |
| 12 | `#faq` | Câu hỏi thường gặp | Tra nhanh câu trả lời và đi tới reference |

`Mẹo thao tác trên trình duyệt` là một `<details>` phụ, không phải section trong
workflow chính.

### 4.2 Parameter reference `/guide/reference`

| Thứ tự | Anchor nhóm | Phạm vi |
|---|---|---|
| 1 | `#upload` | File picker, giới hạn, consent và trạng thái upload |
| 2 | `#processing` | Processing Mode, Provider Profile, task, page scope và giới hạn trang |
| 3 | `#job` | Status, progress, lifecycle action, retry/rerun/delete |
| 4 | `#structure` | Source PDF, segment, type, boundary, revision và confirmation |
| 5 | `#ocr-results` | Field, value, source, confidence, evidence, suggestion và validation |
| 6 | `#review` | Draft, correction, Manual crop, warning/risk/blocker và approval |
| 7 | `#reports-artifacts` | Report, artifact, Safe Event và review queue |
| 8 | `#sizing-cost` | Measurement, token/cost, fingerprint, gate, calculator và capacity |
| 9 | `#glossary` | Thuật ngữ nghiệp vụ/kỹ thuật dùng trên UI |

Mỗi tham số có anchor riêng và giữ ổn định giữa VI/EN. `/guide` chỉ tóm tắt
khái niệm cần cho hành động rồi deep-link sang reference; không lặp định nghĩa
dài ở cả hai route.

## 5. Bố cục trang

### 5.1 Header

- Eyebrow `INTELLIDOC OCR`.
- Tiêu đề `Hướng dẫn sử dụng`.
- Mô tả một câu: hướng dẫn từ PDF đầu tiên đến khi rà soát và duyệt.
- Ba CTA:
  - primary: `Bắt đầu OCR đầu tiên` → `/upload`;
  - secondary: `Xem công việc` → `/`.
  - text link: `Tra cứu tham số` → `/guide/reference`.
- Dòng nhỏ ghi phạm vi: hướng dẫn cho người dùng nghiệp vụ, không phải hướng dẫn
  cài đặt hệ thống.

### 5.2 Quick start

Hiển thị một hàng 4 bước trên desktop, một cột trên mobile:

1. Chọn đúng PDF và Processing Mode.
2. Chọn `Metadata` + `Tự động`, kiểm tra cấu hình rồi bắt đầu OCR.
3. Chờ xử lý hoặc xác nhận cấu trúc nếu được yêu cầu.
4. Rà soát, sửa và `Lưu và duyệt`.

Mỗi bước có:

- số thứ tự lớn;
- một câu hành động;
- một câu giải thích ngắn;
- link tới anchor chi tiết tương ứng.

Không biến quick start thành wizard và không lưu trạng thái hoàn thành.

### 5.3 Mục lục và tra cứu

- Desktop: mỗi route có cột mục lục sticky bên trái nội dung; không đè sidebar
  ứng dụng.
- Mobile: mục lục là native `<details>` đặt ngay dưới header, mặc định đóng.
- Link mục lục dùng anchor và `scroll-margin-top`; browser back/forward giữ được
  vị trí section theo URL hash.
- Mục lục desktop/mobile nhấn mạnh section đang đọc bằng màu, độ đậm và
  `aria-current="location"`; scroll-spy dùng listener native, không thêm
  dependency. URL hash vẫn là deep-link chuẩn và cập nhật active state ngay khi
  user chọn mục.
- Không thêm search V1. Mục lục, anchor và browser Find là đường tra cứu.

### 5.4 Section nội dung

Mỗi section dùng cùng nhịp:

- heading;
- mục tiêu một câu;
- các bước có số thứ tự;
- callout `Lưu ý`, `Cảnh báo` hoặc `Khi nào dùng`;
- CTA/deep-link nếu có màn hình tương ứng;
- ảnh minh họa chỉ khi ảnh giúp người mới nhận ra vị trí thao tác.

Không dùng đoạn văn dài hơn khoảng 4 dòng ở viewport desktop. Thuật ngữ kỹ thuật
phải được giải thích ngay lần đầu xuất hiện.

### 5.5 Khối parameter reference

Mỗi tham số dùng một semantic `<dl>` nhỏ; tên, ý nghĩa, giá trị và tác động luôn
hiển thị. Chỉ ví dụ dài hoặc trường hợp đặc biệt mới dùng `<details>`. Không dùng
bảng sáu cột hoặc bắt user mở từng accordion để đọc nghĩa cơ bản.

Mỗi entry bắt buộc có:

1. tên đúng như UI;
2. ý nghĩa bằng ngôn ngữ nghiệp vụ;
3. khi nào user cần quan tâm;
4. giá trị/đơn vị và tác động;
5. một ví dụ cụ thể;
6. warning, `Unavailable` hoặc hiểu nhầm thường gặp.

Nhãn phải khớp UI hiện hành. Bản VI giải thích bằng tiếng Việt nhưng không tự
dịch thành một nhãn khác với control mà user nhìn thấy.

## 6. Nội dung chi tiết

### 6.1 Bắt đầu tại đây

Hiển thị ba lựa chọn theo nhu cầu:

- `Tôi muốn OCR một PDF` → `#first-ocr`;
- `Tôi cần rà soát kết quả` → `#review-approve`;
- `Tôi gặp lỗi hoặc cảnh báo` → `#errors`.

Kèm thông điệp bắt buộc:

- IntelliDoc nhận PDF, không nhận ảnh hoặc ZIP.
- OCR giúp nhập liệu nhanh hơn nhưng có thể đọc sai.
- Người dùng phải kiểm tra nội dung trước khi duyệt.

#### Mẹo thao tác trên trình duyệt

Một `<details>` ngắn, mặc định đóng, chỉ giải thích:

- file picker dùng để chọn PDF;
- refresh chỉ tải lại trạng thái, không chạy lại OCR;
- đóng browser không dừng job đang chạy trên server;
- mở trang nguồn/guide ở tab mới để giữ workspace;
- browser Back quay về URL trước.

Không giải thích link, button, dropdown, tab hoặc scroll như một khóa học tin học.
`Ctrl+F` chỉ là mẹo phụ, không phải đường tìm nội dung duy nhất.

### 6.2 OCR cơ bản

Giải thích các nguyên tắc:

- OCR chuyển nội dung nhìn thấy trên trang PDF thành dữ liệu có thể tìm kiếm,
  kiểm tra và chỉnh sửa.
- `Metadata` lấy các trường nghiệp vụ quan trọng; `OCR toàn văn` đọc nội dung
  trang theo page scope được hỗ trợ.
- Confidence là tín hiệu hỗ trợ rà soát, không phải cam kết đúng.
- Evidence/crop cho biết nguồn hình ảnh của field; crop tồn tại không tự chứng
  minh giá trị đã đúng.
- Missing evidence là rủi ro cần kiểm tra, không tự động xóa giá trị và không
  luôn là blocker.
- `Completed with warnings` nghĩa là xử lý đã cho kết quả nhưng vẫn còn điểm cần
  xem; không tương đương thất bại hoàn toàn.

### 6.3 Chuẩn bị PDF

Checklist trước upload:

- chỉ `.pdf`;
- tối đa 15 PDF/job;
- tổng tối đa 200 MiB/job;
- tối đa 100 trang/PDF;
- tên file không trùng trong cùng lần chọn;
- trang không bị xoay/ngược nếu có thể sửa từ nguồn;
- người dùng có quyền xử lý nội dung tài liệu.

Callout dữ liệu bên ngoài:

- Nếu Provider Profile là external, ảnh trang PDF được gửi tới endpoint do máy
  chủ cấu hình.
- Checkbox consent chỉ xác nhận cho job hiện tại.
- Không upload tài liệu nhạy cảm nếu quy định nội bộ chưa cho phép.
- Guide không hiển thị URL, API key, model secret hoặc provider headers.

### 6.4 Chọn Processing Mode

Trình bày decision table:

| Tài liệu đang có | Processing Mode | Giải thích đơn giản |
|---|---|---|
| Một PDF là một văn bản hành chính | `Văn bản hành chính` | Lấy metadata hoặc OCR toàn văn của văn bản |
| Một PDF là bìa hồ sơ | `Bìa hồ sơ` | Dùng schema trường dành cho Bìa |
| Một PDF chứa bìa và nhiều văn bản bên trong | `Hồ sơ gộp` | Hệ thống phân đoạn từng trang, user xác nhận trước khi trích xuất |
| Nhiều PDF: file đầu là bìa, các file sau là từng văn bản | `Hồ sơ gộp` | Hệ thống sắp theo tên file; file đầu là Bìa, mỗi file sau là một Văn bản |

Ví dụ tên file an toàn cho hồ sơ nhiều PDF:

```text
001_Bia.pdf
002_Van_ban_01.pdf
003_Van_ban_02.pdf
```

Giải thích tiếp:

- Provider Profile do máy chủ quản lý; user không nhập URL/key/model.
- `Metadata nhanh`: phù hợp khi cần các trường nghiệp vụ.
- `OCR toàn văn`: đọc toàn bộ trang thuộc scope.
- `Tự động`: trang đầu lấy header, sau đó tìm nhóm chữ ký từ cuối về đầu.
- `Giới hạn trang ứng viên` chỉ là trần số trang được thử trong
  `Metadata + Tự động`; không phải tổng số trang PDF.

### 6.5 Tạo job OCR đầu tiên

Tutorial chính dùng một PDF là một `Văn bản hành chính`, task `Metadata` và page
scope `Tự động`. Đây là đường ngắn nhất để học upload → chạy → rà soát → duyệt.
`Bìa hồ sơ` và `Hồ sơ gộp` là hai nhánh sau tutorial; segmentation không chen
vào bài đầu tiên.

Các bước hiển thị đúng thứ tự UI:

1. Mở `New OCR`.
2. Chọn `Văn bản hành chính`.
3. Chọn `Metadata`, `Tự động`; kiểm tra Provider Profile và giới hạn trang ứng viên.
4. Chọn từng PDF hoặc chọn một thư mục PDF.
5. Kiểm tra số file, dung lượng và tên file.
6. Nếu có external consent, đọc nội dung rồi tick xác nhận.
7. Bấm `Bắt đầu OCR` đúng một lần.
8. Browser chuyển tới Job detail; chờ trạng thái hoặc thao tác được yêu cầu.

Callout:

- Nút Start disabled thường do chưa chọn file, Provider Profile chưa ở trạng
  thái cấu hình có thể dùng hoặc chưa consent. Readiness vẫn được backend kiểm
  tra khi start.
- Không refresh/bấm Start liên tục để “làm nhanh hơn”.
- Job chạy ở server; quay lại `Jobs` để mở job đang xử lý.

### 6.6 Trạng thái job

Không bắt người mới học mọi internal status. Nhóm thành các trạng thái nghiệp vụ:

Dashboard chia số liệu thành `Trạng thái công việc` (Tổng, Đang xử lý, Hoàn
thành, Lỗi) và `Khối lượng nội dung` (Tài liệu, Số trang, Số hiệu chỉnh). Một
dòng `Kết quả đang lọc` áp dụng cho cả hai nhóm. Progress bar chỉ xuất hiện với
job đang xử lý; job đã kết thúc dùng trạng thái và số liệu cuối, còn `Xóa` nằm
trong menu `···` và vẫn yêu cầu xác nhận.

| Nhóm hiển thị | Status liên quan | Người dùng nên làm gì |
|---|---|---|
| Đang chuẩn bị | `uploading`, `ready`, `starting`, `queued` | Chờ; không tạo job trùng |
| Đang xử lý | `segmenting`, `extraction_starting`, `running`, `cancelling` | Theo dõi progress; chỉ Cancel khi thật sự muốn dừng |
| Cần xác nhận cấu trúc | `awaiting_segmentation_review`, `segmentation_confirmed` | Kiểm tra boundary/type, xác nhận rồi Continue |
| Hoàn thành | `completed` | Mở Review hoặc Artifacts |
| Hoàn thành có cảnh báo | `completed_with_warnings` | Mở Review queue và xử lý warning/blocker |
| Không tiếp tục | `error`, `cancelled`, `interrupted` | Đọc lỗi an toàn; sửa nguyên nhân rồi Rerun nếu phù hợp |

Giải thích rõ:

- progress là dữ liệu server đã persist, không phải animation ước lượng;
- refresh chỉ tải lại trạng thái;
- Cancel không thể resume job cũ;
- Rerun tạo job mới và giữ job nguồn bất biến.

### 6.7 Xác nhận cấu trúc hồ sơ

Áp dụng khi job yêu cầu structure review:

1. Xem thumbnail và range trang của từng segment.
2. Chọn `Bìa`, `Văn bản` hoặc `Loại trừ` theo lựa chọn UI cho phép.
3. Dùng `Tách trước trang` khi hai tài liệu bị gộp.
4. Dùng `Gộp phần trước` khi một tài liệu bị tách nhầm.
5. Đổi mọi `Chưa phân loại` thành loại hợp lệ hoặc Excluded.
6. Xác nhận từng PDF hoặc `Xác nhận tất cả PDF`.
7. Khi trạng thái đã confirmed, bấm `Tiếp tục trích xuất`.

Quy tắc cần giải thích bằng ví dụ:

- segment phải phủ liên tục mọi trang, không gap/overlap;
- `Loại trừ` chỉ dùng cho trang trắng/phân cách phù hợp;
- với nhiều PDF, UI chỉ cho Bìa/Văn bản;
- conflict nghĩa là dữ liệu đã thay đổi ở nơi khác:
  - `Giữ bản nháp` dùng revision mới nhưng giữ chỉnh sửa;
  - `Tải lại và bỏ bản nháp` dùng dữ liệu server.

### 6.8 Rà soát, sửa và duyệt

Luồng chuẩn:

1. Mở job terminal hoặc `Hàng đợi rà soát`.
2. Chọn đúng document, trang và field.
3. So sánh giá trị OCR với ảnh/crop hoặc `Xem trang nguồn`.
4. Xem confidence, source, suggestion và warning.
5. Sửa scalar value nếu OCR sai.
6. Dùng suggestion chỉ sau khi kiểm tra nguồn.
7. Nếu cần, vẽ Manual crop làm evidence bổ sung.
8. Xử lý hết blocker.
9. Bấm `Lưu và duyệt`.

Thông điệp bắt buộc:

- UI không có trạng thái “đã lưu correction nhưng chưa duyệt”.
- `Lưu và duyệt` là một thao tác nguyên tử.
- Draft trong browser chưa được persist cho tới khi Save and approve thành công.
- Blocker ngăn duyệt; risk/warning yêu cầu cân nhắc nhưng không luôn ngăn duyệt.
- Field legacy không phải scalar có thể chỉ đọc.
- Manual crop là evidence, không tự sửa giá trị OCR.
- Nếu có revision conflict, user chọn giữ draft hoặc dùng server value; không
  âm thầm ghi đè.

CTA:

- `Mở hàng đợi rà soát` → `/documents?triage=needs_review`;
- `Xem công việc đang xử lý` → `/?status=active`.

### 6.9 Kết quả sau khi hoàn thành

Giải thích vai trò từng nơi:

- **Overview:** tình trạng và số liệu chính của job.
- **Review:** kiểm tra/sửa/duyệt document.
- **Artifacts:** file kết quả, ảnh trang, crop và corrected JSON khả dụng.
- **Logs trong Job detail:** log an toàn của riêng job.
- **Tổng quan vận hành:** việc cần xử lý, chất lượng và hiệu suất tổng hợp.
- **Processing logs:** Safe Events để lọc lỗi/warning; thuộc Công cụ hệ thống.
- **Sizing & Cost:** đo token/cost/capacity; là chức năng nâng cao, không cần cho
  job OCR đầu tiên.
- **Code catalog:** dữ liệu mã quản trị; người mới không cần sửa nếu không được
  giao nhiệm vụ.

Không mô tả benchmark/cost unavailable như số zero hoặc kết luận hiệu năng.

### 6.10 Lỗi và cách phục hồi

| Tình huống | Ý nghĩa đơn giản | Hành động đề xuất |
|---|---|---|
| Chỉ chấp nhận PDF | File không đúng định dạng | Chọn lại `.pdf`; không đổi đuôi ảnh thành PDF giả |
| Vượt giới hạn file/dung lượng/trang | Input lớn hơn contract | Chia thành job hợp lệ hoặc chuẩn bị lại PDF |
| Provider chưa cấu hình | Máy chủ chưa có profile sử dụng được | Liên hệ operator; không nhập URL/key |
| Provider chưa sẵn sàng | Readiness check chưa pass | Giữ file đã chọn, kiểm tra lại sau hoặc liên hệ operator |
| Worker unavailable | Hệ thống xử lý nền chưa sẵn sàng | Không tạo nhiều job trùng; chờ operator khôi phục rồi retry |
| Completed with warnings | Có kết quả nhưng cần rà soát | Mở Review queue, xử lý blocker/warning |
| Missing evidence | Không có crop tự động hợp lệ | Xem full source page hoặc tạo Manual crop |
| Segmentation conflict | PDF đã được sửa ở phiên khác | Chọn giữ draft hoặc reload theo nhu cầu |
| Interrupted | Job active bị gián đoạn và không auto-resume | Dùng Rerun sau khi hệ thống ổn định |
| Correction conflict | Dữ liệu server đã đổi | So sánh draft/server rồi chọn rõ ràng |

Không hướng dẫn user chỉnh Redis, restart container, sửa file JSON hoặc dùng
developer tools của browser.

### 6.11 FAQ

Dùng native `<details>/<summary>`, mặc định đóng. Tối thiểu gồm:

1. OCR có đảm bảo đúng 100% không?
2. Tại sao nút Bắt đầu OCR bị disabled?
3. Tôi có thể đóng browser khi job đang chạy không?
4. Refresh có chạy lại OCR không?
5. `Completed with warnings` khác `Error` thế nào?
6. Tại sao có giá trị nhưng không có crop evidence?
7. Tôi sửa field rồi nhưng chưa thấy lưu?
8. Khi nào dùng Manual crop?
9. Rerun có sửa job cũ không?
10. Vì sao Hồ sơ gộp yêu cầu xác nhận cấu trúc?
11. Tôi có thể upload ảnh hoặc ZIP không?
12. Tôi nên báo operator thông tin nào khi gặp lỗi?

Câu trả lời sự cố chỉ được yêu cầu user cung cấp job ID, status, timestamp và safe
error code/message. Không yêu cầu gửi API key, provider URL, raw response hoặc
toàn bộ tài liệu nhạy cảm.

## 7. Parameter reference

### 7.1 Nguồn chuẩn và bảo trì

Giai đoạn 0 phải audit UI hiện hành, generated OpenAPI và i18n để lập inventory
đầy đủ. Không hỏi user về fact có thể đọc từ code. Mọi control, trạng thái, chỉ
số hoặc giá trị user-visible trong phạm vi V1 phải có đúng một entry chi tiết.

Khi UI đổi nhãn, giá trị chọn, mặc định, giới hạn hoặc ý nghĩa, cùng thay đổi đó
phải cập nhật reference. Guide chỉ mô tả hành vi đã tồn tại và kiểm chứng được;
không trình bày chức năng dự kiến như đã sử dụng được.

Focused checks phải khóa:

- parity cấu trúc VI/EN;
- ID/anchor duy nhất và tồn tại;
- link nội bộ trỏ đúng target;
- nhãn kỹ thuật khớp UI;
- không có link/giá trị secret hoặc dữ liệu runtime bị sao chép.

Không xây cơ chế đồng bộ/CMS riêng. Type nhỏ trong content module và code review
là đủ.

### 7.2 Giá trị ổn định và giá trị động

Chỉ ghi cứng enum và giới hạn ổn định thuộc contract, ví dụ 15 PDF/job,
200 MiB/job và 100 trang/PDF. Reference không sao chép:

- Provider Profile/configuration hiện hành;
- giá provider và tỷ giá hiện hành;
- token, cost, sample count hoặc benchmark hiện hành;
- throughput, percentile, capacity hoặc snapshot hiện hành.

Reference giải thích ý nghĩa, đơn vị, công thức, điều kiện `Unavailable` và cách
đọc. Giá trị thực luôn xem tại Upload, Job detail hoặc `/sizing`.

### 7.3 Inventory bắt buộc theo nhóm

| Nhóm | Tối thiểu phải giải thích |
|---|---|
| Upload | PDF-only, file/folder picker, tên trùng, số file, byte, số trang, consent và Start disabled |
| Processing | Processing Mode, Provider Profile, configured/reachable/ready, `Metadata`, `OCR toàn văn`, `all`, `auto`, `first,last`, giới hạn trang ứng viên |
| Job | status, progress, active/waiting/terminal, Cancel, Rerun mode, delete eligibility, stale/refresh |
| Structure | source PDF, segment, Bìa/Văn bản/Loại trừ, page range, split/merge, revision, conflict, confirm và Continue |
| OCR result | field/value, logical document type, source page/text, confidence, bbox/evidence, evidence reason, suggestion và validation warning |
| Review | browser draft, correction, original value, Manual crop, warning/risk/blocker, revision conflict, review status và `Lưu và duyệt` |
| Report/artifact | Overview, Review queue, report metric, artifact kind/availability, corrected JSON, job log và Safe Event |
| Sizing/Cost | filters, measurement unit, operation/attempt, token/byte/latency/resource usage, coverage, billing certainty, price/exchange, fingerprint, sample gate, percentile, workload, capacity, retention, snapshot và export |
| Glossary | mọi thuật ngữ kỹ thuật xuất hiện trong hai route, bắt đầu bằng nghĩa nghiệp vụ |

`Codes`, `Processing Logs` và `System Monitor` chỉ có entry giới thiệu ngắn về
mục đích, vị trí và lúc cần operator; không mở rộng thành tài liệu quản trị.

### 7.4 Sizing & Cost

Reference phải giúp user đọc và sử dụng kết quả, không tự đưa khuyến nghị mua
sắm khi evidence chưa đủ:

- bộ lọc Provider Profile, task, Processing Mode, UTC start/end, unit, số job và
  timezone áp dụng cho cùng tập dữ liệu KPI, biểu đồ và bảng; Provider Profile
  là dropdown gồm cấu hình hiện hành và identity lịch sử chỉ để lọc;
- giải thích input/output token, bytes, latency, service time, throughput,
  percentile, coverage, billing certainty và capacity;
- giải thích measurement fingerprint, benchmark fingerprint và vì sao sample
  không tương thích không được trộn;
- giải thích gate preview `n=1`, comparison token theo job `n≥2`, chuỗi thời
  gian `n≥5` chỉ khi có bucket thời gian, P95/capacity screening `n≥20`;
- `Unavailable`, `insufficient` hoặc partial cost phải giữ nguyên ý nghĩa, không
  chuyển thành `0`, chart hoặc verdict giả;
- phân biệt `Known cost` lịch sử cần Price Profile khớp chính xác provider,
  model và thời điểm operation với `ước tính theo giá mới nhất` dùng profile
  active mới nhất cùng identity; popup Chi tiết nêu VND, nguồn/thời điểm tỷ giá,
  coverage và sensitivity ±1%;
- nêu quyết định nào mỗi mức evidence hỗ trợ và khi nào phải chờ benchmark thật;
- không khẳng định GPU/provider/cấu hình cụ thể nếu thiếu sample tương thích.

Phải có công thức và ví dụ số giả lập, ghi rõ không phải báo giá:

1. cost operation từ input/output token và đơn giá tương ứng;
2. quy đổi tiền tệ từ tỷ giá user đã xác nhận;
3. tổng hợp operation → document → job → khoảng thời gian;
4. capacity từ throughput/latency đã đo và số worker;
5. ví dụ `Unavailable` do thiếu usage, thiếu mẫu hoặc fingerprint không khớp.

Reference cũng phải giải thích luồng tạo Price Profile: chọn Provider Profile và
model liên kết từ dropdown do backend cấu hình, chọn Vietcombank, Agribank,
VietinBank, Techcombank, BIDV hoặc ECB, lấy bản Preview từ allowlist nguồn chính
thức, kiểm tra URL/thời điểm/đơn vị rồi xác nhận trước khi lưu. Nếu có tỷ giá
thực tế/hợp đồng từ hóa đơn/sao kê, user bật manual override, nhập rate lớn hơn
0 và vẫn xác nhận lại.
UI hiện profile active mới nhất; profile cũ/archived nằm trong lịch sử thu gọn và
có thể restore. Overview/Scenario phải phân biệt billing currency gốc với display
currency ước tính, đồng thời hiện coverage và sensitivity ±1%.
Provider/model được chọn từ dropdown; các ô giá/tỷ giá để trống trước khi nhập
hoặc lấy gợi ý. Version mới thay version cũ cùng provider/model, và số lượng lịch
sử không tính profile hiện dùng.
Trong Scenario, `hệ số tải đỉnh = 1,5` nghĩa là tải cao điểm bằng 1,5 lần tải
trung bình; `dự phòng = 0,25` nghĩa là cộng thêm 25% năng lực. Tooltip giữ phần
giải thích này khỏi làm form dài. Chỉ lưu snapshot sau khi Preview đã được tính.
Không suy model từ tên Provider Profile, không tự xác nhận và không biến lỗi
nguồn thành giá `0`.

### 7.5 Glossary

Tối thiểu gồm `PDF`, `OCR`, `Job`, `Document`, `Page`, `Processing Mode`,
`Provider Profile`, `Metadata`, `OCR toàn văn`, `Page scope`, `Confidence`,
`Evidence`, `Source page`, `Suggestion`, `Correction`, `Manual crop`, `Warning`,
`Risk`, `Blocker`, `Artifact`, `Safe Event`, `Rerun`, `Interrupted`,
`Measurement`, `Token`, `Cost`, `Fingerprint`, `Percentile`, `Throughput`,
`Capacity` và `Unavailable`.

Mỗi định nghĩa tối đa hai câu, bắt đầu bằng nghĩa nghiệp vụ trước tên kỹ thuật.

## 8. Điểm vào hướng dẫn

V1 dùng một mục `Hướng dẫn sử dụng` / `User guide` cố định trong sidebar. Không
lặp `View guidance` trên Upload, Job detail, Structure Review, Review hoặc
Sizing & Cost. Các anchor trong `/guide` và `/guide/reference` vẫn giữ ổn định
cho bookmark và liên kết trực tiếp.

## 9. Ảnh minh họa

Ảnh chỉ dùng nơi bố cục UI khó diễn đạt bằng chữ; reference không chụp từng tham
số vì text/anchor là nguồn chuẩn.

### 9.1 Bộ ảnh V1

Đúng 5 ảnh sanitized:

1. Upload với `Văn bản hành chính` + `Metadata` + `Tự động`;
2. Job detail với status/progress;
3. Review workspace với field, evidence, warning và `Lưu và duyệt`;
4. Structure Review của một hồ sơ gộp;
5. Sizing & Cost tại tab Scenario với Price Profile, nguồn tỷ giá và hồ sơ hiện dùng.

### 9.2 Quy tắc asset

- Lưu tại `frontend/public/guide/`.
- Dùng fixture giả lập/sanitized; không có text tài liệu thật, hostname, path,
  username, API key, provider URL hoặc job ID thật.
- Capture cùng theme, VI và viewport `1440×900`; crop vào vùng cần chỉ dẫn.
- Dùng WebP/PNG tối ưu, có `width`/`height`, caption và alt text mô tả hành động.
- Không chèn chữ nhỏ trực tiếp vào ảnh nếu cùng nội dung có thể viết bằng HTML.
- Ảnh lỗi phải không làm mất nội dung hướng dẫn; text luôn là nguồn chính.
- Mỗi thay đổi UI làm sai vị trí/control trong ảnh phải cập nhật ảnh hoặc bỏ ảnh
  trước khi release.
- Dùng một bộ fixture giả lập nhất quán cho tutorial, reference và ảnh: một văn
  bản hành chính, một Bìa, một Hồ sơ gộp có trang phân cách và số token/cost
  minh họa. Không dùng job ID, cơ quan, con người, tài liệu hoặc giá provider thật.

## 10. VI/EN và quy tắc viết

- Tiếng Việt mặc định, đầy đủ dấu và UTF-8.
- Mọi section, CTA, alt text, FAQ và glossary phải có VI/EN parity.
- Giữ nguyên identifier kỹ thuật khi cần: `PDF`, `OCR`, `Metadata`,
  `Processing Mode`, `Provider Profile`, `Save and approve`, `Rerun`.
- Lần đầu dùng thuật ngữ phải kèm nghĩa đơn giản.
- Một câu chỉ hướng dẫn một hành động chính.
- Dùng động từ ở đầu bước: `Mở`, `Chọn`, `Kiểm tra`, `Bấm`, `Chờ`.
- Không dùng “đơn giản”, “chỉ cần” hoặc “hiển nhiên” để mô tả thao tác người mới
  có thể chưa biết.
- Không hứa OCR chính xác tuyệt đối, tiến độ giả hoặc thời gian hoàn thành cố định.
- Copy lỗi trong guide phải khớp semantic hiện tại của `safeError`/status UI,
  không sao chép raw provider response.

## 11. Thiết kế responsive và visual

### Desktop `1440×900` và `1366×768`

- Giữ sidebar tối hiện tại.
- Content guide có `max-width` đọc dễ, không kéo dòng văn bản hết toàn bộ màn hình.
- Layout hai cột: mục lục khoảng 220–260 px, nội dung chính co giãn.
- Quick start 4 card một hàng tại 1366/1440 nếu không ép chữ quá hẹp.
- Section cách nhau bằng khoảng trắng và hairline; không bọc mọi đoạn vào card.
- Warning/caution dùng màu và icon nhưng vẫn có text label; không phụ thuộc màu.

### Mobile `390×844`

- App sidebar giữ menu hamburger hiện tại.
- Chọn `User guide` phải đóng mobile menu.
- Header/CTA xếp dọc khi thiếu chỗ.
- Mục lục chuyển thành `<details>`.
- Quick start và decision table xếp một cột hoặc cuộn trong `.table-scroll`.
- Ảnh co theo container, không có fixed width.
- Không overflow ngang ở document root.

### Density

- Guide thoáng hơn Dashboard nhưng vẫn dùng cùng font, button, panel, notice,
  focus ring và màu nền.
- Mỗi section không có quá một CTA primary.
- FAQ dùng divider thay vì nhiều card lồng nhau.
- Tránh icon trang trí không truyền đạt ý nghĩa.

## 12. Accessibility

- Một `<h1>`, heading tăng tuần tự và landmark `<nav>` cho mục lục.
- Có skip link hoặc cho phép focus trực tiếp nội dung guide theo shell hiện tại.
- Anchor target có `tabIndex={-1}` khi cần focus sau điều hướng.
- Native `<details>/<summary>` thao tác được bằng keyboard.
- Mọi link có tên mô tả đích; không dùng `Bấm vào đây`.
- Alt text mô tả mục tiêu thao tác, không chép lại caption.
- Callout có text, không chỉ icon/màu: `Lưu ý` dùng tông xanh trung tính;
  `Cẩn trọng` trong reference dùng tông vàng cam riêng.
- Focus ring hiện rõ trên sidebar, TOC, CTA, summary và các link nội bộ.
- Tuân thủ `prefers-reduced-motion`; không smooth-scroll bắt buộc.
- Kiểm tra zoom 200% và reflow; nội dung vẫn đọc được, không che CTA.

## 13. Data safety và compatibility

- `/guide` và `/guide/reference` không fetch job, document, report, code,
  sizing hoặc telemetry.
- Không persist guide state ngoài language hiện có.
- Không đổi `/api/*`, generated types, durable job data hoặc old-job reader.
- Không thêm auth/identity.
- Link tới guide không gửi job/document ID vào URL.
- Ảnh và ví dụ phải sanitized.
- Các route hiện có và bookmark không đổi.
- Guide không được hướng dẫn hành vi trái contract: upload ảnh/ZIP, retry toàn
  job tự động, resume job interrupted, saved correction chưa duyệt hoặc sửa
  provider URL/key từ browser.

## 14. Cấu trúc triển khai đề xuất

| File | Thay đổi |
|---|---|
| `frontend/app/guide/page.tsx` | Route, semantic layout, TOC, quick start, CTA và section renderer |
| `frontend/app/guide/reference/page.tsx` | Parameter reference, TOC nhóm và entry renderer |
| `frontend/app/guide/content.ts` | Nội dung VI/EN dùng chung; không import API hoặc React component |
| `frontend/app/app-shell.tsx` | Thêm `/guide` vào cuối navigation chính; active state và đóng mobile menu |
| `frontend/lib/i18n.ts` | Chỉ thêm nhãn navigation/chung cần tái sử dụng; không nhét toàn bộ guide vào dictionary global |
| `frontend/app/globals.css` | Guide layout, TOC, quick-step, callout và responsive |
| `frontend/public/guide/*` | Đúng 5 ảnh sanitized |
| `frontend/tests/e2e/smoke.spec.ts` | Hai route, nav, anchor, VI/EN, sidebar, mobile và accessibility |
| `frontend_plan.md` | `FE-X18` status/gate và backlink tới file này |
| `implementation_plan.md` | `BE-X18` là `N/A`, không thêm API/schema |
| `README.md` | Chỉ thêm link nếu README có mục tài liệu cho end user; không chép nội dung guide |

`content.ts` chỉ cần type nhỏ bảo đảm VI/EN có cùng section/parameter IDs. Hai
route dùng chung primitive renderer khi thực sự trùng; không tạo generic
documentation framework.

## 15. Kế hoạch triển khai

### Giai đoạn 0 — audit nội dung

1. Dùng CodeGraph/AST và generated OpenAPI để kiểm kê mọi tham số user-visible
   trong phạm vi V1; không suy từ tên file.
2. Đối chiếu nhãn, enum, điều kiện render, default và safe error với UI hiện tại.
3. Khóa parameter ID/anchor và mapping VI/EN.
4. Chọn một bộ fixture giả lập nhất quán cho text và 5 ảnh.
5. Giữ `FE-X18`/`BE-X18` cùng trạng thái thật trong hai canonical plan.

### Giai đoạn 1 — route và navigation

1. Tạo `/guide` và `/guide/reference` bằng `AppShell`.
2. Thêm sidebar item, active state và mobile close.
3. Thêm header, CTA, TOC và anchor cho cả hai route.
4. Không thêm API call.

### Giai đoạn 2 — nội dung cốt lõi

1. Quick start, OCR basics và mẹo browser thu gọn.
2. Chuẩn bị PDF và chọn Processing Mode.
3. First OCR và job status.
4. Structure review.
5. Review/approve.
6. Error table và FAQ.
7. Parameter reference đủ 9 nhóm, gồm glossary và Sizing/Cost.
8. Full VI/EN parity.

### Giai đoạn 3 — điểm vào guide và ảnh

1. Giữ một mục guide cố định trong sidebar, không lặp link trên workflow.
2. Capture/sanitize đúng 5 ảnh.
3. Kiểm tra ảnh không chứa dữ liệu nhạy cảm.
4. Không thay CTA chính của các workflow.

### Giai đoạn 4 — responsive và accessibility

1. Kiểm tra 1440×900, 1366×768 và 390×844.
2. Keyboard qua sidebar → TOC → details → CTA.
3. Zoom 200%, focus, headings, alt text và color-independent callout.
4. Kiểm tra back/forward với URL hash và mobile no-overflow.

### Giai đoạn 5 — regression và tài liệu

1. Browser smoke cho route/nav/anchor/VI-EN/sidebar guide.
2. Typecheck/build.
3. OpenAPI check để chứng minh không có schema drift.
4. Đồng bộ `frontend_plan.md`, `implementation_plan.md` và README nếu cần.
5. Chỉ đánh dấu local complete sau khi toàn bộ acceptance pass.

## 16. Test plan

### Route/navigation

- Sidebar có đúng một link `/guide`.
- Link nằm ngoài `Công cụ hệ thống`.
- `/guide/reference` không có sidebar item riêng.
- Active state đúng tại `/guide`, `/guide#...` và `/guide/reference#...`.
- Desktop collapse vẫn có accessible name/title.
- Mobile chọn guide đóng menu.
- Các route cũ không đổi.
- Hai route render được khi mọi `/api/*` request bị chặn.

### Content/deep-link

- Mọi TOC link trỏ tới ID tồn tại và duy nhất.
- Mỗi parameter entry thuộc inventory có anchor ổn định và đủ sáu mục.
- CTA mở đúng `/upload`, `/`, `/documents?triage=needs_review` và
  `/?status=active`; `Tra cứu tham số` mở `/guide/reference`.
- Sidebar mở đúng `/guide`; các anchor đã chốt vẫn truy cập trực tiếp được.
- Reload/back/forward giữ URL hash.
- Không có link tới provider secret, raw response hoặc internal filesystem.

### VI/EN

- Đổi VI/EN cập nhật sidebar và toàn bộ guide ngay.
- Reload giữ language.
- Section/parameter IDs không đổi theo ngôn ngữ.
- Không thiếu key, không render identifier nội bộ thay copy.

### Visual/responsive

- 1440/1366: TOC và content không chồng nhau; quick start giữ nhịp.
- 390: một cột, table cuộn nội bộ, ảnh co đúng và document không overflow.
- Text dài, thuật ngữ EN và filename ví dụ không phá layout.
- Focus ring không bị clip.
- Mục lục luôn có đúng một mục active khi cuộn ở cả guide và reference.

### Accessibility

- Heading hierarchy, landmark và accessible names hợp lệ.
- Keyboard mở/đóng FAQ, browser tips và ví dụ reference.
- Alt/caption đầy đủ.
- Zoom 200% vẫn dùng được.
- Không có action chỉ phân biệt bằng màu.
- Link mở tab mới thông báo đích/hành vi phù hợp.

### Regression gate

Chạy từ repository root:

```powershell
uv run --project backend pytest backend/tests -q
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
python -m compileall -q backend/app
git diff --check
```

Backend tests là regression evidence vì scope frontend-only; không được thêm
backend behavior chỉ để phục vụ guide.

## 17. Acceptance

`FE-X18` chỉ được đánh dấu `LOCAL COMPLETE` khi:

- `/guide` xuất hiện trong sidebar chính, ngoài `Công cụ hệ thống`;
- `/guide/reference` truy cập/deep-link được nhưng không có sidebar item riêng;
- quick start dùng kịch bản Văn bản + Metadata + Tự động và đi đúng tới `/upload`;
- guide giải thích đúng PDF-only, ba Processing Mode, Metadata/Full OCR,
  structure review, status, evidence, correction và Save and approve;
- reference bao phủ mọi tham số user-visible đã audit trong 9 nhóm, mỗi entry đủ
  sáu mục và nhãn khớp UI;
- Sizing/Cost giải thích công thức, provenance, fingerprint, gate `1/2/5/20`,
  `Unavailable` và ví dụ giả lập mà không đưa verdict/mua sắm thiếu evidence;
- nội dung lỗi đưa ra hành động an toàn, không yêu cầu thao tác hạ tầng;
- mọi section, parameter, CTA, alt text, FAQ và glossary có VI/EN parity;
- chỉ có một điểm vào guide cố định trong sidebar; workflow không lặp link;
- đúng 5 ảnh được sanitized và text vẫn đủ nghĩa khi ảnh không tải;
- keyboard, focus, headings, alt text, zoom và reduced motion pass;
- layout pass tại `1440×900`, `1366×768`, `390×844`;
- không có API/schema/database/dependency mới;
- full local regression gate pass;
- `frontend_plan.md` và `implementation_plan.md` được đồng bộ trạng thái thật.

Không có user-testing gate riêng. Không phát hành sidebar khi một trong hai route,
bản EN, mục guide, 5 ảnh, accessibility hoặc regression còn thiếu.

## 18. Việc cố ý chưa làm

- Search riêng trong guide: dùng TOC, anchor và browser Find trước; chỉ thêm khi
  guide thực tế quá dài hoặc user research chứng minh khó tìm.
- Guided tour/highlight overlay: chỉ xem xét khi guide tĩnh không đủ.
- Video: chỉ thêm khi có quy trình quay, sanitize, caption và versioning.
- Completion checklist/localStorage: chỉ thêm khi có nhu cầu đào tạo được xác
  nhận; không dùng để giả định user đã hiểu.
- CMS/MDX: chỉ thêm khi nội dung cần được biên tập ngoài chu kỳ release và chi
  phí duy trì đã được chấp nhận.
- Analytics: không thêm nếu chưa có policy dữ liệu và mục tiêu đo cụ thể.

## 19. Scope lock

Các quyết định trên đã được user xác nhận ngày 2026-07-28. Thay đổi scope sau
mốc này phải cập nhật file này trước, rồi đồng bộ status/backlink `FE-X18` và
`BE-X18`.

Trạng thái 2026-07-31: implementation V1 có đủ hai route tĩnh, VI/EN, 12 section
workflow và 9 nhóm reference với 41 entry, một mục guide cố định trong sidebar, không lặp contextual
help trên workflow và 5 ảnh sanitized. Backend 62
tests, typecheck, build/prerender, OpenAPI, compileall và diff check pass.
Playwright đã đi tới đủ 25 test không báo test lỗi nhưng runner Windows không
thoát ở teardown trước timeout; vì acceptance yêu cầu full regression gate,
`FE-X18` vẫn là `IMPLEMENTED; FULL GATE PENDING`, chưa ghi `LOCAL COMPLETE`.
