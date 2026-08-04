# Kế hoạch tái cấu trúc codebase theo Provider Profile

Trạng thái: **LOCAL IMPLEMENTED trên `restructure_pj` — live gate pending**
Ngày lập: **2026-08-03**  
Cập nhật Qwen3-VL: **2026-08-04**
Phạm vi: hợp nhất MiniMax-M3 và Ollama/Qwen3-VL 8B vào một codebase, cho phép hai
profile hoạt động đồng thời và cô lập policy của từng module mà không sao chép OCR
pipeline dùng chung.

Tài liệu này lưu kiến trúc và rationale đã được phỏng vấn/chốt. Checklist thực thi
backend/frontend phải được ghi vào `implementation_plan.md`/`frontend_plan.md` với
backlink `BE-X20`/`FE-X20`; điều kiện fixture/server/live còn mở thuộc
`incomlpeted.md`. Ba file đó tiếp tục là nguồn chuẩn về trạng thái triển khai.

## 1. Kết luận kiến trúc

Chỉ giữ một trunk chuẩn là `master`. Không tiếp tục dùng nhánh dài hạn theo model
như `ollama`, `qwen`, `gpt` hoặc `paddle`.

Thực hiện kế hoạch trên branch `restructure_pj` tách từ đúng `master`; không
merge hoặc cherry-pick nguyên commit từ `ollama`. Nhánh `ollama` chỉ là nguồn diff
read-only cho đến khi live gate, rollback rehearsal và phê duyệt xóa riêng hoàn tất.

Việc chọn model/provider xảy ra tại runtime qua `provider_profile_id`. Một
deployment có thể bật đồng thời `minimax` và `ollama_qwen3_vl_8b`; profile đã persist
không tự failover sang profile khác khi unavailable.

Profile ID gắn với exact model và một họ request policy. `minimax` tiếp tục gắn
MiniMax-M3 để giữ compatibility; `ollama_qwen3_vl_8b` gắn `qwen3-vl:8b`. Prompt/policy
có thể tăng version dưới cùng ID, nhưng model khác hoặc hai policy cần chạy song
song phải có ID mới.

Không sao chép toàn bộ OCR pipeline cho từng model. Mỗi model/profile chỉ sở hữu
những gì thực sự khác nhau:

- identity và capability công khai;
- cấu hình endpoint/credential phía server; exact model thuộc profile;
- generation policy;
- cách sắp xếp nội dung multimodal;
- prompt override nếu đã có bằng chứng model cần prompt riêng;
- prompt/request-policy version dùng cho snapshot và measurement fingerprint.

Các hành vi nghiệp vụ và reliability giống nhau tiếp tục dùng chung:

- PDF rendering và page planning;
- Celery lifecycle và durable filesystem state;
- retry budget, timeout và `Retry-After`;
- usage measurement, safe events và sizing;
- parse/normalize/validate kết quả;
- field policy, bbox, evidence và approval blocker/risk;
- segmentation, correction, approval, rerun và compatibility reader.

Đây là module theo nghĩa một interface dữ liệu nhỏ che giấu policy riêng. Không xây
plugin framework động, provider SDK riêng, factory nhiều tầng, database,
entry-point discovery, transport-neutral abstraction hoặc package/repository con.
Anthropic/Paddle/native transport chỉ được thiết kế khi có endpoint/runner thật.

## 2. Hiện trạng đã xác minh

### 2.1 Git topology

- `master`: `69bdb0d32ff845555aa88a47a51c48ec40401f4a`.
- `ollama`: `339a546ec2bfa7205b26691ec7b0e1101226d91d`.
- `restructure_pj`: `7431f6de28a988d8497d273c83137d73fb9b715f`, gồm implementation
  profile tại `2190c70` và thay Qwen3-VL tại `7431f6d`.
- Merge-base của `master`/`ollama` là `e448b961`; `ollama` có bốn commit nguồn:
  - `d72d82b`: thêm kết nối Docker tới Ollama trên host;
  - `74e6b30`: thêm thinking control;
  - `57e64c4`: thêm token cap và structured-output control;
  - `339a546`: đổi thứ tự multimodal content phục vụ Qwen và mở rộng kiểm tra
    metadata page zero.
- Diff `master..ollama` hiện chạm 16 file, khoảng `+288/-27`.

Không có lý do để merge nguyên nhánh `ollama`: phần lớn code là bản sao của
`master`, trong khi một số thay đổi Qwen đang được áp vào shared runner và vì thế
có thể đổi hành vi MiniMax.

### 2.2 Runtime seam hiện tại

Backend hiện tạo đúng một Provider Profile từ các biến toàn cục:

```text
OCR_PROVIDER
OCR_BASE_URL
OCR_API_KEY
OCR_MODEL
OCR_ENDPOINT_EXTERNAL
```

`backend/app/api/routes.py:provider_profiles()` trả một phần tử. Job có persist
`provider_profile_id` và `model`, nhưng worker vẫn đọc endpoint/key/generation
settings toàn cục. Vì vậy persisted profile chưa thật sự sở hữu runtime config.

Readiness hiện có hai vấn đề khi mở multi-profile:

- cache readiness dùng chung cho mọi engine;
- `POST /api/engines/{engine_id}/check` kiểm tra ID tồn tại nhưng probe cấu hình
  toàn cục, không probe profile tương ứng với `engine_id`.

