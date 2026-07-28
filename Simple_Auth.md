# Simple Auth — shared demo login

**Trạng thái:** `APPROVED PLAN — chưa triển khai`

**Ngày khóa scope:** 2026-07-28

**Đích:** thêm một cổng đăng nhập/đăng xuất cơ bản cho bản demo OCR nội bộ tại
`http://10.6.18.1:54846`, dùng đúng một cặp username/password dùng chung.

File này là đặc tả chi tiết của `BE-X19`/`FE-X19`.
[`implementation_plan.md`](implementation_plan.md) và
[`frontend_plan.md`](frontend_plan.md) vẫn là hai chủ sở hữu canonical cho
backend/frontend; không chép toàn bộ nội dung file này sang hai kế hoạch đó.

## 1. Quyết định đã chốt

- Giữ URL `http://10.6.18.1:54846`; không thêm HTTPS, certificate, OIDC,
  `oauth2-proxy` hoặc Identity Provider.
- Nginx sở hữu duy nhất host bind `10.6.18.1:54846`; frontend, backend, Redis và
  worker không publish host port trong deployment auth.
- Có một username và password dùng chung. Không có user database, đăng ký, quên
  mật khẩu, đổi mật khẩu trong UI, role, ownership hoặc permission matrix.
- Audit OCR tiếp tục dùng `actor="anonymous"`; username dùng chung chỉ để đăng
  nhập/hiển thị, không trở thành danh tính nghiệp vụ.
- Username và password hash `scrypt` nằm trong `.env`; không lưu password
  plaintext. Password tối thiểu 6 ký tự.
- Session là signed cookie stateless, tuyệt đối 8 giờ, không refresh và không
  “Ghi nhớ đăng nhập”.
- Đổi username/password hash làm hết hiệu lực mọi session ở request kế tiếp.
  Đổi session secret cũng logout toàn bộ.
- Logout thường chỉ xóa session của trình duyệt hiện tại.
- Toàn bộ UI/API/PDF/artifact/report/log/sizing/monitor/guide được bảo vệ. Chỉ
  login, asset cần cho login và health được public.
- Chỉ hỗ trợ browser; không thêm API key, machine token hoặc service account.
- Login có rate limit 10 lần/phút/client IP; không account lockout.
- Hết session khi đang sửa mở modal đăng nhập lại, giữ draft và không tự replay
  mutation đã thất bại.
- Local development/test có thể dùng auth disabled; deployment auth phải fail
  closed nếu thiếu cấu hình.

## 2. Phạm vi bảo vệ và giới hạn được chấp nhận

Đây là **demo access gate**, không phải customer-production authentication.
Mục tiêu là ngăn truy cập tình cờ hoặc người trong mạng nội bộ không có
credential dùng chung.

Vì URL vẫn là HTTP:

- password và cookie không được mã hóa trên đường truyền;
- người trong LAN chủ động nghe lén traffic có thể lấy credential/session;
- cookie không thể đặt thuộc tính `Secure`;
- scope này không được gọi là Internet-safe, zero-trust hoặc
  customer-production-ready.

Rủi ro này đã được chấp nhận rõ ràng cho demo nội bộ. Khi cần chống nghe lén,
phải mở một architecture request riêng để thêm HTTPS; không âm thầm gắn nhãn an
toàn hơn cho HTTP.

## 3. Kiến trúc đích

```text
Browser
  │ HTTP http://10.6.18.1:54846
  ▼
Nginx host bind 10.6.18.1:54846
  ├─ public login/static/health
  ├─ protected UI ─────────────► Next.js :54846 (Compose private)
  └─ /api/* ───────────────────► FastAPI :50177 (Compose private)
                                      │
                                      ├─ auth/session guard
                                      ├─ OCR_DATA_DIR
                                      └─ Celery/Redis/provider flow hiện có
```

FastAPI sở hữu credential validation, signed cookie và API auth dependency.
Nginx dùng auth subrequest cho protected UI, nhưng `/api/*` vẫn để dependency
chung của FastAPI trả JSON `401`; không thêm BFF hoặc auth service mới.

Worker không đọc cookie và không biết username. Mọi durable OCR workflow, schema
actor và `data/jobs` giữ nguyên.

## 4. Route contract

| Route/surface | Khi chưa có session |
|---|---|
| `/health` | Public; chỉ trả `{"status":"ok"}` |
| `/login` | Public |
| `/_next/static/*` và asset tối thiểu của login | Public |
| `POST /api/auth/login` | Public nhưng vẫn qua Origin/custom-header guard |
| `GET /api/auth/session` | Trả JSON `401 auth_required` |
| `POST /api/auth/logout` | Luôn xóa cookie và trả `204`, kể cả session đã hết |
| Mọi `/api/*` khác, PDF và artifact | JSON `401 auth_required` |
| Mọi UI route khác, gồm `/guide` | Redirect tới `/login?returnTo=...` |

