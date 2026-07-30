# Kế hoạch backend OCR monorepo

Đây là nguồn chuẩn duy nhất cho backend, public contract, durable state, worker,
cutover và bằng chứng Milestone C. Kế hoạch frontend nằm trong
[`frontend_plan.md`](frontend_plan.md).

**Trạng thái kiểm tra lại 2026-07-24:** Repair Gate `BE-X1`–`BE-X3` và
`FE-X1`–`FE-X3` đã pass local. `X8`–`X13` và phần local của `X15` đã pass;
`X14` đã có corrected export,
timing/report thật nhưng còn chờ benchmark fingerprint. `X7` và `X16` còn chờ
bốn fixture, provider/restart thật. Phần có thể kiểm tra local của `X17A`–`X17E`
đã triển khai; `X17F` và Measurement Preview thật còn chờ provider/fixture/server.
Chi tiết nằm tại [`Token_Cal.md`](Token_Cal.md). Các
external gate của Milestone C tập trung tại [`incomlpeted.md`](incomlpeted.md).

**Sidebar re-decoration 2026-07-28:** frontend và backend counterpart tối thiểu
đã hoàn thành local gate. `status=active` dùng chung policy `ACTIVE`, giữ
aggregate/deep-link nhất quán; `62` backend tests, `24` browser checks,
typecheck/build, OpenAPI generation/check, compileall và diff check đều pass.
Contract nằm tại
[`Sidebar re-decoration — backend counterpart`](#sidebar-re-decoration-backend).

**Reliability recheck 2026-07-27:** giữ nguyên minimal OpenAI Chat Completions
payload, timeout mặc định 180 giây và tối đa hai attempt cho mỗi page operation
đủ điều kiện retry. Local gate pass 61 backend tests, 21 browser checks,
typecheck/build, OpenAPI check, compileall và diff check; chưa thay thế các
provider/fixture/server gate còn mở.

Semantic hardening cùng ngày chọn JSON object hoàn chỉnh cuối cùng trong model
content, coi page zero của văn bản hành chính không có metadata header là
`invalid_model_json` trong cùng budget hai attempt, và chuyển job còn
required-field blocker thành `completed_with_warnings`.
Milestone C là
**internal production-like pilot**, không phải customer-production-ready; chỉ ký
sau local contract gate và evidence strong-server. Runtime được vận hành duy nhất
bởi stack Next.js/FastAPI/Celery.

**User guide 2026-07-28:** scope frontend `FE-X18` đã khóa nhưng chưa triển khai.
Backend counterpart `BE-X18` là `N/A`; đặc tả chi tiết nằm tại
[`User_guide.md`](User_guide.md).

**Simple Auth 2026-07-28:** `BE-X19`/`FE-X19` đã triển khai và pass local gate;
live Nginx/direct-port/full OCR smoke còn mở. Đây là shared demo login qua HTTP,
giữ `actor="anonymous"` và độc lập với
sign-off Milestone C. Đặc tả chi tiết nằm tại
[`Simple_Auth.md`](Simple_Auth.md).

## Cách dùng hai kế hoạch

- Backend sở hữu schema, validation, persistence, worker, provider, deployment
  và evidence vận hành; frontend không chép lại các contract này.
- Mỗi mục giao nhau dùng mã `X1`–`X19` và backlink đối xứng. Một mục chỉ được đóng
  khi counterpart đã pass hoặc ghi rõ `N/A` cùng lý do.
- Public schema thay đổi bắt buộc kiểm tra `BE-X3` và `FE-X3`.
- Checkbox/test local không thay thế evidence provider/worker thật trong
  [`BE-C-EVIDENCE`](#be-c-evidence).
- Chỉ giữ việc đang lỗi, chưa làm hoặc regression contract cần bảo vệ; lịch sử
  chi tiết đã hoàn thành thuộc Git history.

| Mã | Backend sở hữu | Frontend counterpart | Joint gate |
|---|---|---|---|
| `X1` | Task, page planner, validation | [`FE-X1`](frontend_plan.md#fe-x1) | UI input đi xuyên suốt tới đúng provider pass/page set |
| `X2` | Parser, page status, safe error | [`FE-X2`](frontend_plan.md#fe-x2) | Partial result vẫn review được và trang lỗi được định vị |
| `X3` | Pydantic/OpenAPI | [`FE-X3`](frontend_plan.md#fe-x3) | Generated types không drift, không có DTO viết tay |
| `X4` | Durable review/report/artifact data | [`FE-X4`](frontend_plan.md#fe-x4) | Workflow dùng dữ liệu thật và reload được |
| `X5` | Runtime/cutover/evidence | [`FE-X5`](frontend_plan.md#fe-x5) | Browser pass qua Nginx/FastAPI/Celery/provider thật |
| `X6` | Biên parity PDF-only | [`FE-X6`](frontend_plan.md#fe-x6) | Cho native folder selection; không port ZIP/ảnh/directory tree hay hạ tầng cũ |
| `X7` | Field evidence do worker sinh | [`FE-X7`](frontend_plan.md#fe-x7) | Job mới có evidence tối thiểu dùng được khi review |
| `X8` | Expected/missing field và prompt | [`FE-X8`](frontend_plan.md#fe-x8) | Field canonical bị bỏ sót vẫn nhập, audit và reload được |
| `X9` | Approval blocker/risk | [`FE-X9`](frontend_plan.md#fe-x9) | Blocker ngăn approve; warning mềm không ngăn |
| `X10` | Rerun snapshot | [`FE-X10`](frontend_plan.md#fe-x10) | Rerun không đổi ngầm profile/task/page scope |
| `X11` | Provider readiness | [`FE-X11`](frontend_plan.md#fe-x11) | Configured và ready/reachable được phân biệt an toàn |
| `X12` | Progress, failure và timeline | [`FE-X12`](frontend_plan.md#fe-x12) | UI chỉ hiện progress/diagnostic/event đã persist |
| `X13` | Document triage và evidence index | [`FE-X13`](frontend_plan.md#fe-x13) | Quick filter/deep-link dùng aggregate backend |
| `X14` | Benchmark, report và export | [`FE-X14`](frontend_plan.md#fe-x14) | Không placeholder; output đã duyệt tải được |
| `X15` | Native URL/interaction support | [`FE-X15`](frontend_plan.md#fe-x15) | Public data hỗ trợ state/utility thật, không dependency mới |
| `X16` | Source PDF và logical documents | [`FE-X16`](frontend_plan.md#fe-x16) | Hồ sơ gộp được phân đoạn, xác nhận và review bền vững |
| `X17` | Provider measurement, sizing contract và durable analytics | [`FE-X17`](frontend_plan.md#fe-x17) | Measurement Preview dùng dữ liệu thật; calculator/capacity chỉ mở sau sample gate |
| `X18` | `N/A` — guide tĩnh, không backend/schema | [`FE-X18`](frontend_plan.md#fe-x18) | Hai route guide/reference khớp contract hiện có và full regression không drift |
| `X19` | Shared credential, signed session, auth/CSRF seam và deployment port closure | [`FE-X19`](frontend_plan.md#fe-x19) | Login/logout/expiry giữ draft; không còn đường host bypass |

## Domain contract

| Thuật ngữ | Nghĩa chuẩn |
|---|---|
| Frontend | Browser Next.js hiện tại dùng typed API, dữ liệu thật và durable state |
| Provider Profile | Lựa chọn OCR do server định nghĩa; public contract chỉ có ID, nhãn, capability và readiness an toàn |
| Processing Mode | Lựa chọn cấp job: `administrative_document`, `dossier_cover` hoặc `combined_dossier`; độc lập với Provider Profile |
| OCR Job | Source PDFs, lifecycle, documents, artifacts, audit và safe events được lưu trong job JSON/artifacts |
| Source PDF | Một PDF nguồn bất biến; trong `combined_dossier` nhiều PDF tương ứng đúng một logical document và có proposal/confirmation riêng |
| Review Evidence | Source/confidence/crop/artifact có provenance do worker hoặc review flow ghi |
| Approval Blocker | Safe code do backend tính; bắt buộc xử lý trước khi document được duyệt |
| Review Risk | Aggregate typed phục vụ triage; không được client suy ra từ dữ liệu partial |
| Progress Snapshot | Stage/count/detail an toàn đã persist; không phải phần trăm client nội suy |
| Benchmark Sample | Timing/resource sample gắn fixture/config fingerprint tương thích |
| Provider Operation | Một HTTP attempt an toàn, khóa bởi `(operation_id, attempt)` và persist trước/sau provider call |
| Measurement Fingerprint | Fingerprint config vận hành; không chứa fixture/hardware và cho phép aggregate PDF thường tương thích |
| Sizing Snapshot | Kết quả calculator immutable do user chủ động lưu, kèm input/provenance/sample gate |
| Logical Document | Bìa hoặc văn bản nghiệp vụ thuộc đúng một source PDF; persist trong `job.documents[]` với `logical_document_type` |
| Code Catalog | Danh mục mã có revision, lưu atomic tại `OCR_DATA_DIR/_codes.json` |
| Safe Event | Event typed và sanitized; không phải raw provider log hoặc stack trace |
| Unavailable | Dữ liệu không tồn tại/không truy cập được; không được thay bằng `0` hoặc số liệu giả |

Mức ưu tiên: `P0` ảnh hưởng tính đúng/review và phải đóng trước Milestone C;
`P1` ảnh hưởng năng suất vận hành; `P2` là polish/analytics chỉ làm sau dữ liệu
thật. Không xem fixture tham khảo hoặc browser mock là bằng chứng đóng `X16`.

## Invariant đã khóa

### PDF và durable state

- Chỉ nhận PDF: tối đa 15 file/job, 200 MiB/job, 100 trang/PDF; render 200 DPI.
- Upload phải kiểm tra extension, `%PDF`, cấu trúc, mật khẩu và số trang trước
  dispatch. Một PDF sai làm job lỗi và không gọi provider.
- `OCR_DATA_DIR` job JSON/artifacts là durable truth. Redis chỉ điều phối task;
  không thêm database, Redis AOF/volume hoặc store thứ hai.
- Giữ `/api/*`, artifact URL, filesystem layout và khả năng đọc hai chiều với
  legacy. Đọc job cũ không được tự rewrite.
- Job mới bắt buộc có `processing_mode`; job legacy thiếu field mới giữ
  `null/legacy`, không tự gán mode/schema hoặc áp required-field policy mới.
- `source_pdfs[]` là lớp nguồn additive trước segmentation; `documents[]` vẫn là
  danh sách logical document duy nhất sau xác nhận. Không tạo representation thứ
  hai hoặc để logical document trải qua hai PDF.
- Page render thuộc `source_pdf_id`; crop/evidence phát sinh thuộc
  `logical_document_id`. `page_index` là zero-based trong logical document;
  `source_page_index` là zero-based trong PDF nguồn.

### Provider, lifecycle và error

- FastAPI không render PDF hoặc gọi provider; Celery sở hữu toàn bộ OCR.
- Server giữ URL/key/header/model thật. Job chỉ snapshot provider, model,
  prompt version và external status; external endpoint yêu cầu consent từng job.
- Provider HTTP dùng subset OpenAI Chat Completions tối thiểu:
  `POST /chat/completions`, Bearer auth, `model`, `temperature` và `messages` có
  `image_url`. Prompt/parser hiện có chịu trách nhiệm ép JSON; không gửi
  `thinking` riêng theo vendor và không bắt endpoint hỗ trợ `response_format`.
- Mặc định chỉ có một cấu hình OCR hiện tại. Chỉ mở multi-profile khi có provider
  thứ hai thật; profile luôn do server định nghĩa và readiness probe phải có
  timeout, safe status code, không trả raw response.
- Processing Mode chọn schema/prompt; Provider Profile chọn engine/model và công
  bố mode/task được hỗ trợ. Không suy mode từ profile hoặc auto-detect ở browser.
- `/start` chuyển nguyên tử `ready → starting` đúng một lần. Publish không chắc
  chắn thành `interrupted`; không auto-resume hoặc retry cả job.
- `combined_dossier` dùng lần lượt các state `ready`, `starting`, `segmenting`,
  `awaiting_segmentation_review`, `segmentation_confirmed`,
  `extraction_starting`, `running` và terminal. Hai state chờ sống qua restart;
  state active thành `interrupted` và không auto-resume.
- Segmentation tạo đúng một operation/page trên toàn bộ PDF; operation đó dùng
  retry rule có tối đa hai attempt. Page lỗi provider thành `unclassified`; render lỗi mới block. Mỗi
  source PDF xác nhận bằng revision; khi tất cả đã xác nhận, backend persist trước
  rồi dispatch cùng task `ocr.process_job` với expected phase/revision.
- Production worker luôn `--concurrency=1 --prefetch-multiplier=1`.
- Mỗi provider operation/page có tối đa hai attempt tổng cộng. Sau attempt đầu,
  retry đúng một lần nếu gặp pre-response connection failure, read timeout,
  invalid model JSON hoặc HTTP `429/502/503/504`; lỗi hỗn hợp không làm mới
  budget và `Retry-After` tối đa 10 giây. Không retry HTTP khác, field warning
  cục bộ hoặc cả job. Read timeout mặc định là 180 giây và vẫn cấu hình qua
  `OCR_TIMEOUT_SECONDS`.
- Parser chọn JSON object hoàn chỉnh kết thúc cuối cùng thay vì object đầu tiên
  trong model content. Với văn bản hành chính `metadata + auto`, page zero phải
  có ít nhất một field metadata không thuộc nhóm chữ ký; response rỗng là
  `invalid_model_json` và dùng chung budget hai attempt. Required-field blocker
  làm document/job `completed_with_warnings`, không được ghi clean `completed`.
- Chỉ persist stable safe error. Cấm secret, URL, header, raw provider response,
  unredacted request/response và document text trong log.
- Backend ghi trước dispatch, worker ghi khi active, backend ghi lại sau terminal.
  Cancel dùng marker; stale task phải no-op.

### Measurement, cost và sizing

- Contract chi tiết của `X17` nằm tại [`Token_Cal.md`](Token_Cal.md). Không triển
  khai calculator/chart trước measurement foundation và Measurement Preview.
- Mỗi provider HTTP attempt được persist thành sidecar atomic; khóa chống trùng
  là `(operation_id, attempt)`. Sidecar là nguồn sự thật,
  `job.resource_usage` chỉ là aggregate rebuild được. Usage phải được finalize
  trước parse OCR; invalid OCR JSON vẫn giữ usage/bytes/latency.
- Parser usage chỉ nhận allowlist Chat Completions. Không đoán image token hoặc
  alias provider. Missing/incomplete usage là unavailable và làm giảm coverage,
  không thành zero hoặc partial total giả.
- Readiness HTTP thật được đo như `scope=system`; cache/coalesce 30 giây không
  tạo provider call giả. Điều này chỉ instrument probe hiện có, không mở thêm
  provider call trong FastAPI.
- Per-job operation nằm trong thư mục job; system operation/rollup/transaction/
  snapshot nằm dưới `OCR_DATA_DIR/_sizing/`. `_sizing.json` chỉ giữ catalog có
  revision. Không thêm database/JSONL/store ngoài `OCR_DATA_DIR`.
- Rollup chỉ archive raw sắp bị xóa. Xóa job loại raw sidecar nhưng giữ rollup
  đã khử định danh; mọi cleanup dùng Preview → Confirm, revision/checksum và
  tombstone an toàn. Không auto-delete.
- Job cũ không backfill hoặc rewrite. Mọi PDF có measurement hợp lệ đều có thể
  dùng cho operational sizing; fixture chỉ tạo benchmark tái lập.
- Tách `measurement_fingerprint` khỏi `benchmark_fingerprint`; không trộn config,
  page range hoặc measurement scope không tương thích.
- Cost lịch sử chỉ dùng provider usage + Price Profile versioned. `known_cost`
  không được gọi `total_cost` khi billing chưa chắc chắn; self-host không hiện
  chi phí bằng zero khi chưa có TCO.
- Calculator thuộc backend, dùng nearest-rank và gate tối thiểu 20 compatible
  jobs; cost forecast còn yêu cầu billing certainty ≥95%. Công thức chỉ cho
  capacity screening; SLA đạt cần load test đo queue wait/end-to-end.
- Worker resource sampler đo process/child CPU time, peak RSS, render time và
  working disk; `/system-metrics` của FastAPI không được dùng để suy resource
  của worker/provider host.

### Review và lifecycle action

- Correction kiểm tra `old_value`, lệch trả `409 correction_conflict`; field
  canonical còn thiếu dùng `old_value=null`, provenance `manual`, giữ immutable
  audit. `/corrections` vẫn là một hành động **Lưu và duyệt**, nhưng chỉ approve
  khi backend không còn approval blocker; warning mềm không mặc định là blocker.
- Manual crop là append-only evidence, không tự thay OCR value. Với job prompt
  mới, provider `bbox` dùng tọa độ chuẩn hóa `0..1` và worker tạo ảnh evidence
  chứa nhãn + giá trị cho mọi field trả về. Khi metadata có nhãn mâu thuẫn với
  OCR toàn văn sẵn có, backend xóa bbox/confidence, đánh dấu review và không tạo
  crop sai; bbox legacy/invalid không được dùng và không seed Manual crop.
- Backend công bố ordered `expected_fields`, `required_fields`, typed
  `approval_blockers`/`review_risks` và `review_risk_count` trên từng logical
  document; frontend không hard-code hoặc suy lại policy.
- Schema văn bản có 11 field: `co_quan_ban_hanh`, `so_van_ban`,
  `quoc_hieu_tieu_ngu`, `dia_diem_ban_hanh`, `ngay_ban_hanh`, `loai_van_ban`,
  `trich_yeu`, `quyen_han_ky_thay`, `chuc_vu_nguoi_ky`, `nguoi_ky`,
  `ma_luu_tru`. Schema Bìa có `co_quan_luu_tru`, `khoa`, `nhiem_ky`,
  `tieu_de_ho_so`, `phong_so`, `muc_luc_so`, `ma_luu_tru`, `bat_dau`,
  `ket_thuc`, `ho_so_dvbq`, `so_tai_lieu`, `thoi_han_bao_quan`, `so_trang`.
  `fields.document_type` chỉ là legacy read-only; metadata hệ thống mới dùng
  `logical_document_type`.
- `quyen_han_ky_thay` lấy trọn dòng quyền hạn ký nhìn thấy, ví dụ
  `KT. BỘ TRƯỞNG`, không chỉ lấy `KT.`; chức vụ riêng của người ký như
  `THỨ TRƯỞNG` vẫn thuộc `chuc_vu_nguoi_ky`.
- Required văn bản: `co_quan_ban_hanh`, `so_van_ban`, `ngay_ban_hanh`,
  `trich_yeu`. Required Bìa: `co_quan_luu_tru`, `tieu_de_ho_so`, `ma_luu_tru`,
  `bat_dau`, `ket_thuc`. Missing optional là warning; failed planned page chỉ
  block logical document chứa page đó.
- Required value phải là scalar nonblank; `so_tai_lieu`/`so_trang` nếu có là số
  nguyên dương. Chỉ so `bat_dau ≤ ket_thuc` khi parse chắc chắn; suggestion không
  tự apply và không có LLM validation pass thứ hai.
- Approval độc lập từng logical document; job gộp chỉ `approved` khi Bìa và mọi
  văn bản đều approved, còn lại có thể `partially_approved`. Không truyền field
  tự động giữa Bìa và văn bản con.
- Rerun copy source PDFs và snapshot profile/task/page scope/max-pages của job
  nguồn vào job sạch; không mang correction/crop/approval cũ và không đổi
  `processing_mode`. `reuse_segmentation` yêu cầu xác nhận lại; explicit
  `resegment` bỏ segmentation cũ. Không mutate ownership sau extraction.
- Chỉ xóa `uploading`, `ready` hoặc terminal; không xóa active job.
- Code Catalog dùng atomic replace, process-local lock và revision conflict;
  chưa có nhu cầu distributed lock.

## Kế hoạch đang mở

Các bullet dưới đây là acceptance contract đã được bảo vệ local; phần còn mở
được ghi ngay trong trạng thái của từng mục và đều cần fixture/runtime bên ngoài.

### BE-X1

**Task và page planner — LOCAL COMPLETE; LIVE REPRO PENDING.** Counterpart: [`FE-X1`](frontend_plan.md#fe-x1).

- `vlm_task`, `vlm_pages`, `vlm_max_pages` được validate/persist và worker thực thi
  bằng một planner trung tâm.
- Việc tinh gọn form Upload chỉ đổi presentation: profile duy nhất vẫn là giá
  trị server-owned, consent và payload giữ nguyên; `vlm_max_pages` chỉ hiện khi
  `metadata + auto` và nằm trong cùng field-card Phạm vi trang, đúng phạm vi
  candidate-page hiện hành.
- `full_ocr` phải OCR text trên mọi trang, persist text/status từng trang, rồi
  lấy metadata trên page plan phù hợp. `metadata` chỉ chạy metadata prompt trên
  page plan đã chọn. Lượt metadata của cả hai task gửi cùng prompt image-only;
  transcription của `full_ocr` không được gửi lại provider.
- Dùng đúng một planner trung tâm: `all` lấy mọi trang; `first,last` lấy trang
  đầu/cuối. Với văn bản hành chính, `auto` lấy toàn bộ metadata đầu văn bản từ
  trang đầu, sau đó tìm riêng nhóm `quyen_han_ky_thay`/`chuc_vu_nguoi_ky`/
  `nguoi_ky` từ cuối về đầu và dừng tại trang đầu tiên có đủ chức vụ + người ký;
  nhóm chữ ký cuối cùng luôn thuộc cùng một trang, không trộn theo confidence.
  `max_pages` giới hạn tổng số trang candidate khác nhau, gồm cả trang đầu.
- Prompt chữ ký phải đọc chữ in/đánh máy dù bị con dấu đỏ, chữ viết tay hoặc nét
  ký che một phần, nhưng không lấy chữ trong con dấu làm tên người ký.
- Test tối thiểu: `all/auto/first,last/max`, PDF 1–2 trang, tìm chữ ký ở trang
  giữa, dừng sớm, ownership cùng trang, thứ tự ổn định và số provider call/pass.
- Repro live dùng `63-btc.pdf`, SHA-256
  `5C1C6F9D0E2448832BE88D2CFCF1EF61B4FC77DE1AF7449C37367619E00261BE`, chạy cả
  `metadata` và `full_ocr`, ghi selected pages/status/fields/report nhưng không
  ghi nội dung tài liệu vào log.

`PASS LOCAL CONTRACT` chỉ xác nhận planner/worker/persistence bằng unit và eager
fake-provider. Repro `63-btc.pdf` ở trên là evidence external, được theo dõi tại
`incomlpeted.md#1-x7--field-evidence-trên-bốn-fixture-thật`; chưa có evidence này
thì không được diễn giải `BE-X1` là provider/runtime production-like đã pass.

### Contract local đã hoàn tất — REGRESSION ONLY

<a id="be-x2"></a><a id="be-x3"></a><a id="be-x4"></a><a id="be-x6"></a><a id="be-x8"></a><a id="be-x9"></a><a id="be-x10"></a><a id="be-x11"></a><a id="be-x12"></a><a id="be-x13"></a><a id="be-x15"></a>

`BE-X2`–`BE-X4`, `BE-X6`, `BE-X8`–`BE-X13` và `BE-X15` đã hoàn tất về
logic/workflow và được bảo vệ bởi bộ local checks bắt buộc. Chi tiết triển khai
đã hoàn thành thuộc Git history; invariant tương ứng ở trên vẫn là contract
hiện hành.

### BE-X5

**Strong-server acceptance — BLOCKED bởi P0, evidence PENDING.** Counterpart:
[`FE-X5`](frontend_plan.md#fe-x5).

Chỉ bắt đầu sign-off internal pilot sau khi `X7`–`X11` và `X16` pass local; chỉ
đóng khi có Nginx/Redis/Celery/provider thật, bốn fixture cố định, restart,
compatibility và rollback evidence trong [`BE-C-EVIDENCE`](#be-c-evidence).

### BE-X7

**P0 — Field evidence tối thiểu cho job mới — LOCAL COMPLETE; LIVE EVIDENCE PENDING.** Counterpart:
[`FE-X7`](frontend_plan.md#fe-x7).

Contract typed, worker persistence, provenance trang và coverage aggregate đã
pass local; gate bốn fixture/reload/restart thật chưa có evidence.

Focused local gate còn chứng minh confidence/reason của suggestion được normalizer
giữ lại, provenance luôn do backend gán `provider`, và OpenAPI sinh scalar/
review-reason/nested suggestion-evidence types thay vì `unknown` payload.

- Chuẩn hóa contract nhỏ: `source_text`, `page_index`, confidence nullable,
  typed review reason, suggestion có provenance và `evidence_url` trỏ crop do
  worker tạo từ bbox normalized. Bbox phải bao nhãn + giá trị; bbox thiếu,
  invalid, vùng crop gần như trắng, hoặc `value` mâu thuẫn với `source_text`/
  OCR toàn văn là unavailable. Worker chỉ tạo artifact crop sau khi field đã
  thắng lựa chọn cuối cùng, không để crop trung gian mồ côi.
- `evidence_reason` typed phân biệt `bbox_missing`, `bbox_invalid` và
  `crop_blank`; worker không ghi đè `validation_warning` bằng
  `missing_evidence`. Kiểm tra vùng không trắng chỉ xác nhận artifact có nội
  dung, không chứng minh bbox đúng ngữ nghĩa; việc đó vẫn phải qua review/fixture
  live và Manual crop, không thêm một lượt OCR/provider thứ hai vào đường nóng.
- Worker sinh và persist các dữ liệu trên cho job mới. Normalizer/validation
  dùng rule domain nhỏ, deterministic và test được; không copy nguyên pipeline,
  subprocess runner, retry variants hoặc layout artifact của dự án cũ.
- Artifact/evidence hỏng cục bộ không làm mất field/page tốt. Chỉ mở retry/debug
  richness sâu hơn khi fixture cố định chứng minh contract tối thiểu chưa đủ.
- `missing_evidence` chỉ là review risk, không phải approval blocker: metadata
  hợp lệ vẫn được giữ và có thể duyệt. Không tạo crop phỏng đoán khi thiếu bbox;
  reviewer dùng toàn ảnh trang nguồn hoặc vẽ Manual crop.
- Gate: bốn fixture có field evidence thật, reload/restart giữ nguyên, không chứa
  document text trong log; report coverage phản ánh missing thay vì dựng số.

### BE-X14

**P1 — Benchmark tương thích — LIVE SAMPLE PENDING.** Counterpart:
[`FE-X14`](frontend_plan.md#fe-x14).

- P1: persist timing tối thiểu theo job/pass và fingerprint gồm fixture + Provider
  Profile + task + page scope + DPI/config version; chỉ aggregate sample tương
  thích. Group report theo profile với success/failure, pages, duration/throughput,
  correction/risk/evidence coverage và recent safe errors.
- Fingerprint đã khóa: SHA-256 chữ thường của UTF-8 canonical JSON
  (`sort_keys=true`, separator `,`/`:`) chứa đúng
  `manifest_sha256`, `provider_profile_id`, `task`, `page_scope`, `dpi=200` và
  `config_version` (prompt/config snapshot an toàn, không chứa model URL/key).
  Chỉ tạo/persist fingerprint khi có manifest SHA thật; không sinh sample từ job
  thường hoặc fixture giả.
- P1: cung cấp corrected JSON artifact sau approval với schema/version/job/document
  IDs, corrected values và audit-safe provenance; cấm secret/raw response. Bỏ
  `report_url` tự trỏ lại job page.
- Thiếu sample là unavailable/ẩn, không phải `[]`, `0%` hoặc benchmark giả.
- Gate: sample khác fingerprint không bị trộn; export reload/download được; report
  không trùng Overview và không phụ thuộc dữ liệu client đang tải.

Đã hoàn thành local: worker persist duration cho page pass; report aggregate và
group theo Provider Profile; benchmark thiếu sample trả `null`; approval ghi
atomic corrected JSON và Artifact Manifest tải được; bỏ self-link `report_url`.
Fingerprint/sample thật còn lại được theo dõi tại
[`incomlpeted.md`](incomlpeted.md).
Scope presentation/deep-link mới tại
[`Sidebar re-decoration`](frontend_plan.md#sidebar-re-decoration) đã
`LOCAL COMPLETE 2026-07-28` bằng evidence riêng: active aggregate/filter,
actionable report, URL persistence, responsive regression và full local gate.

### BE-X16

**P0 — Source PDF, Bìa và logical-document segmentation — LOCAL COMPLETE; LIVE EVIDENCE PENDING.** Counterpart:
[`FE-X16`](frontend_plan.md#fe-x16).

- Public `processing_mode` có ba ID `administrative_document`, `dossier_cover`,
  `combined_dossier`; mode mặc định là văn bản hành chính. Hai mode đơn tạo một
  logical document/PDF và bỏ qua segmentation. Với `combined_dossier` nhiều PDF,
  worker sắp source theo tên: PDF đầu là một Bìa trọn vẹn, mỗi PDF sau là một
  văn bản trọn vẹn và không gọi provider segmentation. Một PDF gộp vẫn dùng
  provider để phân đoạn theo trang.
- `source_pdfs[]` giữ source pages/artifact, proposal, confirmation và revision.
  `documents[]` chỉ được tạo từ segmentation đã confirm: đúng một
  `dossier_cover`, ít nhất một `administrative_document`, ranges liên tục, có thứ
  tự, không overlap; mọi source page thuộc đúng một document hoặc `excluded`.
  Cover không bắt buộc ở trang 1.
- Với một PDF gộp, worker phân loại từng page thành `cover`, `document_start`,
  `continuation`, `blank` hoặc `separator`; provider failure thành
  `unclassified`. Với nhiều PDF, proposal lấy trực tiếp từ thứ tự/ranh giới file.
  Reviewer xác nhận từng PDF bằng optimistic revision qua
  `POST /api/jobs/{job_id}/source-pdfs/{source_pdf_id}/segmentation/confirm`.
  UI có thể xác nhận tất cả bằng cách gọi tuần tự endpoint này; backend không có
  bulk-confirm và vẫn kiểm tra revision cho từng source. Folder nhiều PDF chỉ
  cho chọn Bìa/Văn bản; Excluded và Unclassified vẫn thuộc contract một PDF gộp.
  Khi tất cả source confirmed, `/continue` hoặc happy-path confirm chuyển nguyên
  tử `segmentation_confirmed → extraction_starting` và dispatch đúng một lần.
- `vlm_pages`/`vlm_max_pages` áp dụng riêng cho mỗi logical document sau
  segmentation; nhánh một PDF đọc toàn bộ source để phân đoạn. `full_ocr` vẫn xử lý
  toàn bộ trang. Persist counters đơn điệu và call count/duration làm evidence,
  chưa đặt performance SLA hoặc batching ở P0.
- Segmentation bất biến khi extraction bắt đầu. Rerun reuse hoặc resegment tạo
  job mới; source job không đổi. `awaiting_segmentation_review` và
  `segmentation_confirmed` sống qua restart; active X16 trở thành `interrupted`
  khi worker restart và không tự resume.
- Counter `documents` vẫn gồm cả Bìa; backend bổ sung `source_pdf_count`,
  `dossier_cover_count`, `administrative_document_count`,
  `excluded_page_count`. Persisted job cũ và terminal combined job phải đọc được
  mà không bị rewrite hoặc áp schema mới.
- Gate local: parser/partial fallback, gap/overlap/excluded/unclassified,
  per-source revision, duplicate dispatch, restart, rerun modes, legacy read và
  generated contract. Gate live: fixture rõ auto-segment đúng ground truth;
  fixture khó sửa được về ground truth rồi extraction/review/approval thành công.

Đã triển khai local contract/runtime tối thiểu: ba Processing Mode, additive
`source_pdfs[]`, phân loại toàn trang trong cùng task, proposal/revision/confirm,
validation coverage/Bìa/văn bản, materialize vào `documents[]`, Continue,
counters/safe events, cancel/restart boundary và typed OpenAPI. Focused backend
và browser mock đã pass; create/rerun từ chối profile chưa cấu hình hoặc capability
không tương thích, hai waiting state sống qua worker restart, và browser gate kiểm
tra boundary bất kỳ, inline validation, revision conflict cùng Continue. Mục này vẫn mở cho bốn fixture/ground truth, difficult
manual-boundary flow, live provider và deployment rollback evidence.

### BE-X17

**P1 — Token, cost và sizing — LOCAL COMPLETE; LIVE EVIDENCE PENDING.** Counterpart:
[`FE-X17`](frontend_plan.md#fe-x17). Đặc tả chi tiết:
[`Token_Cal.md`](Token_Cal.md).

Triển khai theo thứ tự bắt buộc:

1. `X17A` measurement foundation: attempt sidecar/lifecycle, usage parser,
   readiness system scope, worker resource sampler, aggregate rebuild,
   old-job compatibility và rollup-on-delete.
2. `X17B` Measurement Preview: chạy một PDF thật, đối soát aggregate/sidecar,
   two coverage metrics và lazy drill-down; chưa capacity/SLA verdict.
3. `X17C` aggregation: time/profile/task/mode/page filters, page/document/job
   units, nearest-rank và backend-aggregated series. `/sizing/jobs` dùng cùng
   profile/task/mode/date filters với overview, sort `started_at` mới nhất trước
   và phân trang theo giới hạn UI 10/25/50.
4. `X17D` catalogs/calculator: Price/Workload/Hardware Profile, exchange-rate
   suggestion allowlist và cost/storage/capacity/reliability calculation.
5. `X17E` retention/snapshots: preview/apply cleanup, rollup deletion,
   tombstone/recovery và bounded immutable snapshots.
6. `X17F` evidence: bốn fixture làm reproducible baseline; tối thiểu 20
   compatible jobs mới được capacity screening đầy đủ.

Gate backend:

- Persist `in_progress` trước HTTP và `final` trước OCR parse; restart biến
  attempt dở thành `interrupted`, không auto-call lại và không double count.
- `segmentation` không giả `document_id`; readiness dùng system scope; bytes là
  application payload, không được gọi network traffic đo thật.
- `resource_usage` rebuild từ sidecar; delete/archive/restart/backup giữ rollup
  đúng và idempotent. Job legacy thiếu measurement vẫn đọc được, không rewrite.
- Cost matching theo profile/model/effective time; profile đã dùng immutable/
  archive-only. Tỷ giá fetch on-demand từ fixed allowlist, user xác nhận trước
  khi persist; source lỗi không ảnh hưởng OCR.
- Price suggestion on-demand nhận Provider Profile ID + exact model + exchange
  source, hiện hỗ trợ bảng Pay-as-you-go chính thức MiniMax và ba nguồn tỷ giá
  Vietcombank/Agribank/ECB. Preview giữ source/time/basis, bắt xác nhận trước
  persist; `MiniMax-M3` vượt 512k input giữ billing unknown.
- Calculator từ chối verdict dưới sample/coverage gate, ngoài observed page
  range hoặc khác fingerprint. Scale-out chỉ trả theoretical capacity units cho
  tới khi cluster benchmark thật pass.
- Pydantic/OpenAPI/generated types, focused persistence/recovery/math tests và
  toàn bộ required local checks phải pass trước Preview. Một PDF/bốn fixture/
  20-job gate phải ghi đúng cấp evidence, không nâng nhãn.

`X17` là P1 độc lập và không thay thế `BE-X14` hay tự động trở thành blocker mới
của Milestone C hiện tại. Chỉ evidence thật mới được chuyển trạng thái mục này.

`X17A`–`X17E` đã hoàn tất phần local: provider-attempt/system measurement,
resource sampler/recovery/rollup, aggregate/filter/nearest-rank, catalog và
backend calculator, snapshots, retention Preview → Confirm, generated contract
và `/sizing` drill-down/chart/export. Gate `1/2/5/20` vẫn hiển thị
`unavailable`/`insufficient` trung thực. Chưa đóng toàn bộ `X17`: một PDF thật,
bốn fixture, backup/restart, tối thiểu 20 compatible jobs và cluster scale-out
thuộc `X17F`/live evidence trong [`incomlpeted.md`](incomlpeted.md).

### BE-X18

**N/A — User guide frontend-only; counterpart IMPLEMENTED, FULL GATE PENDING.** Counterpart:
[`FE-X18`](frontend_plan.md#fe-x18). Đặc tả chi tiết:
[`User_guide.md`](User_guide.md).

- `/guide` và `/guide/reference` là route tĩnh, không fetch API.
- Không thêm endpoint, Pydantic/OpenAPI schema, database, durable field,
  permission hoặc backend behavior.
- Nội dung chỉ giải thích public contract/user-visible value hiện có; giá trị
  provider, measurement, price, exchange và capacity động tiếp tục thuộc các
  màn hình/API đang sở hữu dữ liệu.
- Backend tests và OpenAPI check chỉ là regression evidence chứng minh không
  drift; không viết backend behavior để phục vụ guide.
- `BE-X18` không block Milestone C và không thay đổi evidence gate của `BE-X17`.

Regression backend giữ nguyên và pass 62 tests; OpenAPI không drift. Frontend
đã triển khai route/content/sidebar guide/ảnh theo `FE-X18`; browser full-suite
đã chạy tới đủ 25 test không báo test lỗi nhưng Windows teardown chưa thoát sạch
trước timeout, nên không suy diễn đây là live/provider evidence.

### BE-X19

**P1 — Shared demo access gate — LOCAL COMPLETE; LIVE GATE PENDING.** Counterpart:
[`FE-X19`](frontend_plan.md#fe-x19). Đặc tả chi tiết và acceptance:
[`Simple_Auth.md`](Simple_Auth.md).

- Deployment target giữ `http://10.6.18.76:54846`; Nginx sở hữu đúng host bind
  này, còn frontend/backend/Redis/worker không publish host port.
- Một username/password dùng chung; username và `scrypt` password hash nằm trong
  `.env`. Không user database, OIDC, TLS, role, API token hoặc auth service mới.
- FastAPI sở hữu signed `HttpOnly`/`SameSite=Lax` cookie 8 giờ, login/session/
  logout endpoint, dependency chung và CSRF guard. HTTP đã được chấp nhận nên
  cookie không có `Secure`; đây chỉ là demo access gate trong LAN.
- `OCR_AUTH_MODE=disabled|shared`; local test giữ `disabled`, deployment
  `shared` thiếu config phải fail startup.
- Actor OCR vẫn `anonymous`; auth không thêm durable field, không rewrite old
  job và không thay worker/provider flow.
- Login rate limit 10 lần/phút/IP tại Nginx; credential/session secret không vào
  Git, API, job JSON, browser storage hoặc log.
- Public Pydantic/OpenAPI cho auth endpoint là canonical; schema thay đổi phải
  regenerate frontend types.
- `BE-X19` không block Milestone C. Backend và full local regression pass 66
  tests; generated OpenAPI/types, frontend build và 27 browser checks pass.
  Docker/Nginx syntax, exact host bind/direct-port closure và full live OCR smoke
  vẫn cần server có Docker và IP `10.6.18.76`.

<a id="sidebar-re-decoration-backend"></a>
## Sidebar re-decoration — backend counterpart

**LOCAL COMPLETE 2026-07-28.** Counterpart:
[`frontend_plan.md#sidebar-re-decoration`](frontend_plan.md#sidebar-re-decoration).
Đây là phần backend tối thiểu của `BE-X14`/`BE-X15`; navigation, copy, layout và
URL state thuộc frontend.

Evidence: focused active-filter/API checks pass; full gate pass `62` backend
tests, `24` browser checks, frontend typecheck/build, OpenAPI generation/check,
Python compileall và `git diff --check`.

### Public-data contract

- Không thêm endpoint, database hoặc field mới vào `ReportsResponse`.
  `/reports` tiếp tục dùng `GET /api/reports`; số tài liệu cần rà soát lấy từ
  field `triage_counts` trong response của `GET /api/documents`.
- `GET /api/state?status=active` là filter tổng hợp chỉ tại read path:
  chọn job có persisted status thuộc `ACTIVE`. Chuỗi `active` không được persist
  thành job status và các exact-status filter hiện có giữ nguyên.
- Một helper/policy backend dùng chung phải sở hữu semantics active để
  `GET /api/state.metrics.active_jobs`, `GET /api/reports.operations.active_jobs`
  và `status=active` không lệch nhau. Các waiting state
  `awaiting_segmentation_review`/`segmentation_confirmed` không được đổi thành
  active execution state.
- `GET /api/events` đã sở hữu các filter `severity`, `category`, `job_id`,
  `provider_profile_id`, `document_id`, `page_index` và `page`; thay đổi URL
  persistence của `/logs` không yêu cầu backend endpoint khác.
- Report vẫn aggregate toàn bộ job đang được lưu. Không thêm time-range,
  time-series, chart data hoặc benchmark giả để phục vụ re-decoration.
- Dashboard refinement 2026-07-28 chỉ đổi presentation phía frontend: nhóm bảy
  metric thành 4 trạng thái + 3 khối lượng với một scope note, chỉ hiện progress
  cho active job và đưa Delete từng dòng vào menu phụ. Không đổi `/api/state`,
  metric semantics, delete preview/confirm hoặc durable job data.
- Giữ old-job readability, không rewrite persisted job và không đổi filesystem
  layout, artifact URL, safe-event redaction hay Code Catalog persistence.

### Backend acceptance

- Focused API test chứng minh `status=active` gồm mọi status trong `ACTIVE`, loại
  exact/waiting/terminal status ngoài tập, phân trang đúng và không ảnh hưởng
  `status=all` hoặc exact-status filter.
- `state.metrics.active_jobs`, `reports.operations.active_jobs` và số item của
  active filter khớp trên cùng durable fixture.
- `/api/documents` triage và `/api/events` filter tiếp tục trả typed/sanitized
  data; partial frontend failure không yêu cầu backend tổng hợp response mới.
- OpenAPI generation/check, backend tests, frontend counterpart checks,
  compileall và `git diff --check` pass trước khi đánh dấu hoàn thành.

## Thứ tự triển khai parity

0. **Fixture-first:** ghép bốn fixture ngoài Git/data, khóa composition manifest,
   SHA-256 và page-range ground truth trước khi viết segmentation.
1. **Giai đoạn 1 — tính đúng:** `X16` → `X8` → `X7` → `X9` → `X10` → `X11`, mỗi
   mục đi cùng frontend counterpart, generated contract và focused local gate.
2. **Giai đoạn 2 — vận hành:** phần P1 còn lại của `X12` → `X13`;
   progress/failure/timeline trước, triage/deep-link sau.
3. **Giai đoạn 3 — workspace:** frontend evidence/artifact/URL/visual utilities
   của `X13` và `X15`, chỉ dùng dữ liệu backend đã persist.
4. **Giai đoạn 4 — navigation/report — LOCAL COMPLETE 2026-07-28:** đã hoàn thành
   [`Sidebar re-decoration`](frontend_plan.md#sidebar-re-decoration), centralized
   active filter và exact deep-link trước khi đóng scope mới của `X14`/`X15`.
5. **Giai đoạn 5 — đo lường:** `X14` chỉ còn benchmark từ sample live;
   corrected export không chặn Milestone C.
6. **Giai đoạn 6 — sizing:** `X17A → X17F`, measurement-first; Preview một PDF
   trước, aggregation/calculator/capacity sau sample gate.
7. **Giai đoạn 7 — user guide:** `BE-X18` giữ `N/A`; chỉ chạy backend/OpenAPI
   regression cùng frontend `FE-X18`, không mở rộng public contract.
8. **Giai đoạn 8 — shared demo auth:** `BE-X19 → FE-X19`; backend/session seam
   trước, login/draft UX sau, cuối cùng chuyển host port ownership sang Nginx và
   đóng direct-port bypass.

## Milestone C: runbook và deployment rollback

### Điều kiện trước khi chạy

1. `X1`–`X4` vẫn pass; nhóm P0 `X7`–`X11`, `X16`, phần progress/audit X16 kéo từ
   `X12` và counterpart frontend đã pass local contract gate. Local dùng fake
   provider/dispatch/eager flow, không cần Redis, Docker, GPU hoặc provider thật.
2. Chuẩn bị bốn fixture test ngoài Git và `OCR_DATA_DIR`, cùng ground-truth JSON:
   `63-btc.pdf`; Bìa `box_3/Hộp 3/05/Scan_0000.pdf`; hồ sơ gộp rõ từ thư mục `05`
   kèm một blank separator được ghi trong manifest; hồ sơ gộp khó từ thư mục `04`.
   Ghi SHA-256 của PDF, composition manifest và ground truth; không chép field
   value/document text vào ledger.
3. `OCR_DATA_DIR` hiện tại là non-production test data nhưng vẫn phải dừng nhận
   upload, drain worker rồi backup có path, size và checksum trước deployment.

### Khởi động và kiểm tra

```bash
docker compose config
docker compose up -d --build redis backend worker frontend nginx
docker compose ps
docker compose logs --tail=200 backend worker redis nginx
docker compose exec worker celery -A app.workers.tasks:celery_app inspect registered
curl -fsS http://10.6.18.76:54846/health
curl -fsSI http://10.6.18.76:54846/login
curl -sS -o /dev/null -w '%{http_code}\n' http://10.6.18.76:54846/api/state # expected 401
```

Đăng nhập qua browser Nginx `http://10.6.18.76:54846`, chạy `63-btc.pdf` với
`metadata`/`full_ocr`, Bìa với
`metadata`, hồ sơ gộp rõ với cả hai task và hồ sơ gộp khó với `metadata` + manual
boundary correction. Ghi source/document/excluded counts, field/evidence,
approval và observed duration/call count; chưa đặt SLA.

Sau đó restart backend/worker/Redis: terminal job và hai paused state segmentation
vẫn đọc/tiếp tục được; active state thành `interrupted`, stale task không chạy lại.

Diễn tập rollback bằng image/commit triển khai liền trước trên bản sao
`OCR_DATA_DIR`; job cũ phải đọc được mà không rewrite. Chỉ restore backup khi dữ
liệu thực sự hỏng. Gate này chỉ ký **internal pilot** với `actor="anonymous"`;
auth, verified approver và customer-production gate là scope riêng.

## BE-C-EVIDENCE

Đây là ledger bằng chứng Milestone C internal-pilot duy nhất. Điền trên strong
server; không ghi secret, provider URL, raw response, document text hoặc API key.
Local test không thay thế được các mục dưới đây.

### Live OCR workload hiện có — PASS 2026-07-28

Kiểm kê read-only từ `data/jobs/*/job.json`,
`data/jobs/*/provider_operations/*.json` và artifact đã persist, không đọc hoặc
ghi nội dung tài liệu:

- 6 job terminal xử lý 66 PDF/237 trang: 4 `completed`, 2
  `completed_with_warnings`, tổng `failed_pages=0`;
- 137 provider operation đều `success`, HTTP `200`, `usage_status=complete`;
- 781 PNG artifact; 660 metadata field có giá trị, trong đó 544 field có bbox và
  evidence URL;
- 4 job `administrative_document` và 2 job `combined_dossier` nhiều PDF; tất cả
  dùng `metadata + auto`;
- Safe Events có một `page_pass_failed` đã được xử lý thành công; không còn trang
  lỗi ở trạng thái terminal.

Kết luận được chấp nhận: **live OCR workload PASS** và không chặn việc lập kế
hoạch khác. Evidence này chưa bao phủ `full_ocr`, segmentation của một PDF gộp,
correction/approval, topology runtime, backup, restart/interrupted hoặc rollback;
vì vậy sign-off Milestone C tổng thể bên dưới vẫn **PENDING**.

### Build và môi trường

- Date/operator: _pending_
- Commit: _pending_
- Image digests: _pending_
- Host/runtime versions: _pending_
- Sanitized `docker compose config`: _pending_
- Dataset classification: _pending (expected: non-production test data)_

### Bảo vệ dữ liệu và worker cutover

- Uploads paused: _pending_
- Queue drained và worker stopped: _pending_
- `OCR_DATA_DIR` resolved path: _pending_
- Backup path, size, SHA-256: _pending_
- Chỉ một worker sử dụng directory trong lúc cutover: _pending_

### Fixture cố định

| Fixture/task | PDF + manifest/ground-truth SHA-256 | Bytes/pages | Job ID | Segmentation/artifacts/report | Required-field check |
|---|---|---|---|---|---|
| `63-btc.pdf` — metadata + full OCR | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Bìa `05/Scan_0000.pdf` — metadata | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Combined `05` + blank — metadata + full OCR | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Combined `04` difficult — metadata | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

### Runtime gate

- Repair repro `63-btc.pdf` cho hai task: _pending_
- Nginx health/login/API tại `10.6.18.76:54846`: _pending_
- Backend/Redis internal-only: _pending_
- Worker registered `ocr.process_job`, concurrency `1`, prefetch `1`: _pending_
- Upload trên 1 MiB không `413`: _pending_
- Không `worker_unavailable`, duplicate task, secret hoặc raw response trong log:
  _pending_
- Partial-page result, correction reload, crop, approval, rerun, delete: _pending_
- Missing canonical field, blocker/warning và rerun snapshot: _pending_
- Provider configured/reachable/ready probe không lộ secret: _pending_
- Cùng payload chạy current VLM và một Qwen VLM cho metadata/full OCR/segmentation:
  _pending_
- Field evidence tối thiểu của job mới: _pending_
- Ba Processing Mode, capability và readiness gate tại start/continue: _pending_
- Per-page segmentation, monotonic counters và partial `unclassified`: _pending_
- Per-source confirm/revision, gap/overlap/excluded validation: _pending_
- Auto boundary fixture rõ; manual correction fixture khó: _pending_
- Expected/required schema 11/13, typed blockers/risks: _pending_
- Independent document approval và dossier `partially_approved`: _pending_
- Rerun reuse/resegment và source job bất biến: _pending_

### Restart, compatibility và deployment rollback

- Terminal và paused segmentation sống qua backend/worker/Redis restart: _pending_
- Active segmentation/extraction thành `interrupted`; stale task no-op: _pending_
- Persisted old job đọc được mà không rewrite: _pending_
- Image/commit trước đọc được terminal job trên bản sao dữ liệu: _pending_
- Deployment rollback rehearsal: _pending_
- Backup restore required: _pending (expected: no)_

### Lệnh và sign-off

Ghi exact command, timestamp, exit status và sanitized evidence path:

```text
pending
```

- Internal-pilot gate result: **PENDING**
- Approver/date: _pending_

## Lệnh kiểm tra local

```powershell
uv run --project backend pytest backend/tests -q
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
python -m compileall -q backend/app
git diff --check
```

Local checks là contract evidence, không chứng minh chất lượng OCR hoặc live
runtime. Milestone C cũng không phải customer-production approval. Ngoài scope
`BE-X19` đã khóa trong `Simple_Auth.md`, không thêm database, provider SDK, UI
kit, state manager, BFF, WebSocket, auth khác, auto-retention hoặc host agent.

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