Shared provider flow hiện là:

```text
workers/tasks.py
  -> request_page()
  -> request_body()
  -> OpenAI-compatible /chat/completions
  -> message_text()
  -> parse_json_object()
  -> validate_result()
  -> persisted usage/result/evidence
```

`request_page()` có năm caller trong worker. Do đó mọi thay đổi generation hoặc
content order đặt trực tiếp tại đây đều tác động segmentation, metadata, full OCR
và tất cả provider.

### 2.3 Frontend và public contract đã có sẵn

Frontend đã xử lý `ProviderProfileResponse[]` và tự hiển thị dropdown khi backend
trả nhiều hơn một profile. Create Job đã gửi `provider_profile_id`; task, page mode,
processing mode và consent đều lấy từ capability của profile đang chọn.

Public schema hiện đã có đủ trường cần thiết:

- `id`, `label`, exact safe `model`;
- `external`, `status`;
- `tasks`, `page_modes`, `max_pages`, `processing_modes`.

Vì vậy giai đoạn đầu không cần tạo endpoint hoặc DTO mới. Cần sửa backend để
contract nhiều profile hoạt động đúng như frontend đã kỳ vọng.

## 3. Mục tiêu và ngoài phạm vi

### 3.1 Mục tiêu bắt buộc

1. `master` chứa cả MiniMax và Qwen.
2. Một deployment có thể cấu hình một hoặc nhiều profile mà không sửa source.
3. Job luôn chạy bằng profile đã chọn và persist lúc tạo job.
4. Thay đổi module Qwen không đổi request contract của MiniMax.
5. Profile MiniMax và Qwen có module data-only riêng; sửa policy Qwen không làm
   đổi request contract MiniMax.
6. Job cũ tiếp tục đọc được mà không rewrite.
7. URL, API key, header và raw response không xuất hiện trong public API, job JSON
   hoặc log.
8. Local contract và live quality được kiểm tra riêng; readiness không được dùng
   thay cho OCR fixture evidence.

### 3.2 Ngoài phạm vi

- Không thêm database hoặc Redis persistence.
- Không thêm provider SDK khi `httpx` và OpenAI-compatible endpoint đã đủ.
- Không đổi PDF-only limits, job lifecycle hoặc filesystem layout.
- Không đổi `ocr.process_job` thành nhiều Celery task theo provider.
- Không viết transport Paddle/native trước khi có Paddle runner thật.
- Không triển khai GPT, Gemma, các Qwen model khác, Paddle-VL hoặc Anthropic-compatible trong
  scope này.
- Không tạo hot-reload/dynamic discovery cho module.
- Không tự động migrate hoặc relabel job lịch sử.
- Không xóa nhánh `ollama` trước khi live gate của cả MiniMax và Qwen pass.
- Không thay đổi auth, port ownership hoặc Milestone C semantics ngoài những gì
  cần để chọn đúng provider profile.

## 4. Kiến trúc đích

### 4.1 Luồng tổng thể

```text
FastAPI create/start/continue/check          Celery process_job
                 |                                  |
                 +----------------+-----------------+
                                  |
                         resolve(profile_id)
                                  |
                     +------------+------------+
                     | Provider profile module |
                     +-------------------------+
                     | minimax.py               |
                     | qwen.py                  |
                     | exact approved profiles  |
                     +------------+------------+
                                  |
                    resolved private runtime + policy
                                  |
                         shared ocr_runner.py
                                  |
              HTTP/retry/usage/parser/domain validation
                                  |
                     durable job/artifact/evidence
```

### 4.2 Cấu trúc file tối thiểu

```text
backend/app/services/
├── ocr_runner.py
└── providers/
    ├── __init__.py
    ├── minimax.py
    └── qwen.py
```

Trách nhiệm:

- `providers/__init__.py`
  - định nghĩa `ProfileSpec` bằng stdlib `@dataclass(frozen=True)`;
  - chứa registry tĩnh;
  - dùng một loader chung theo `env_prefix` cho private runtime config;
  - cung cấp `get_profile()`, `enabled_profiles()` và public allowlist mapping;
  - fail startup với ID trùng/unknown hoặc default profile cấu hình thiếu;
  - giữ profile phụ thiếu cấu hình ở trạng thái `not_configured` thay vì làm sập
    toàn backend.
- `providers/minimax.py`
  - giữ request behavior tương đương `master` ban đầu;
  - khai báo capability và config prefix của MiniMax;
  - không nhận Qwen workaround nếu chưa có live evidence riêng.
- `providers/qwen.py`
  - sở hữu Qwen/Ollama request policy;
  - canonical ID `ollama_qwen3_vl_8b`, exact model `qwen3-vl:8b`;
  - mặc định thinking bật, structured output tắt, content order riêng;
  - token cap là knob nhưng mặc định không gửi trước khi Phase 0 có usage thật;
  - không chứa retry, HTTP client, field validation hoặc job logic.
- `ocr_runner.py`
  - giữ một HTTP runner OpenAI-compatible;
  - nhận profile đã resolve thay vì đọc provider settings toàn cục;
  - áp profile policy khi dựng body;
  - giữ parser, retry, usage và safe error dùng chung.

Không tạo `base.py`, abstract class, callback `build_request()`, factory class hoặc
transport registry trong giai đoạn này. Hai module chỉ khai báo `ProfileSpec`;
shared runner dựng request từ dữ liệu đã resolve.