Sau login:

- `returnTo` hợp lệ quay lại đúng route ban đầu;
- mở `/login` trực tiếp thì về Jobs `/`;
- chỉ chấp nhận relative path nội bộ bắt đầu bằng một `/`, không có scheme,
  host hoặc prefix `//`;
- logout luôn về `/login`.

Protected HTML/API/artifact dùng `Cache-Control: no-store`; Next static asset có
hash vẫn được cache immutable.

## 5. Cấu hình và credential

### Deployment

```dotenv
OCR_AUTH_MODE=shared
OCR_PUBLIC_ORIGIN=http://10.6.18.1:54846
OCR_AUTH_USERNAME=ocr
OCR_AUTH_PASSWORD_HASH=scrypt:...
OCR_AUTH_SESSION_SECRET=<64-hex-characters>
```

### Local development/test

```dotenv
OCR_AUTH_MODE=disabled
```

Contract:

- Chỉ nhận `disabled|shared`; giá trị khác fail startup.
- `shared` thiếu origin, username, password hash hoặc session secret thì fail
  startup; không fallback sang `disabled`.
- Username dài 1–64 ký tự, trim hai đầu và so sánh phân biệt hoa/thường.
- Password giữ nguyên chính xác, không trim. Helper từ chối password dưới 6 ký tự.
- `.env.example` chỉ chứa placeholder; `.env` không thuộc Git.
- Không log hoặc đưa credential/session secret vào API, job JSON hay browser
  storage.

Backend cung cấp lệnh tương tác:

```powershell
uv run --project backend python -m app.auth hash-password
```

Lệnh dùng `getpass`, hỏi password hai lần, tạo salt ngẫu nhiên và in duy nhất
giá trị `scrypt:<params>:<salt>:<digest>` bằng URL-safe base64 để operator dán
vào `.env`. Format không dùng `$`, tránh Compose nội suy nhầm biến. Password
không xuất hiện trong command line hoặc shell history.

Password hash dùng Python stdlib `hashlib.scrypt`; kiểm tra digest bằng
`hmac.compare_digest`. Không thêm auth/password dependency.

Session secret được tạo bằng:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Giữ secret ổn định qua restart. Rotate secret khi cần logout mọi trình duyệt.

## 6. Session cookie

Cookie đích:

| Thuộc tính | Giá trị |
|---|---|
| Tên | `ocr_session` |
| `HttpOnly` | `true` |
| `SameSite` | `Lax` |
| `Secure` | `false` vì deployment đã chốt HTTP |
| `Path` | `/` |
| `Domain` | Không đặt |
| Max age | `8h` tuyệt đối từ lúc login |

Cookie là payload JSON/base64 nhỏ kèm HMAC-SHA256; không dùng JWT. Payload chỉ
gồm issued time, expiry và credential-version fingerprint, không chứa password,
password hash hoặc dữ liệu tài liệu.

Validation:

1. Kiểm tra cấu trúc/kích thước cookie.
2. Xác minh HMAC bằng `OCR_AUTH_SESSION_SECRET`.
3. Từ chối cookie hết hạn hoặc issued time bất hợp lý.
4. So credential-version với username/password hash hiện tại.
5. Trả `401 auth_required` cho cookie thiếu/sai/hết hạn.

Session không có Redis/database/store. Backend restart giữ session nếu `.env`
không đổi. Logout xóa cookie hiện tại; đổi credential/session secret vô hiệu hóa
toàn bộ.

## 7. Backend contract

Giữ module auth nhỏ, dùng chung một seam:

```python
hash_password(...)
verify_password(...)
issue_session(...)
current_session(...)
require_authenticated(...)
require_safe_browser_request(...)
```

Public API tối thiểu:

```text
POST /api/auth/login
GET  /api/auth/session
POST /api/auth/logout
```

Response authenticated chỉ cần:

```json
{
  "authenticated": true,
  "username": "ocr",
  "expires_at": "..."
}
```

Không trả password hash, credential version, session payload/signature, role,
permission hoặc environment config.

`OCR_AUTH_MODE=disabled` giữ behavior/test hiện tại và `actor="anonymous"`.
`shared` áp auth dependency cho toàn `/api` router ngoại trừ allowlist auth và
health. Mutation không nhận username/actor từ body, query hoặc browser header.

Public Pydantic/OpenAPI là canonical; frontend phải dùng generated types.

## 8. CSRF, rate limit và log

