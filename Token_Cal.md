# Kế hoạch Token, Chi phí và Sizing

Đây là đặc tả chi tiết của `X17`. Backend contract và gate nằm tại
[`BE-X17`](implementation_plan.md#be-x17); workflow/UI counterpart nằm tại
[`FE-X17`](frontend_plan.md#fe-x17). `implementation_plan.md` và
`frontend_plan.md` chỉ giữ invariant, trạng thái và backlink; không chép lại
toàn bộ file này.

## 1. Mục tiêu và thứ tự bắt buộc

Module `/sizing` giúp operator:

1. Đo từng provider attempt, trang, logical document, job và system probe.
2. Phân biệt dữ liệu đo, dữ liệu tính và giả định.
3. Phân tích token, latency, payload, lỗi, chi phí và storage.
4. Lập workload scenario và so với cấu hình đã benchmark.
5. Drill-down, export và lưu snapshot đề xuất có provenance.

Áp dụng **measurement-first**:

1. Hoàn thành measurement foundation.
2. Mở Measurement Preview để thử một PDF thật.
3. Chỉ mở aggregation, calculator và capacity screening sau khi đủ gate dữ liệu.

Không dùng tokenizer để đoán token ảnh. `usage` provider không có thì hiển thị
`Unavailable`, không biến thành zero. Một PDF Preview không phải benchmark hoặc
capacity certification.

## 2. Invariant kiến trúc và an toàn

- Giữ PDF-only và luồng Next.js → FastAPI → filesystem → Celery → provider HTTP.
- FastAPI không render PDF hoặc thực hiện OCR page; Celery tiếp tục sở hữu toàn
  bộ extraction/segmentation request. Readiness probe an toàn hiện có của API
  được đo riêng như system operation, không trở thành đường OCR.
- `OCR_DATA_DIR` là durable truth; không thêm database, Redis persistence,
  provider SDK, BFF, WebSocket, auth hoặc host agent.
- Production Celery giữ `--concurrency=1 --prefetch-multiplier=1`.
- Không persist URL, key, header, base64, prompt đầy đủ, raw provider response,
  exception text, document text, hostname, IP, username, path hoặc process list.
- Public field dùng Pydantic v2/OpenAPI; frontend chỉ dùng generated types.
- Job cũ đọc được, không rewrite và không backfill usage/token/bytes/latency.
- Dữ liệu xóa/retention dùng preview, revision conflict và atomic filesystem
  transaction; không tự xóa âm thầm.
- Apache ECharts là chart dependency duy nhất được duyệt cho `/sizing`; không kéo
  theo UI kit, React wrapper hoặc state manager.

## 3. Provider operation

### 3.1 Định danh và lifecycle

`operation_id` định danh một thao tác logic, ví dụ `full_ocr` trên một trang.
Mỗi HTTP attempt có ordinal riêng; khóa chống trùng là
`(operation_id, attempt)`. `provider_calls` đếm từng attempt, không đếm operation
logic.

Trước khi gửi HTTP, persist sidecar `in_progress`. Khi có response/lỗi, atomic
replace thành `final`. Sau restart, sidecar còn `in_progress` thành
`interrupted`, usage `null`, billing state `unknown` và không tự gọi lại.

Ví dụ:

```json
{
  "schema_version": 1,
  "operation_id": "op_...",
  "attempt": 1,
  "scope": "job",
  "job_id": "job_...",
  "provider_profile_id": "local-vlm",
  "provider_config_version": "deployment-2026-07-27",
  "model": "model-safe-name",
  "task": "full_ocr",
  "processing_mode": "administrative_document",
  "source_pdf_id": "source-1",
  "document_id": "document-1",
  "page_index": 0,
  "segmentation_revision": null,
  "status": "success",
  "started_at": "2026-07-27T10:00:00Z",
  "duration_ms": 8432,
  "retry_delay_ms": 0,
  "request_bytes": 1452300,
  "response_bytes": 4280,
  "http_status": 200,
  "retryable": false,
  "usage_status": "complete",
  "usage": {
    "prompt_tokens": 7820,
    "completion_tokens": 1130,
    "reported_total_tokens": 8950,
    "canonical_total_tokens": 8950,
    "cached_tokens": null,
    "reasoning_tokens": null
  }
}
```

### 3.2 Scope và task

- `scope="job"`: OCR attempt gắn job.
- `scope="system"`: readiness probe; `job_id`, source/document/page được phép
  `null`, `task="readiness_probe"`.
- `segmentation`: có source/page/revision nhưng `document_id=null`; không sửa
  lịch sử để gắn document sau khi reviewer đổi boundary.
- `full_ocr`/`metadata` sau confirmation bắt buộc có `document_id`.
- Segmentation chỉ aggregate ở source/job; không phân bổ giả xuống document.

Readiness được cache 30 giây theo Provider Profile và coalesce request đồng thời.
Cache hit trả `checked_at`, `cached=true`, không tạo provider operation. Probe
HTTP thật luôn được đo; `/start`/`/continue` được dùng kết quả `ready` còn mới
trong 30 giây.

### 3.3 Usage parser và validation

Parser chỉ đọc allowlist Chat Completions:

- `usage.prompt_tokens`
- `usage.completion_tokens`
- `usage.total_tokens`
- `usage.prompt_tokens_details.cached_tokens`
- `usage.completion_tokens_details.reasoning_tokens`

Không đoán alias `input_tokens`/`output_tokens`. Provider schema khác cần mapping
và test riêng.

`prompt_tokens` và `completion_tokens` phải là integer không âm; bool không hợp
lệ. Scalar hợp lệ một phần vẫn giữ để audit nhưng sample `incomplete` không được
cộng vào token total/cost. `cached_tokens` và `reasoning_tokens` là tùy chọn.

```text
canonical_total = prompt_tokens + completion_tokens
```

- Thiếu provider total: canonical total mang provenance `Calculated`.
- Provider total lệch: giữ `reported_total_tokens`, đánh dấu
  `usage_inconsistent`, dùng canonical total cho dashboard/đối soát.
- Cached token đã nằm trong prompt; reasoning token đã nằm trong completion,
  không cộng hai lần.
- Cached lớn hơn prompt hoặc component không hợp lệ: loại sample khỏi cost.

Usage phải finalize sau khi nhận response và trước parse OCR. Invalid OCR JSON
vẫn giữ usage/bytes/latency. `429/502/503/504` giữ usage nếu response có trả.

### 3.4 Safe outcome và billing certainty

Chỉ persist outcome allowlist:

- `success`
- `connect_failure`
- `timeout`
- `http_error`
- `invalid_json`
- `interrupted`

Cho phép `http_status`, `retryable`; cấm exception message và response body.

Hai coverage khác nhau:

- **Response usage coverage**: response có complete usage / response đã nhận.
- **Billing certainty coverage**: attempt có chi phí xác định / mọi attempt.

Read timeout, interrupted và response thiếu usage làm giảm billing certainty.
Connect failure trước khi body được gửi không làm giảm response usage coverage.

### 3.5 Thời gian và payload

- Attempt `duration_ms`: monotonic time ngay trước gửi HTTP đến response/lỗi.
- `retry_delay_ms`: thời gian chờ trước attempt kế tiếp.
- `provider_duration_ms`: tổng attempt duration.
- `job_duration_ms`: lifecycle end-to-end riêng; không suy từ tổng request.
- `request_bytes`: UTF-8 byte length của đúng serialized HTTP body, gồm base64.
- `response_bytes`: raw response body bytes.

Bytes trên là **application payload**, không phải TLS/network traffic. Bandwidth
ước tính từ chúng mang nhãn `Calculated`.

## 4. Durable storage, aggregate và recovery

```text
OCR_DATA_DIR/
├── jobs/
│   └── {job_id}/
│       └── provider_operations/
├── _codes.json
├── _sizing.json
└── _sizing/
    ├── system_operations/
    ├── rollups/
    ├── archive_transactions/
    ├── tombstones/
    └── snapshots/
```

- Mỗi attempt là một JSON nhỏ, atomic; không nhét toàn bộ operations vào
  `job.json` và không dùng JSONL.
- Sidecar là nguồn sự thật. `resource_usage` trong job JSON chỉ là cache rebuild
  được.
- Aggregate lưu số final attempt đã tính. Khi không khớp số sidecar final,
  backend rebuild trước khi trả; worker rebuild lần cuối trước terminal.
- Old job thiếu measurement hiển thị `Unavailable — job tạo trước measurement`;
  không đưa vào percentile/sizing và không rewrite khi đọc.
- Rerun old job chỉ đo job mới; source job bất biến.

### 4.1 Job aggregate

`resource_usage` tối thiểu có:

- attempt/success/failure/interrupted counts;
- provider duration, retry delay, request/response payload;
- complete/incomplete/unknown usage counts và hai coverage;
- prompt/completion/canonical/cached/reasoning token;
- breakdown theo task/source/document/page;
- `source_page_count`, `processed_page_count_by_task`, `attempt_count`;
- storage/resource summary khi terminal.

Đơn vị thống kê tách:

- per page: attempt gắn trang;
- per document: `full_ocr` và `metadata` có document;
- per job: document + segmentation + job overhead;
- system overhead: readiness probe.

UI hiển thị `unallocated_overhead`; không ép tổng document bằng tổng job.

### 4.2 Rollup-on-delete

Rollup chỉ archive raw data sắp bị xóa, không nhân đôi dữ liệu live:

- Job còn tồn tại: query job aggregate/sidecar.
- Trước Delete Job: đối soát → archive contribution theo ngày UTC → xóa job.
- System probe chỉ archive khi user cleanup raw.
- Overview kết hợp live data và archived rollup; hai tập không giao nhau.
- Archive transaction có ID và recovery idempotent để crash không double count.

Raw job operation bị xóa cùng job. Historical rollup đã khử định danh vẫn giữ:
token/bytes/latency buckets/count/coverage/fingerprint nhưng không job/source/
document ID hoặc content. UI nói rõ aggregate vẫn tồn tại sau khi job bị xóa.

### 4.3 Retention và xóa

- `system_operation_raw_days=90` mặc định; quá hạn chỉ `eligible`, không tự xóa.
- Chỉ cleanup system attempt final, đã rollup và đối soát; không xóa in-progress
  hoặc dữ liệu chưa archive.
- Rollup không auto-expire.
- Xóa raw/rollup dùng Preview → Confirm, revision/checksum conflict.
- Rollup chỉ xóa theo khoảng ngày UTC nguyên ngày; có action xóa tất cả.
- Benchmark rollup pin mặc định; muốn xóa phải chọn “Bao gồm benchmark đã ghim”.
- Tombstone chỉ giữ thời điểm, date range, bucket/count và checksum an toàn.
- Phục hồi dựa backup `OCR_DATA_DIR`; không duy trì trash store thứ hai.

## 5. Resource measurement và storage

`/system-metrics` tiếp tục mô tả môi trường FastAPI nhìn thấy; không dùng nó để
suy tài nguyên Celery.

Worker có sampler nhẹ mỗi 1 giây khi job active:

- process/child CPU time;
- peak worker RSS;
- PDF render duration;
- job working-disk peak theo phase, không scan mỗi giây.

Chỉ persist aggregate start/end/peak; không time series. Telemetry lỗi thành
`Unavailable`, không làm OCR fail. Không poll GPU mặc định.

Hardware measurement scope là `backend`, `worker` hoặc `self_host_provider`.
Hardware specs self-host là `Operator-declared`; latency/throughput từ run là
`Measured`. User chỉ nhập mô tả CPU/RAM/GPU; throughput, pages/minute, job P95
và stable concurrency chỉ backend benchmark được ghi, không sửa tay. Imported
benchmark giữ `Imported/Assumed` tới khi được xác minh. Không gọi GPU verified
nếu worker không nhìn thấy provider host.

Storage terminal phân loại:

- `source_pdf_bytes`
- `rendered_page_bytes`
- `evidence_bytes`
- `report_bytes`
- `measurement_bytes`
- `other_safe_bytes`
- `total_job_bytes`

Sizing retention dùng P95 `total_job_bytes/job`; peak working space báo riêng.
`artifact retention days` chỉ là sizing assumption, không bật auto-delete job.

## 6. Fingerprint, sample và thống kê

### 6.1 Hai fingerprint

`measurement_fingerprint` là SHA-256 chữ thường của UTF-8 canonical JSON
(`sort_keys=true`, separator `,`/`:`) gồm:

- Provider Profile ID;
- safe model;
- task;
- processing mode;
- page scope và `vlm_max_pages`;
- DPI;
- prompt/config version;
- `provider_config_version`.

`provider_config_version` phải tăng khi đổi hardware, serving engine,
quantization hoặc config ảnh hưởng hiệu năng; không hash/persist endpoint URL.

`benchmark_fingerprint` = measurement fingerprint + fixture manifest + hardware
profile + benchmark run version.

Mọi PDF hợp lệ đều được dùng cho operational sizing nếu fingerprint/sample gate
khớp. Fixture chuẩn chỉ tạo **Reproducible benchmark**; file khác tạo
**Operational estimate**. Browser không cần tự gắn benchmark để sample hợp lệ.

### 6.2 Time bucket và percentile

- Token/cost/attempt/payload: bucket theo attempt `started_at` UTC.
- Job count/duration: bucket theo terminal time.
- UI có thể hiển thị timezone chọn, nhưng API/rollup giữ UTC.
- P50/P95 dùng nearest-rank:

```text
rank = ceil(percentile × sample_count)
value = sorted_values[rank - 1]
```

Tính riêng page/document/job và luôn hiện `n`, date range, fingerprint.

### 6.3 Sample gates

- `n=1`: Measurement Preview.
- `n>=2`: comparison table.
- `n>=5`: trend/scatter.
- Bốn fixture: functional/reproducible baseline, vẫn `Insufficient sample`.
- `n>=20` compatible jobs: P95/capacity screening sơ bộ.
- Dưới 20 vẫn hiện observed value nhưng không verdict `Đạt`.
- Cost forecast cần `n>=20` và billing certainty >=95%.
- Scenario nằm ngoài observed page range chỉ được token/storage extrapolation;
  không capacity/SLA verdict.

Không trộn cover/admin document trong percentile nếu user không chủ động chọn
mixed sample. Token/cost/request rate tính mọi attempt có dữ liệu; job-duration
percentile chỉ dùng completed/completed-with-warnings. Error/interrupted báo
riêng; cancelled không tính provider reliability.

Workload Scenario có `minimum_success_rate`, mặc định 95%. Capacity và
reliability verdict tách riêng.

## 7. Price, cost và tỷ giá

### 7.1 Price Profile

Price Profile gắn:

- Provider Profile ID và safe model;
- billing currency ISO;
- input/output/cached price trên một triệu token;
- optional fixed cost/request + bắt buộc policy:
  `successful_response`, `any_http_response` hoặc `every_started_attempt`;
- surcharge/tax;
- `effective_from`;
- optional display currency, confirmed exchange rate và source provenance.

Báo cáo luôn giữ số tiền billing currency; display currency chỉ là quy đổi.
Không có tỷ giá thì billing amount vẫn tính được, display amount `Unavailable`.

Operation dùng profile mới nhất có `effective_from <= started_at`. Profile đã
được raw/rollup/scenario dùng trở thành immutable; sửa tạo version mới. Profile
đã dùng chỉ archive, chưa dùng mới hard-delete.

User không nhập usage. Worker tự lấy provider `usage`. Không có Price Profile thì
token vẫn xem được, cost `Unavailable`.

### 7.2 Cost formula

```text
uncached_input = prompt_tokens - cached_tokens
input_cost = uncached_input / 1_000_000 × input_price
cached_cost = cached_tokens / 1_000_000 × cached_price
output_cost = completion_tokens / 1_000_000 × output_price
total_cost =
  (input_cost + cached_cost + output_cost + fixed_cost) × (1 + surcharge_rate)
```

Không cộng reasoning lần nữa. Thiếu cached usage thì toàn bộ prompt dùng input
price.

- `known_cost`: tổng attempt có billing xác định.
- `total_cost`: chỉ có khi billing certainty 100%.
- Nếu chưa đủ: hiển thị known cost + unknown attempt count; không nội suy báo cáo
  lịch sử.
- Forecast chỉ dùng complete job và gate 20 job/95%; không chia known cost cho
  coverage.

External provider dùng API Price Profile. Self-host không hiển thị `0 USD`; ghi
`Chưa tính chi phí hạ tầng`. X17 chỉ sizing năng lực self-host, chưa làm TCO
điện/khấu hao/bảo trì. Internal chargeback nếu có phải ghi đúng provenance.

### 7.3 Exchange-rate suggestion

Không scrape Google và không auto lấy provider price. Backend chỉ fetch tỷ giá
khi user bấm, từ allowlist:

- [Vietcombank](https://www.vietcombank.com.vn/vi-VN/To-chuc/Trang-chu-DCTC/KHTC---Ti-gia---DCTC)
  và [Agribank](https://www.agribank.com.vn/vn/ty-gia) cho cặp VND;
- [ECB](https://data.ecb.europa.eu/key-figures/ecb-interest-rates-and-exchange-rates/exchange-rates)
  cho reference pair được hỗ trợ.

UI hiển thị từng quote riêng: source, rate kind (buy/transfer/sell/reference),
source time, fetched time và direct link. Không average. Khi thanh toán hóa đơn
ngoại tệ từ VND, làm nổi bật bank selling rate nhưng user phải chọn/xác nhận.

- Memory cache 15 phút; quote quá 24 giờ mang `Stale`.
- Source lỗi có thể hiển thị cache cũ có cảnh báo, không auto-apply.
- Quote chỉ áp cho đúng source date. Profile backdated cần historical quote đúng
  ngày hoặc manual input.
- Confirmed quote mới persist vào Price Profile và không tự đổi.
- Fixed URL allowlist chống SSRF; timeout/error sanitized.
- Local tests dùng response fixture; live-source failure không ảnh hưởng OCR.

## 8. Workload, capacity và SLA

Mỗi scenario chọn một Processing Mode.

Input chung:

- volume/tháng;
- operating days/tháng;
- hours/ngày;
- average pages;
- peak factor;
- một reserve factor;
- SLA P95;
- minimum success rate;
- artifact retention days.

Không nhập đồng thời volume ngày và tháng. Với admin/cover, volume là jobs/tháng
và pages/job. Với combined dossier, nhập dossiers/jobs tháng, average logical
documents/dossier và pages/document. Không trộn nhiều Processing Mode trong một
scenario.

```text
average_jobs_per_hour =
  monthly_jobs / operating_days / operating_hours

peak_jobs_per_hour =
  average_jobs_per_hour × peak_factor

required_capacity =
  peak_jobs_per_hour × (1 + reserve)

measured_capacity =
  3600 / job_duration_p95
```

Không thêm `target_utilization`; reserve là headroom duy nhất.

X17 tách:

- service-time check;
- throughput check;
- reliability check;
- SLA verdict.

Công thức chỉ cho `Capacity screening`; chỉ load test thật đo queue wait/P95
end-to-end mới được ghi `SLA đạt`.

Khi chỉ có benchmark một worker, có thể trả:

```text
theoretical_capacity_units =
  ceil(required_capacity / measured_single_unit_capacity)
```

Nhãn là `Calculated — unvalidated scale-out`, không tự đổi Compose/concurrency.
Chỉ gọi cấu hình cluster `Validated` sau benchmark nhiều instance thật với mỗi
worker concurrency/prefetch 1, shared Redis/filesystem/provider dự kiến và test
duplicate/cancel/restart/persistence.

Throughput tách prompt/completion/total token/s, pages/minute, jobs/hour và job
P95. Capacity chính không dựa một mình vào total token/s.

## 9. `/sizing` UX

### 9.1 Progressive UI

- 1 job: KPI, coverage, provenance và Document Explorer.
- 2 job: comparison/top consumers.
- 5 job: trend/scatter.
- 20 job: histogram, P95 và capacity screening.
- Chưa đủ mẫu hiển thị lý do; không chart giả.

Mỗi output tách hai lớp:

- `value_kind`: measured/calculated/assumed/unavailable;
- `source_quality`: n, coverage, fingerprint, insufficient-sample/warning.

### 9.2 ECharts

Dùng `echarts` trực tiếp, dynamic import chỉ ở `/sizing`; không React wrapper.
Tree-shake chart/component/ARIA/SVG hoặc Canvas renderer cần dùng. Có tooltip,
legend, series toggle, data zoom/range, responsive resize; table HTML là
accessibility/verification fallback. Không đưa untrusted string vào HTML
formatter.

Chart:

- stacked input/output theo job và task;
- daily token line;
- token/document histogram;
- pages-token và token-duration scatter;
- top consumers table.

### 9.3 Document Explorer và export

Job detail chỉ trả summary + tree aggregate. Operation lazy-load, filter và
paginate tối đa 100 theo document/source/page/task/status. Không tải hàng nghìn
attempt một lần.

Export:

- CSV cho table/filter hiện tại;
- JSON cho Saved Snapshot/provenance;
- PNG từng chart;
- print stylesheet cho browser Save as PDF.

Export luôn ghi filter, timezone, sample count, coverage và generated time.

### 9.4 Saved Snapshot

Calculate mặc định không persist. User bấm **Save snapshot** mới ghi immutable:
inputs, aggregate sample, n/coverage/date, fingerprints, profile revisions,
formula version, result và warning; không lưu job list/content.

- Archive để ẩn; hard-delete cần preview/confirm.
- Không tự hết hạn.
- Tối đa 256 KiB/snapshot và 1.000 snapshot toàn hệ thống.
- UI cảnh báo 80% quota; list phân trang.
- Archived quá 365 ngày `eligible for cleanup`, vẫn manual.

## 10. API

Tối thiểu:

```text
GET  /api/sizing/overview
GET  /api/sizing/jobs
GET  /api/sizing/jobs/{job_id}
GET  /api/sizing/jobs/{job_id}/operations
GET  /api/sizing/catalog
PUT  /api/sizing/catalog
POST /api/sizing/calculate
POST /api/sizing/snapshots
GET  /api/sizing/snapshots
PATCH /api/sizing/snapshots/{snapshot_id}
POST /api/sizing/snapshots/{snapshot_id}/delete-preview
DELETE /api/sizing/snapshots/{snapshot_id}
POST /api/sizing/retention/preview
POST /api/sizing/retention/apply
GET  /api/sizing/exchange-rate-sources
POST /api/sizing/exchange-rate-suggestions
```

- Overview trả backend-aggregated series, provenance và gate; không trả job
  store.
- Jobs/operations/snapshots phân trang và có bounded filters. Snapshot archive
  dùng revision; hard-delete cần token/checksum từ delete preview.
- Catalog dùng atomic replace + revision conflict tương tự Code Catalog.
- Calculator thuộc backend; browser chỉ có local input preview mang nhãn Preview.
- Retention apply phải dùng plan/revision/checksum từ preview.
- Exchange-rate endpoint chỉ dùng fixed source ID; không nhận arbitrary URL.

## 11. Triển khai X17

### X17A — Measurement foundation

- Attempt sidecar/lifecycle/usage/safe error/payload/duration.
- Job/system operation, readiness coalescing/cache.
- Resource sampler, aggregate rebuild/restart/old-job compatibility.
- Rollup-on-delete để Preview không làm mất lịch sử khi user xóa job.

### X17B — Measurement Preview

- Một PDF thật qua upload hiện có.
- Summary, two coverages, provenance, lazy Document Explorer.
- Known per-job cost nếu đã có Price Profile.
- Chưa capacity/SLA verdict.

### X17C — Aggregation và visualization

- Filter, page/document/job units, nearest-rank, sample gates.
- ECharts progressive charts, URL state và export.

### X17D — Scenario và catalogs

- Price/workload/hardware profiles.
- Exchange-rate suggestion + confirmation.
- Backend calculator cho cost/storage/capacity/reliability.

### X17E — Retention và snapshots

- Raw cleanup, rollup deletion/tombstone/recovery.
- Saved snapshot/archive/delete/quota.

### X17F — Evidence

- Bốn fixture reproducible measurement baseline.
- Từ 20 compatible jobs mới mở full capacity screening.
- Scale-out chỉ validated sau cluster benchmark thật.

## 12. Verification và tiêu chí hoàn thành

Local contract:

- usage complete/missing/malformed/inconsistent/cached/reasoning;
- invalid OCR JSON vẫn giữ usage;
- retry, `429/502/503/504`, connect/read timeout, interrupted;
- no double count reload/restart; sidecar/aggregate rebuild;
- readiness scope/cache/coalescing;
- old job no rewrite/backfill;
- rollup-on-delete transaction/recovery;
- worker sampler failure không làm OCR fail;
- price matching/version/fixed-cost policy và phép tính tay;
- percentile nearest-rank, coverage, fingerprint, sample gates;
- retention preview/conflict/tombstone/quota;
- exchange source allowlist/cache/stale/manual fallback;
- generated OpenAPI/types, typecheck/build/E2E, UTF-8 và diff check.

Live evidence:

1. Một PDF mở Measurement Preview và đối soát aggregate = sidecars.
2. Bốn fixture chạy cùng compatible config cho `full_ocr`, `metadata`,
   `segmentation`, `readiness_probe`; backup/restore không double count.
3. Provider không trả usage vẫn chứng minh `Unavailable`, nhưng không mở numeric
   calculator/sizing.
4. Bốn fixture chỉ là functional baseline; capacity/SLA screening cần ít nhất
   20 compatible jobs và gate coverage/reliability.

X17 chỉ hoàn thành khi:

- drill-down job → document → page → task → attempt hoạt động trên job thật;
- known/unknown cost, coverage và provenance đúng;
- delete/archive/restart/backup không mất hoặc cộng trùng measurement;
- external API cost và self-host capacity tách rõ;
- calculator không verdict ngoài sample/page range hoặc dưới gate;
- UI responsive tại `1440×900`, `1366×768`, không overflow `390×844`, keyboard,
  focus, table fallback và modal vẫn dùng được;
- không lộ secret/raw response/content và không gọi baseline fixture là capacity
  certification.

## 13. Ngoài phạm vi

- Không tự crawl provider price.
- Không scrape Google hoặc nhận arbitrary exchange-rate URL.
- Không tokenizer estimate image token.
- Không TCO điện/khấu hao/bảo trì self-host.
- Không queueing simulation hoặc tuyên bố SLA từ công thức.
- Không tự tăng Celery concurrency/worker replica hoặc tự sửa deployment.
- Không auto-delete job, rollup, system operation hoặc snapshot.
- Không database, provider SDK, UI kit, React chart wrapper, state manager,
  scheduler/Celery Beat hoặc host agent.