### 4.3 Interface của `ProfileSpec`

Interface dự kiến cần đủ các nhóm dữ liệu sau; tên field cuối cùng có thể được
rút gọn trong lúc triển khai nhưng semantics không đổi.

```text
Identity/public:
  id
  label
  exact model
  external (derived from endpoint_external)
  tasks
  page_modes
  max_pages
  processing_modes

Private runtime:
  env_prefix
  base_url
  api_key
  timeout_seconds
  endpoint_external
  provider_config_version

Request policy:
  prompt_version
  message_order
  image_instruction
  thinking_mode
  optional max_tokens_by_task
  structured_output
```

`ProfileSpec` có thể chứa secret ở runtime nhưng public serialization phải là
một mapping allowlist được viết tường minh. Không dùng `asdict()` hoặc dump toàn
bộ object vào API, log, measurement hay job JSON.

### 4.4 Interface mà caller được phép dùng

Routes và worker chỉ được biết các thao tác sau:

```text
get_profile(profile_id) -> ProfileSpec
enabled_profiles() -> tuple[ProfileSpec, ...]
profile.public() -> safe public mapping
request_page(image, profile=..., task=..., ...) -> normalized result
probe_provider(profile=..., ...) -> sanitized readiness
```

Caller không được tự đọc `QWEN_*`, `MINIMAX_*`, tự dựng request body hoặc tự chọn
generation option. Đây là seam chính đảm bảo thay đổi được tập trung.

`prompt_version` chỉ tăng khi prompt text thật sự đổi. Thay content order, thinking,
structured output, token policy hoặc `provider_config_version` làm đổi safe policy
fingerprint nhưng không giả vờ đổi prompt version. URL/API key không nằm trong
fingerprint; operator phải tăng `provider_config_version` khi weights,
quantization hoặc runtime có thể làm đổi kết quả.

### 4.5 Khi nào tạo module mới

- Exact model khác phải có profile ID mới; nếu cùng họ policy thì có thể dùng cùng
  module dữ liệu.
- Khác content order, generation policy hoặc prompt đã được fixture chứng minh:
  thêm module/profile riêng.
- Khác transport thật sự: chỉ khi có provider thật mới định nghĩa transport seam
  nhỏ phía sau `request_page`; scope hiện tại vẫn chỉ OpenAI-compatible.

Ví dụ: hai Qwen model dùng cùng OpenAI-compatible request policy không cần hai
copy runner. Mỗi exact model vẫn cần profile ID riêng để job snapshot và
measurement không trộn identity.

## 5. Phân loại thay đổi trên nhánh `ollama`

Không cherry-pick nguyên commit. Mỗi thay đổi phải được chuyển về đúng owner:

| Thay đổi hiện tại | Owner sau tái cấu trúc | Cách xử lý |
|---|---|---|
| `host.docker.internal:host-gateway` | Deployment/network | Giữ cấu hình kết nối cần thiết, không nhét vào model request |
| `THINKING_MODE` / `reasoning_effort` | Qwen policy | Không áp toàn cục cho MiniMax |
| Token cap `2048/8192/64` | Qwen policy candidate | Giữ knob nhưng mặc định không gửi trước khi usage baseline xác định cap có headroom |
| `OCR_STRUCTURED_OUTPUT` | Profile policy | Opt-in theo profile; readiness không được coi là quality proof |
| `[instruction, image, prompt]` | Qwen policy | Không thay message order của MiniMax |
| `response_schema(task)` | Shared task contract | Chỉ gắn vào body khi profile bật structured output |
| `finish_reason="length"` | Shared reliability | Persist usage, không retry, trả safe `invalid_model_json` |
| Chọn JSON object hoàn chỉnh cuối cùng | Shared parser | Dùng cho mọi OpenAI-compatible response |
| Page-zero thiếu metadata | Shared domain validation | Áp theo logical document/task, không theo provider |
| Ollama context/Flash Attention/KV cache | External Ollama runtime | Không gửi trong request body ứng dụng |

Lịch sử Qwen 3.5 cho thấy `reasoning_effort="none"` có thể nhanh hơn nhưng trả
0 field trên workload cụ thể. Qwen3-VL trên server cũng đang dùng thinking bật;
vì vậy `ollama_qwen3_vl_8b` mặc định bật thinking;
thay đổi knob này tạo fingerprint mới. MiniMax giữ body `master` nguyên trạng:
`prompt -> image`, không `reasoning_effort`, `max_tokens` hoặc `response_format`.

## 6. Cấu hình môi trường

### 6.1 Cấu hình mới

Đề xuất dùng prefix tường minh:

```dotenv
OCR_DEFAULT_PROFILE=minimax
OCR_ENABLED_PROFILES=minimax,ollama_qwen3_vl_8b

MINIMAX_BASE_URL=https://provider.example/v1
MINIMAX_API_KEY=replace-me
MINIMAX_ENDPOINT_EXTERNAL=true
MINIMAX_TIMEOUT_SECONDS=180
MINIMAX_CONFIG_VERSION=minimax-m3-v1

QWEN_BASE_URL=http://host.docker.internal:11434/v1
QWEN_API_KEY=ollama
QWEN_ENDPOINT_EXTERNAL=false
QWEN_TIMEOUT_SECONDS=replace-with-measured-seconds
QWEN_CONFIG_VERSION=qwen3-vl-8b-q4km
QWEN_THINKING_MODE=true
QWEN_STRUCTURED_OUTPUT=false
# QWEN_MAX_TOKENS_* chỉ đặt sau khi Phase 0 xác định headroom an toàn.
```