### CSRF tối thiểu

- Mọi `POST`, `PUT`, `PATCH`, `DELETE` từ frontend thêm
  `X-OCR-Request: browser`.
- Trong `shared`, unsafe request thiếu header trả `403 csrf_rejected`.
- Nếu có `Origin`, giá trị phải đúng `OCR_PUBLIC_ORIGIN`; origin khác hoặc
  malformed bị từ chối.
- `GET`/`HEAD` không thay đổi durable state.
- Không thêm CSRF token/store hoặc CORS wildcard.

### Login rate limit

- Nginx giới hạn `POST /api/auth/login` ở 10 request/phút/client IP.
- Cho burst nhỏ để sửa lỗi gõ; vượt ngưỡng trả `429`.
- Không account lockout vì credential được dùng chung.
- Sai username hoặc password luôn trả cùng `401 invalid_credentials`.

### Log

Chỉ ghi timestamp, source IP, normalized route, outcome
`success|failed|rate_limited`, HTTP status và duration. Không log username nhập
vào, password, password hash, cookie, session secret, request body hoặc document
text. Không tạo auth database, login-history UI hoặc dữ liệu auth trong
`data/jobs`.

## 9. Frontend UX

### Login

- Trang `/login` toàn màn hình, đồng bộ CSS/brand IntelliDoc OCR hiện có.
- Username và Password; `autocomplete="username"` /
  `autocomplete="current-password"`.
- Hiện/ẩn password, cảnh báo Caps Lock, loading state và generic error.
- Giữ VI mặc định, VI/EN và
  `localStorage["intellidoc.language"]`; không lưu auth data vào localStorage.
- Không signup, forgot password, change password, profile hoặc admin link.
- Responsive tại `1440×900`, `1366×768`, `390×844`.

### AppShell và Logout

Vùng `sidebar-tools` hiện có nhận thêm:

- username dùng chung;
- nút Đăng xuất cạnh/bên dưới VI/EN;
- collapsed sidebar chỉ hiện icon với tooltip/ARIA label;
- mobile hiển thị trong menu đang mở.

Không thêm avatar menu, role badge hoặc profile page.

### Hết session và draft safety

Khi request trả `401 auth_required`:

1. Không reload/redirect trang đang làm việc.
2. Mở modal đăng nhập lại ngay tại chỗ.
3. Giữ correction/segmentation draft trong memory.
4. Login lại thành công thì read/poll có thể tiếp tục.
5. Không tự replay mutation thất bại; người dùng bấm lại hành động.

Shared API helper phát một native `CustomEvent`; không thêm state manager.

Logout xóa cookie của browser hiện tại, quay về `/login`, và protected response
`no-store` không cho Back/refresh đọc lại dữ liệu cache. Tab khác nhận `401` ở
request tiếp theo; không thêm cross-tab session framework.

## 10. Nginx và Compose target

Deployment auth:

- Nginx publish duy nhất `10.6.18.1:54846:80`.
- Bỏ host publish `52409`.
- Bỏ `ports: ["54846:54846"]` khỏi frontend.
- Backend `50177`, frontend `54846`, Redis `6380`, worker chỉ ở Compose network.
- Nginx public allowlist đúng mục 4; UI còn lại dùng auth subrequest.
- `/api/*` proxy trực tiếp tới FastAPI để giữ JSON error/upload behavior.
- Giữ `client_max_body_size 200m`; auth không tạo `413` hoặc timeout mới.
- Browser tiếp tục gọi relative `/api/*`; không thêm CORS/BFF.

Direct local development vẫn có thể chạy backend `50177` và frontend `54846`
với `OCR_AUTH_MODE=disabled`. Đây không phải deployment auth.

Nếu host không có IP `10.6.18.1`, Compose phải fail bind thay vì tự mở trên
`0.0.0.0`.

## 11. Phạm vi file dự kiến

| Khu vực | File/phạm vi dự kiến |
|---|---|
| Backend auth | `backend/app/auth.py`, `settings.py`, `main.py`, API router/schema |
| Frontend | shared API helper, AppShell, i18n, `/login`, CSS |
| Edge | `nginx/nginx.conf`, `docker-compose.yml`, `.env.example` |
| Generated contract | `frontend/openapi.json`, `frontend/lib/api-schema.ts` |
| Checks | focused backend tests và Playwright login/session tests |
| Docs | hai canonical plans, `AGENTS.md`, `README.md`, `incomlpeted.md` khi cần |

Đây là blast radius dự kiến, không phải lệnh sửa mọi file. Trước implementation
phải dùng CodeGraph trên symbol/route hiện tại và chỉ sửa file thật sự cần.