`OCR_ENABLED_PROFILES` là allowlist runtime. Module có trong source nhưng không có
trong danh sách này không được trả ra UI và không được dùng cho job mới. Default
phải nằm trong allowlist. Unknown/duplicate ID làm startup fail; profile phụ hợp lệ
nhưng thiếu private config vẫn được trả với `status=not_configured` và không nhận
job mới. Exact model nằm trong module, không được thay tùy ý bằng `.env`.

### 6.2 Tương thích cấu hình cũ

Trong giai đoạn chuyển đổi:

- nếu không có `OCR_ENABLED_PROFILES`, bật một profile theo `OCR_PROVIDER`;
- với profile MiniMax, nếu thiếu `MINIMAX_*`, đọc fallback từ `OCR_BASE_URL`,
  `OCR_API_KEY`, `OCR_MODEL`, `OCR_ENDPOINT_EXTERNAL`, nhưng `OCR_MODEL` phải khớp
  exact model MiniMax-M3;
- ghi warning sanitized khi dùng legacy config, nhưng không log giá trị;
- xóa fallback trong thay đổi riêng sau deployment mới, canary và rollback
  rehearsal pass; không giữ hai hệ cấu hình vĩnh viễn.

Không thêm cơ chế merge JSON/YAML config hoặc directory scan. Hai prefix rõ ràng
đủ cho phạm vi hiện tại và dễ kiểm tra bằng Pydantic/stdlib.

### 6.3 Ollama host configuration

Các giá trị sau thuộc dịch vụ Ollama bên ngoài ứng dụng:

```text
OLLAMA_CONTEXT_LENGTH
OLLAMA_FLASH_ATTENTION
OLLAMA_KV_CACHE_TYPE
```

Chúng không xuất hiện trong `.env.example` của OCR vì Compose này không khởi chạy
Ollama và backend/worker không đọc chúng. Không đưa chúng vào request fingerprint
hoặc OpenAI-compatible body; khi benchmark GPU, ghi chúng vào sanitized deployment
evidence/hardware fingerprint riêng.

## 7. Durable data và compatibility

### 7.1 Job mới

Khi create job, backend resolve profile rồi snapshot tối thiểu:

- `provider_profile_id`;
- safe provider identity hiện có;
- exact model;
- prompt version của profile;
- safe policy fingerprint và provider config version;
- `endpoint_external`;
- task/page/processing selections.

Không persist URL, API key, header, structured schema hoặc full request body.

### 7.2 Worker execution

Worker phải resolve bằng `job.provider_profile_id` và so safe policy fingerprint
đã snapshot với profile hiện tại. `OCR_DEFAULT_PROFILE` chỉ dùng khi tạo job mới
hoặc đọc legacy job thực sự thiếu identity; nó không ghi đè profile đã persist.

Nếu model/prompt/request policy/config version đổi sau create nhưng trước khi xử
lý, job chuyển `interrupted` với safe error; không chạy bằng policy mới và không
fallback. Thay URL/API key đơn thuần không làm đổi fingerprint.

Nếu profile của job không còn enabled/configured:

- terminal job: vẫn đọc, review, report và tải artifact được;
- job chưa chạy/rerun/continue: trả `provider_profile_unavailable` hoặc safe error
  hiện có phù hợp;
- không fallback sang profile khác;
- không rewrite job.

Các job lịch sử mang `qwen` hoặc `ollama_qwen35_9b` là legacy read-only: vẫn
xem/report/tải artifact được nhưng không xuất hiện cho job mới, không tự relabel
và không hỗ trợ Continue/rerun. Profile canonical mới là
`ollama_qwen3_vl_8b`; không rewrite job cũ khi đọc.

### 7.3 Rerun

Rerun giữ nguyên:

- Provider Profile;
- Processing Mode;
- task/page scope;
- source job bất biến.

Trước khi tạo/running job mới, backend xác nhận canonical profile còn enabled,
configured và hỗ trợ capability đã persist. Job rerun snapshot exact model,
prompt/policy/fingerprint **hiện tại**; đây là job mới dùng policy mới, không phải
tái lập bit-for-bit policy cũ. Legacy `qwen` không đi qua flow này.

### 7.4 Measurement

Measurement fingerprint phải tách tối thiểu theo:

```text
provider_profile_id
model
task
processing_mode
page scope / max pages
DPI
prompt version
safe generation policy
provider config version
segmentation revision khi có
```

Không trộn benchmark MiniMax và Qwen, hoặc hai fingerprint thinking/structured/
token/prompt/config khác nhau. Logs/report tổng quan vẫn có thể lọc theo profile
ID; sizing/benchmark chỉ dùng nhóm measurement tương thích. Giá trị không có
evidence tiếp tục là unavailable, không suy diễn.

## 8. Readiness và capability

### 8.1 Readiness theo profile

Thay cache đơn bằng cache TTL 30 giây theo profile và fingerprint:

```text
readiness_cache[(provider_profile_id, safe_policy_fingerprint)]
  = status, checked_at, expires_at
```

Một lock dùng chung là đủ với quy mô hiện tại; chỉ cần lock theo profile khi đo
được contention thực tế.

`POST /api/engines/{engine_id}/check` phải:

1. resolve đúng `engine_id`;
2. dùng synthetic metadata probe để kiểm tra endpoint, credential, exact model
   và response OpenAI-compatible bằng request policy của chính profile; không
   dùng readiness thay cho fixture/quality benchmark;
3. persist measurement với đúng profile/fingerprint;
4. trả status sanitized hiện có;
5. không lộ raw response hoặc private config.

### 8.2 Start và Continue

- `/start` probe profile của chính job.
- Continue sau segmentation probe cùng profile đó.
- Readiness của MiniMax không được mở khóa Qwen và ngược lại.
- Upload/job durable state vẫn được giữ nếu profile tạm unavailable.

### 8.3 Giới hạn của readiness

Readiness chỉ chứng minh endpoint phản hồi request tổng hợp và trả JSON có thể
parse. Provider có thể bỏ qua `response_format`, trả HTTP 200 và vẫn không trích
được field hữu ích. Vì vậy readiness không thay thế fixture gate và Qwen có thể
được enable cho A/B development sau technical safety gate mà chưa có quality claim.

## 9. Frontend scope

Frontend không cần được tái cấu trúc lớn. Giữ `ProviderProfileResponse` generated
và flow hiện tại.

Các thay đổi cần thiết:

1. Dropdown xuất hiện khi có hơn một enabled profile.
2. Mỗi flow mới bắt đầu bằng `OCR_DEFAULT_PROFILE`; không lưu provider selection
   vào `localStorage`.
3. Readiness gọi đúng selected profile ID.
4. Khi đổi profile, nếu task/page/processing mode hiện tại không được profile mới
   hỗ trợ thì normalize về lựa chọn hợp lệ đầu tiên.
5. Reset consent khi đổi profile; chỉ yêu cầu consent khi profile được chọn có
   `external=true`.
6. Create Job gửi đúng selected `provider_profile_id`.
7. Không cho browser gửi URL, API key, header, arbitrary model hoặc generation
   fields.
8. Sizing/price chỉ cung cấp suggestion cho exact model có official source. Qwen,
   GPT, Gemma hoặc Paddle chưa có allowlist phải giữ unavailable/manual flow.

Không thêm field public cho fingerprint/policy/transport, nhãn thử nghiệm, redesign,
state manager, BFF, provider settings screen hoặc client-side plugin registry.
Qwen dùng public capability hiện có: tasks `metadata|full_ocr`, ba page mode,
`max_pages=100` và ba processing mode; segmentation vẫn là bước worker nội bộ của
`combined_dossier`, không phải public task.

## 10. Các giai đoạn triển khai

### Phase 0 — Baseline và inventory

Mục tiêu: khóa hành vi cần giữ trước khi sửa seam.

Việc cần làm:

- tạo `restructure_pj` từ exact `master`; `ReStructure.md` chưa commit đi
  theo branch nhưng không tạo commit tự động;
- giữ `ollama` read-only để đối chiếu;
- ghi exact commit/hash và diff bốn commit;
- chạy local gate/focused baseline trên `master` và `ollama`;
- capture sanitized request-body shape của MiniMax trên `master`;
- capture sanitized request-body shape Qwen 3.5 lịch sử trên `ollama` để port
  policy, rồi dùng Qwen3-VL server sample làm baseline model mới;
- dùng đúng một external `63-btc.pdf` ngoài Git và `OCR_DATA_DIR`, xác minh SHA-256
  với fixture đã chọn; không tự chọn job mới nhất và không sửa/xóa bản đang được
  track tại `Benchmark_files/63-btc.pdf` trong scope này;
- ghi PDF SHA-256, profile/model, prompt version, measurement fingerprint, token
  usage, valued-field count, bbox/evidence coverage và page status.

Exit gate:

- có baseline đủ để phát hiện MiniMax regression;
- có Qwen baseline đủ để xác định port đã giữ hay thay đổi hành vi;
- chưa sửa production code.

### Phase 1 — Registry một profile, giữ nguyên MiniMax

Mục tiêu: đặt seam đúng mà chưa thay runtime behavior.

Việc cần làm:

- thêm `services/providers/`;
- định nghĩa frozen data-only `ProfileSpec`, registry tĩnh và common env loader;
- thêm `minimax.py` từ hành vi `master`;
- chuyển `provider_profiles()` sang public mapping của registry;
- chuyển create/rerun capability validation sang resolved profile;
- giữ legacy env fallback;
- thêm assertion tests trực tiếp cho secret allowlist, duplicate/unknown profile,
  default profile invalid và optional profile `not_configured`; không thêm snapshot
  library/golden files.

Exit gate:

- chỉ có MiniMax enabled;
- request-body contract MiniMax không đổi;
- toàn bộ local check pass;
- job cũ đọc được mà không rewrite.

### Phase 2 — Runtime resolution end-to-end

Mục tiêu: persisted profile thực sự quyết định runtime.

Việc cần làm:

- `request_page` nhận profile đã resolve; `probe_provider` dùng request policy của profile;
- routes không đọc trực tiếp endpoint/key/model;
- worker resolve profile từ job;
- readiness cache TTL 30 giây theo `(profile ID, fingerprint)` và một lock chung;
- start/continue sử dụng job profile;
- measurement fingerprint dùng profile policy;
- fingerprint mismatch hoặc removed/unconfigured profile fail safe, không fallback.