## 12. Thứ tự triển khai

1. **Backend seam:** settings, scrypt helper, signed cookie, auth endpoints,
   router dependency, CSRF và focused tests.
2. **Frontend UX:** generated types, login, returnTo, AppShell logout,
   session-expired modal và draft test.
3. **Edge:** Nginx allowlist/auth subrequest/rate limit, đổi host port ownership,
   đóng direct-port bypass.
4. **Regression:** OpenAPI/types, backend, browser, build, compile và diff checks.
5. **Live demo:** bind đúng IP/port, credential thật ngoài Git, login/logout,
   upload/review/artifact smoke và rollback.

Không triển khai OIDC/TLS/user management “cho sau này”.

## 13. Kiểm thử bắt buộc

### Backend

- `disabled` giữ API behavior và actor hiện tại.
- `shared` thiếu config fail startup; thiếu/sai session trả `401`.
- Login đúng/sai; username trim/case-sensitive; password không trim.
- Helper từ chối password dưới 6 ký tự.
- Cookie hợp lệ, hết 8 giờ, bị sửa, malformed hoặc credential-version cũ.
- Đổi username/password hash/session secret vô hiệu hóa session như contract.
- Logout xóa đúng cookie.
- Unsafe request thiếu header hoặc sai Origin trả `403`.
- `/health` public; protected API/PDF/artifact không public.
- Error/OpenAPI/log không lộ secret/hash/cookie.
- Old job đọc không rewrite; auth không thay durable OCR schema.

### Frontend/Playwright

- Login VI/EN, keyboard, show/hide password, Caps Lock và generic error.
- `returnTo` nội bộ thành công; `//host`/absolute URL bị từ chối.
- Login trực tiếp về Jobs.
- Sidebar username/logout hoạt động ở expanded/collapsed/mobile.
- Logout rồi Back/refresh không đọc protected cache.
- Simulated expiry giữ correction/segmentation draft.
- Re-login tiếp tục read/poll; mutation không auto-replay.
- Ba viewport không overflow, modal đóng được.

### Nginx/Compose live

- Chỉ `10.6.18.1:54846` reachable; `52409`, frontend/backend/Redis ports không
  reachable từ client network.
- Không session: UI về login, API JSON `401`, health `200`.
- Cookie có `HttpOnly`, `SameSite=Lax`, `Path=/`, không `Domain`; xác nhận rõ
  `Secure=false` vì HTTP.
- 10 login request/phút/IP và generic `401` không gây account lockout.
- Upload trên 1 MiB và tối đa 15 PDF không `413`.
- Full browser OCR smoke qua auth; log không chứa credential/cookie/document text.

### Regression gate

```powershell
uv run --project backend pytest backend/tests -q
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
python -m compileall -q backend/app
git diff --check
```

## 14. Rollout, recovery và rollback

Trước deployment change vẫn tạm dừng upload, drain worker và backup
`OCR_DATA_DIR` theo runbook hiện có.

Rollout:

1. Tạo username, password hash và session secret ngoài Git.
2. Chạy tests/build/OpenAPI check.
3. Validate `docker compose config` và Nginx config.
4. Deploy với Nginx sở hữu `10.6.18.1:54846`.
5. Từ client thật kiểm tra login, returnTo, logout, CSRF, rate limit, direct-port
   closure và full OCR smoke.

Recovery:

- Quên password: operator tạo hash mới, sửa `.env`, restart backend.
- Muốn logout toàn bộ: đổi password hash hoặc session secret.
- Auth/config lỗi: operator truy cập trực tiếp server, tạm đặt
  `OCR_AUTH_MODE=disabled`, restart và sửa lỗi. Không có browser bypass/master
  password.

Rollback image/config về phiên bản liền trước. Auth không đổi `OCR_DATA_DIR`,
job schema hoặc actor nên không restore dữ liệu trừ khi dữ liệu thực sự hỏng.

## 15. Điều kiện hoàn thành

`BE-X19`/`FE-X19` chỉ được đóng khi:

- một shared credential, một policy full access, không permission branch;
- login/logout/returnTo/expiry/draft flow pass;
- toàn protected surface bị chặn khi thiếu session;
- host chỉ expose `10.6.18.1:54846`, không direct-port bypass;
- password hash, signed cookie, CSRF và rate limit đúng contract;
- credential/session secret không vào Git/API/job/browser storage/log;
- actor vẫn `anonymous`, old job không rewrite;
- full OCR smoke và toàn bộ required local checks pass;
- tài liệu mô tả trung thực rằng HTTP chỉ là demo access gate.

Scope này độc lập với sign-off Milestone C và không biến hệ thống thành
customer-production-ready.