Exit gate:

- test với hai fake profile chứng minh không dùng nhầm endpoint/model/policy;
- readiness của profile A không ảnh hưởng profile B;
- worker dùng profile persist trong job dù default profile thay đổi sau create.

### Phase 3 — Port shared reliability changes

Mục tiêu: lấy phần đúng chung từ `ollama` mà không kéo Qwen policy vào MiniMax.

Việc cần làm:

- giữ parser chọn JSON object hoàn chỉnh cuối cùng;
- giữ usage parsing;
- xử lý `finish_reason="length"` là non-retryable truncation;
- giữ retry budget tối đa hai attempt;
- đặt semantic page-zero validation theo task/logical document;
- giữ response schema như shared task contract nhưng chỉ gửi khi profile opt-in.

Exit gate:

- truncation chỉ tạo một attempt và vẫn persist usage;
- parser/validation tests pass cho cả hai profile;
- MiniMax request không có Qwen-only generation fields.

### Phase 4 — Thêm module Qwen

Mục tiêu: Qwen chạy trên cùng `master` mà không sửa MiniMax module.

Việc cần làm:

- thêm `qwen.py`;
- canonical ID `ollama_qwen3_vl_8b`, exact model `qwen3-vl:8b` và env prefix Qwen;
- port content order `instruction -> image -> prompt`, thinking mặc định bật và
  structured output mặc định tắt;
- giữ token-cap knob unset cho tới khi Phase 0 usage xác định cap có headroom;
- giữ prompt version 9 nếu prompt text không đổi; policy/config fingerprint ghi
  nhận các thay đổi request khác;
- thêm Qwen vào registry/enable list;
- thêm `host.docker.internal:host-gateway` chỉ cho backend và worker;
- không truyền Ollama-native fields trong OpenAI-compatible body.

Exit gate:

- focused request assertions của MiniMax và Qwen khác đúng ở policy đã khai báo;
- sửa Qwen option không làm test MiniMax thay đổi;
- fake-provider flow pass cho public metadata/full OCR và internal segmentation
  của cả hai.

### Phase 5 — Frontend multi-profile và documentation

Mục tiêu: expose đúng năng lực backend đã có, không thêm public control nguy hiểm.

Việc cần làm:

- test dropdown nhiều profile;
- test capability normalization khi đổi profile;
- test readiness/create payload dùng selected ID;
- test flow mới dùng server default, không persist provider vào `localStorage`;
- regenerate OpenAPI/types nếu public schema thực sự thay đổi;
- cập nhật `README.md`, `.env.example`, `AGENTS.md`;
- ghi counterpart vào `implementation_plan.md` và `frontend_plan.md`;
- ghi live/provider conditions còn thiếu vào `incomlpeted.md`.

Đề xuất tên scope khi được duyệt:

- `BE-X20 — Profile-resolved OCR modules`;
- `FE-X20 — Multi-profile selection and readiness`.

Exit gate:

- browser không nhận private provider config;
- create/readiness theo đúng selected profile;
- canonical docs và runtime behavior khớp nhau.

### Phase 6 — Live fixture gate

Mục tiêu: chứng minh chất lượng và isolation trên provider thật.

Chạy branch test với `OCR_DATA_DIR` riêng, không dùng durable data directory của
deployment hiện hành. Qwen được bật cho developer A/B mà không thêm nhãn thử
nghiệm; việc enable không tự tạo quality claim.

Partial server sample ngày 2026-08-04 đã có ba job `metadata + auto` Qwen3-VL
trong ignored `data_2/`: tổng 8 trang, không failed page và 6 attempt đều có
usage; một `invalid_json` đã retry thành công. Sample này chưa có ground truth,
MiniMax đối chứng, full OCR, combined dossier, restart hoặc rollback nên chỉ là
evidence tiến độ, không phải exit gate.

Chạy cùng approved fixture composition cho MiniMax và Qwen:

- `63-btc.pdf`: metadata và full OCR;
- một Bìa: metadata;
- combined dossier rõ: segmentation + confirmation + extraction;
- combined dossier khó: segmentation/manual correction + metadata;
- readiness probe riêng của từng profile.

Với mỗi job, ghi sanitized evidence:

- exact job ID/path;
- PDF/manifest SHA-256, không ghi document text;
- provider profile/model/prompt version/config fingerprint;
- task/page scope/processing mode;
- provider operation count và attempt statuses;
- prompt/completion/total usage nếu provider trả;
- valued fields, required blockers và warnings;
- bbox/evidence coverage;
- segmentation/source/document/excluded counts;
- duration và terminal status.

Exit gate:

- MiniMax không regression so với baseline đã khóa;
- Qwen đạt acceptance do user chốt sau bảng baseline Phase 0, không chỉ readiness;
- không có cross-profile measurement hoặc config leakage;
- evidence được ghi vào `implementation_plan.md#be-c-evidence` và external gates
  tương ứng được đóng trong `incomlpeted.md`.

### Phase 7 — Cutover và retire nhánh `ollama`

Mục tiêu: `master` trở thành codebase duy nhất.

Việc cần làm:

1. Pause upload, drain và stop worker.
2. Backup `OCR_DATA_DIR` với resolved path, size và SHA-256.
3. Build/deploy image đã nghiệm thu từ `master`.
4. Bật MiniMax làm default và chạy MiniMax canary.
5. Bật Qwen và chạy Qwen canary.
6. Restart backend/worker/Redis; xác nhận terminal/paused states và interrupted
   behavior giữ đúng contract.
7. Diễn tập rollback image/commit trước đó trên bản sao dữ liệu.
8. Gắn tag archive cho đầu nhánh `ollama`.
9. Chỉ xóa local/remote `ollama` sau khi user phê duyệt riêng.

Exit gate:

- không cần checkout branch để đổi provider;
- deployment dùng cùng source/image và chỉ khác server config;
- rollback đọc được persisted jobs mà không rewrite;
- nhánh model dài hạn không còn cần thiết.

## 11. Test plan

### 11.1 Profile/registry contract

- load enabled profiles đúng thứ tự cấu hình;
- default profile phải nằm trong enabled list;
- duplicate/unknown ID và default config thiếu bị từ chối sớm;
- optional profile hợp lệ nhưng thiếu private config trả `not_configured` mà không
  làm sập backend;
- unknown/disabled profile bị từ chối;
- public mapping không chứa URL/key/header/private generation state;
- legacy `OCR_*` fallback chỉ áp đúng MiniMax/default profile.

### 11.2 Request isolation

- MiniMax body giữ đúng content order và fields baseline;
- Qwen body giữ `instruction -> image -> prompt`, thinking mặc định bật,
  structured output tắt và không gửi token cap trước baseline;
- Qwen reasoning/content order/schema không xuất hiện trong MiniMax body;
- token cap khi được cấu hình tách đúng metadata/full OCR/segmentation;
- request không chứa `think`, `num_predict`, `num_ctx`, `format`, `options`;
- prompt field policy và image-only metadata contract vẫn giữ nguyên.

### 11.3 API/readiness

- `/api/provider-profiles` trả mọi enabled profile dưới safe schema;
- create job snapshot selected profile/model/prompt version;
- invalid capability/profile trả safe code;
- `/api/engines/{id}/check` probe đúng endpoint/model;
- cache readiness tách theo ID/fingerprint và giữ TTL 30 giây;
- start/continue giữ uploaded/confirmed state khi provider unavailable.

### 11.4 Worker/persistence

- worker dùng persisted profile, không dùng current default;
- fingerprint đổi trước execution làm job `interrupted`, không fallback;
- segmentation và extraction dùng cùng profile;
- profile bị remove không làm terminal job unreadable;
- legacy `qwen` đọc được nhưng không rerun/relabel;
- active/waiting/restart semantics giữ nguyên;
- retry/truncation/usage measurement giữ nguyên;
- job JSON, events và artifacts không có secret/raw response;
- rerun giữ source job bất biến, giữ processing choices và snapshot current
  canonical profile policy sau khi xác nhận capability.

### 11.5 Frontend

- một profile hiển thị locked system-managed value như hiện tại;
- nhiều profile hiển thị dropdown;
- flow mới chọn server default và không lưu provider trong `localStorage`;
- đổi profile normalize options không tương thích;
- consent theo selected profile;
- readiness và create payload dùng selected ID;
- lỗi readiness/create giữ selection để retry;
- Sizing/Report/Logs vẫn group và filter theo exact profile ID.
- public schema không thêm fingerprint/policy/transport fields.

### 11.6 Required local gate

```powershell
uv run --project backend pytest backend/tests -q
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
python -m compileall -q backend/app
git diff --check
```

Local gate chỉ là contract evidence, không phải live OCR proof.
Sau mỗi phase chạy focused test; chạy full gate sau checkpoint backend lớn và trước
handoff. Playwright teardown timeout không được gọi là clean pass.

## 12. File impact dự kiến

### Tạo mới

```text
backend/app/services/providers/__init__.py
backend/app/services/providers/minimax.py
backend/app/services/providers/qwen.py
```

### Sửa backend

```text
backend/app/settings.py
backend/app/api/routes.py
backend/app/services/ocr_runner.py
backend/app/workers/tasks.py
backend/tests/test_api.py
backend/tests/test_services.py
backend/tests/test_worker_config.py
```

### Sửa frontend khi cần

```text
frontend/app/page.tsx
frontend/tests/e2e/smoke.spec.ts
frontend/lib/api-schema.ts       # chỉ khi OpenAPI đổi
```

### Sửa deployment/docs

```text
.env.example
docker-compose.yml
README.md
AGENTS.md
implementation_plan.md
frontend_plan.md
incomlpeted.md
```

Danh sách này là blast-radius dự kiến, không phải yêu cầu chạm mọi file. Khi triển
khai phải giữ diff nhỏ nhất: file nào contract không đổi thì không sửa.

## 13. Thứ tự review

Review theo checkpoint thay vì một diff lớn:

1. Registry + MiniMax parity.
2. Runtime resolution + readiness isolation.
3. Shared reliability changes.
4. Qwen module.
5. Frontend/docs.
6. Live evidence/cutover.

Không tạo commit nếu chưa được user yêu cầu. Nếu có yêu cầu commit, mỗi checkpoint
trên là một đơn vị review hợp lý; không gộp Qwen policy và shared semantic changes
vào cùng một commit.

## 14. Rủi ro và biện pháp kiểm soát

| Rủi ro | Kiểm soát |
|---|---|
| Qwen workaround làm MiniMax regression | Request snapshot/isolation test và live MiniMax canary |
| Job chạy nhầm endpoint | Worker resolve từ persisted profile; không fallback |
| Readiness profile A mở khóa profile B | Cache/probe keyed theo profile ID + fingerprint |
| Policy đổi sau create | Worker chặn fingerprint mismatch thành `interrupted`; rerun canonical snapshot policy mới |
| Secret lộ qua public profile | Explicit allowlist serialization |
| Job cũ bị rewrite | Compatibility read tests và snapshot trước/sau |
| Structured output bị provider bỏ qua | Parser/semantic validation vẫn authoritative |
| Local tests tạo false confidence | Bắt buộc live fixture evidence theo exact job |
| Benchmark trộn cấu hình | Fingerprint gồm profile/model/policy/prompt/config |
| Framework hóa quá mức | Registry tĩnh, một shared runner, không dynamic plugin/SDK |
| Xóa nhánh quá sớm | Archive/tag và chỉ xóa sau live gate + user approval |

## 15. Ranh giới mở rộng sau này

GPT, Gemma, các Qwen model khác, Paddle-VL và Anthropic-compatible không thuộc Definition of
Done hiện tại. Khi có model/endpoint thật:

1. Nếu vẫn OpenAI-compatible và policy biểu diễn được bằng `ProfileSpec`, thêm
   exact profile ID/module data và focused isolation test.
2. Nếu transport khác thật sự, lúc đó mới thiết kế transport seam nhỏ dựa trên
   request/response thật; không dự đoán adapter trong scope này.
3. Mọi profile mới vẫn phải qua allowlist, local gate và live evidence phù hợp
   trước khi có quality claim.

## 16. Definition of Done

### 16.1 Local complete

- Branch `restructure_pj` chứa MiniMax và Qwen bằng runtime configuration.
- Hai profile có module policy data-only độc lập và một shared OpenAI-compatible
  runner; không cần checkout model branch để đổi profile.
- Job chạy đúng persisted profile/fingerprint qua create/start/continue/worker và
  rerun canonical snapshot policy hiện tại.
- Readiness/cache tách theo profile/fingerprint; không failover.
- MiniMax request parity và Qwen request isolation assertions pass.
- Job legacy đọc được, không rewrite; `qwen` và `ollama_qwen35_9b` legacy không
  Continue/rerun/relabel.
- Không lộ provider secret/raw response; full local gate pass.
- `BE-X20`/`FE-X20`, README, AGENTS và incomplete ledger khớp implementation.

### 16.2 Live complete

- MiniMax và Qwen có evidence mới trên đủ bốn external fixtures.
- MiniMax không regression; Qwen được đánh giá theo threshold user chốt sau Phase 0.
- Không có cross-profile config/measurement leakage.
- Backup, restart và rollback rehearsal pass.
- Chỉ sau đó mới cutover và retire `ollama`; merge/commit/xóa branch vẫn là hành
  động riêng cần user yêu cầu.

## 17. Tiêu chí dừng hoặc quay lui

Dừng rollout và quay lại image/commit trước nếu có một trong các dấu hiệu:

- MiniMax field coverage/blocker tăng bất thường so với baseline cùng fixture;
- job dùng sai profile/model/fingerprint;
- readiness cache trả kết quả chéo profile;
- persisted job bị rewrite khi chỉ đọc;
- usage/attempt bị mất hoặc cộng trùng;
- secret/private provider config xuất hiện trong API, job, artifact hoặc log;
- active/waiting/restart semantics lệch contract hiện hành.

Rollback code không đồng nghĩa restore dữ liệu. Chỉ restore backup khi xác minh dữ
liệu thực sự hỏng; trước đó dùng image cũ đọc bản sao `OCR_DATA_DIR` để chứng minh
compatibility.

## 18. Quyết định tối giản được khóa

- Triển khai trên `restructure_pj` từ `master`; không cherry-pick/merge nguyên
  `ollama`, không tự commit.
- Một `master` sau cutover, không branch dài hạn theo model.
- Hai profile đồng thời: `minimax` và `ollama_qwen3_vl_8b`; không auto-failover.
- Exact model thuộc profile; policy/config version tạo safe fingerprint và chặn
  execution khi drift.
- Một shared OpenAI-compatible runner.
- Registry tĩnh, không dynamic plugin loader.
- Frozen data-only modules riêng; một common env loader, không callback tùy ý.
- Timeout riêng theo profile; readiness probe nhẹ với cache 30 giây theo fingerprint.
- MiniMax giữ request `master`; Qwen thinking bật, structured output tắt, token cap
  chưa gửi trước baseline và content order riêng.
- Không transport-neutral abstraction trước khi provider khác transport thật xuất hiện.
- Không public provider configuration screen.
- Không đổi public schema hoặc lưu provider selection trong browser.
- Không database, provider SDK hoặc config service.
- Không coi readiness/local tests là OCR quality evidence.

Đây là phạm vi nhỏ nhất giải quyết đúng nguyên nhân hiện tại: provider identity đã
được persist và frontend đã hiểu nhiều profile, nhưng backend chưa resolve runtime
theo identity đó và Qwen policy vẫn nằm trong shared path.
