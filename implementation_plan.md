# Kế hoạch refactor monorepo OCR

**Trạng thái:** Phase 4 — Planning

**Quyết định:** Chưa tạo package hay di chuyển mã trong phase này. Backend FastAPI hiện tại vẫn là runtime nguồn cho đến khi cutover được xác nhận.

## Progress

* [x] Audit codebase bằng Codegraph/AST và xác nhận public API hiện hữu.
* [x] Thiết kế đích monorepo, API contract, và mapping migration.
* [x] Cập nhật tài liệu handoff (`AGENTS.md`, `README.md`).
* [x] Chốt quyết định kiến trúc/deployment với owner.
* [x] **Phase 0 — Technical Research & Documentation Audit (Python 3.12 focus)**.
* [x] Phase 1 — Scaffold workspace và kiểm tra các lệnh dev/build rỗng.
* [x] Phase 2 — Port backend async/Pydantic v2, giữ nguyên API contract.
* [x] Phase 3 — Port UI sang Next.js App Router.
* [ ] Phase 4 — Integration, cutover, và loại bỏ legacy sau rollback window.

---

## 1. Codebase audit & mapping

### Bằng chứng audit

Codegraph database `.codegraph/codegraph.db` đã được đọc trước khi lập kế hoạch:

* 12 file được index, gồm 6 Python production files, 4 test files và 2 JS files.
* Graph có 382 nodes, 1,770 edges; các edge cross-file xác nhận luồng `app.py -> jobs.py`, `app.py -> tasks.py`, `tasks.py -> jobs.py/runner.py`.
* `web/app.js` là SPA vanilla khoảng 4,000 dòng: dữ liệu khởi tạo qua `window.INTELLIDOC_DATA`, sau đó polling `/api/state` và `/api/jobs/{id}`.
* Backend hiện cung cấp tạo/upload/start/poll/cancel/rerun, engine check, crop, corrections, delete preview/bulk delete, artifact và system metrics.

Luồng dữ liệu cần giữ nguyên khi port:

```text
Next browser UI -> FastAPI JSON API -> job filesystem
                                      -> Celery/Redis -> OpenAI-compatible VLM
                                      -> PDF page/crop artifacts

```

`data/jobs/<job-id>/` là persistent state. Redis chỉ là broker/result backend, không trở thành nguồn dữ liệu hay database.

### Mapping table

| Hiện tại | Vai trò đã xác nhận | Đích | Cách chuyển |
| --- | --- | --- | --- |
| `src/ocr/app.py` | FastAPI routes, static HTML, API envelope | `backend/app/api/` + `backend/app/main.py` | Tách router theo resource; giữ path và JSON shape trong lúc migration. Bỏ static serving sau cutover. |
| `src/ocr/jobs.py` | Job filesystem, quota, path validation, transitions | `backend/app/services/jobs.py`, `backend/app/schemas/jobs.py` | Giữ layout job và atomic write; Pydantic v2 xác thực request/response tại biên API. |
| `src/ocr/tasks.py` | Celery dispatch, PDF render, background OCR | `backend/app/workers/tasks.py` | Giữ Celery/Redis và page-by-page persistence; coroutine/API code không chạy OCR trong HTTP request. |
| `src/ocr/runner.py` | OpenAI-compatible VLM HTTP contract | `backend/app/services/ocr_runner.py`, `settings.py` | Dùng `httpx.AsyncClient` trong async service; worker gọi async entrypoint rõ ràng. Không thêm provider SDK. |
| `src/ocr/__main__.py` | Uvicorn entrypoint | `backend/app/main.py` | `uvicorn app.main:app --reload` cho dev. |
| `web/index.html` | Shell duy nhất | `frontend/app/layout.tsx`, `frontend/app/page.tsx` | Port semantic shell/accessibility; không giữ `INTELLIDOC_DATA` injection. |
| `web/app.js` | SPA state, render, upload, polling, crop, corrections, reporting | `frontend/app/**/page.tsx`, `frontend/components/`, `frontend/lib/api.ts` | Chia theo route/domain, giữ hành vi; server data qua typed API client. Không mang toàn bộ file monolith sang một component. |
| `web/i18n.js` | VI/EN dictionary | `frontend/lib/i18n.ts` | Chuyển dictionary thuần TypeScript, không thêm i18n framework. |
| `web/styles.css` | Responsive styles/tokens | `frontend/app/globals.css` | Port CSS trước; không thêm UI kit chỉ để refactor. |
| `tests/*.py` | unittest contract checks | `backend/tests/` | Chuyển test theo module; thêm API contract/regression tests không gọi VLM thật. |
| `pyproject.toml`, `requirements.txt` | Python packaging/runtime deps | `backend/pyproject.toml` | Python `>=3.12`, FastAPI, Pydantic v2, Celery/Redis/PyMuPDF/Uvicorn; một nguồn dependency là `pyproject.toml`. |

---

## 2. Target architecture

```text
.
├── backend/
│   ├── app/
│   │   ├── api/                 # jobs, engines, metrics routers
│   │   ├── schemas/             # Pydantic v2 request/response models
│   │   ├── services/            # job store, OCR runner, crop/correction logic
│   │   ├── workers/             # Celery app and tasks
│   │   ├── settings.py          # environment-only configuration
│   │   └── main.py              # async FastAPI application
│   ├── tests/
│   ├── pyproject.toml
│   └── uv.lock                  # generated in Phase 1
├── frontend/
│   ├── app/                     # App Router pages/layout/globals.css
│   ├── components/              # UI grouped by jobs, upload, document, reports
│   ├── lib/                     # typed API client, i18n, pure formatters
│   ├── public/
│   ├── package.json
│   └── next.config.ts
├── package.json                 # private root scripts only
├── pnpm-workspace.yaml          # `frontend` workspace
├── docker-compose.yml           # Nginx, API, worker, Redis, frontend; Phase 1
├── .env.example
├── AGENTS.md
├── README.md
└── implementation_plan.md

```

### Workspace and runtime policy

* **Python Runtime:** Chuẩn hóa toàn bộ backend và worker trên **Python 3.12**.
* Use `pnpm` workspaces for JavaScript. Only `frontend` is a Node workspace; the root package has orchestration scripts, not application code. Pin Node 22 and the pnpm version in `.nvmrc` and `packageManager`.
* Use `uv` for the independent Python backend project. A Python workspace is unnecessary with one Python package; `uv sync --project backend` is enough.
* `docker-compose.yml` is the strong-server runtime with Nginx, `frontend`, `backend`, `worker`, and `redis`. Local unit checks must not need Docker, Redis, GPU, or an OCR provider. TLS stays outside Compose.
* Browser calls `/api/*`; development uses a Next rewrite to the backend. Production Nginx sends `/api/*` to FastAPI and everything else to Next. This avoids CORS configuration and preserves the current API paths.
* `frontend` uses Next `output: "standalone"`. `backend` and `worker` receive a root server-only `.env`; browser code calls relative `/api/*` and receives no secrets. Both services bind mount host `OCR_DATA_DIR`, which is backed up before cutover.

### Shared types and API schema

Pydantic v2 schemas in `backend/app/schemas/` are canonical. FastAPI exposes OpenAPI at `/openapi.json`. Generate `frontend/lib/api-schema.ts` from that file whenever an API model changes, commit it, and verify it is current in CI/scripts; do not hand-maintain duplicate job, document, field, error, or lifecycle interfaces. Keep UI-only state types in the frontend. The generator command and generated-file check belong in Phase 1, after both packages exist.

### Approved product and rollout decisions

* Preserve every existing `/api/*` path, response shape, status, artifact URL, job JSON, and `data/jobs/` layout. Existing jobs/artifacts open without data migration.
* Keep access internal-only with no application auth. Retain Celery + Redis, sequential per-job processing, and polling; do not add WebSocket, database, provider SDKs, actual host telemetry, or auto-retention.
* Next uses `/` for dashboard/upload/job list and `/jobs/[jobId]` for job results/editing. Browser fetches the typed FastAPI API directly; Next is not a BFF.
* UI has visual/behavioral parity, CSS only, minimal React state/context, and no UI/state library. Repair VI/EN resources as valid UTF-8, retaining `localStorage["intellidoc.language"]` with Vietnamese default. Code catalog remains UI-only and nonpersistent.
* Playwright supplies one fake-provider smoke flow: upload, polling, job page, correction/crop, and delete preview. Real provider testing is strong-server acceptance only.
* Cutover pauses new jobs, drains Celery, then switches Nginx. Legacy remains rollback-ready for one day; legacy/new workers never share a job directory.

---

## 3. Step-by-step refactoring strategy

### Phase 0 — Technical Research & Documentation Audit (Python 3.12 Focus)

> **Mục tiêu:** Codex bắt buộc tra cứu và tổng hợp các thay đổi, breaking changes, khuyến nghị mới nhất từ documentation chính thức của các thư viện trước khi viết dòng code scaffold/port nào.

1. **Python 3.12 Compatibility Audit:**
* Kiểm tra các breaking changes/deprecations trong Python 3.12 (như `datetime.utcfromtimestamp`, module `asyncio`, type hinting syntax mới với `PEP 695`).
* Đảm bảo tất cả thư viện dự kiến (`FastAPI`, `Pydantic v2`, `Celery`, `PyMuPDF/fitz`, `httpx`, `uvicorn`, `uv`) có release build tương thích hoàn toàn với Python 3.12.


2. **Framework & Library Docs Research:**
* **FastAPI & Pydantic v2:** Rà soát pattern mới nhất cho async dependency injection, Pydantic v2 `BaseModel` settings (`pydantic-settings`), custom serializers/validators, và OpenAPI schema export.
* **Celery & Async/Redis:** Tra cứu hướng dẫn mới nhất về cấu hình Celery runner trên Python 3.12, xử lý event loop giữa Celery worker và `asyncio` task, cùng cơ chế connection pool Redis.
* **uv & Packaging:** Tra cứu tài liệu `uv` mới nhất cho việc quản lý `pyproject.toml`, lockfile (`uv.lock`), và cấu hình virtual environment chuẩn.
* **Next.js App Router & pnpm:** Tra cứu best practices mới nhất về App Router (standalone output, client vs server components, rewrite proxies) và configuration trong `pnpm-workspace.yaml`.


3. **Đầu ra Phase 0:** Tạo file `docs/techstack_research_notes.md` ghi lại các phát hiện, khuyến nghị cú pháp, và danh sách phiên bản cụ thể trước khi bấm nút chạy Phase 1.

**Gate:** `docs/techstack_research_notes.md` được phê duyệt với đầy đủ xác nhận tương thích Python 3.12 và pattern Pydantic v2 / FastAPI async mới nhất.

---

### Phase 1 — Setup workspace

1. Create the directory skeleton, root `package.json`, `pnpm-workspace.yaml`, `backend/pyproject.toml` (chỉ định `requires-python = ">=3.12"`), `frontend` Next TypeScript app, `.env.example`, and compose file.
2. Move nothing yet. Verify `pnpm --dir frontend dev`, `pnpm --dir frontend build`, `uv sync --project backend`, and backend import/test commands.
3. Add the OpenAPI-to-TypeScript generation/check command but do not add a second shared-types package.

**Rollback:** Delete only newly created workspace scaffolding; legacy `src/`, `web/`, tests, and server startup remain untouched.

---

### Phase 2 — Core backend

1. Port constants and durable `JobStore` behind Pydantic v2 request/response schemas; retain job directory format, IDs, statuses, artifact URLs, limits, correction audit, and safe path checks.
2. Port API routes one resource at a time while preserving all existing paths and error envelope behavior used by the frontend.
3. Port worker/render/OCR runner. Make FastAPI route handlers async; use `httpx.AsyncClient` for provider HTTP. Celery continues to own long work.
4. Move and extend focused unittest coverage for filesystem boundaries, schema serialization, and API contracts with fake dispatch/provider.

**Gate:** Backend passes tests trên Python 3.12 runtime và serves the same route contract against a temporary `OCR_DATA_DIR`.

**Rollback:** Route traffic remains on legacy app; new backend is isolated by port/reverse-proxy target until this gate passes.

---

### Phase 3 — Frontend UI

1. Port CSS tokens and app shell, then pages in this order: job list/upload, job detail/polling, document review/corrections/crop, reports and metrics.
2. Replace mutable global `DATA` and event delegation with local React state, preserving polling intervals, keyboard behavior, labels, and accessible controls.
3. Use the generated API types in the thin `lib/api.ts` fetch wrapper. Keep browser-only interactions in client components; default to server components for static shell/layout.

**Gate:** Next production build succeeds; each current API action has a UI path verified against the Phase 2 backend.

**Rollback:** Legacy static `web/` remains deployed and can be routed back without converting persisted jobs.

---

### Phase 4 — Integration, cutover, cleanup

1. Run backend/frontend unit checks, generated schema check, and browser smoke flow: upload, polling, cancel, rerun, artifact read, crop, correction, delete preview/delete, report, and metrics.
2. On the strong server, validate Redis/Celery/provider flow using a non-secret `.env` trên Python 3.12 environment; inspect persistence after API/Redis restart.
3. Switch the reverse proxy/compose entrypoint to Next + FastAPI. Retain the legacy deployment and a filesystem backup for one agreed rollback window.
4. Only after acceptance, remove `src/`, `web/`, root legacy packaging, and duplicate tests in one explicit cleanup change.

**Rollback:** Repoint proxy/compose to the legacy application. No data migration is required because both versions use the same job filesystem during the rollout.

---

## Validation matrix

Implementation status: Phase 2 and Phase 3 complete; Phase 4 local gates complete, strong-server Docker/provider acceptance pending.

| Milestone | Required check |
| --- | --- |
| **Phase 0** | Hoàn thành `docs/techstack_research_notes.md` với kiểm tra tương thích Python 3.12 & API docs mới nhất |
| Phase 1 | frontend typecheck/build; backend import và unit discovery trên Python 3.12 |
| Phase 2 | API contract tests, filesystem/path regression tests, no real provider call |
| Phase 3 | Next build, browser smoke against fake/local backend |
| Phase 4 | Strong-server end-to-end job plus restart/persistence check |

---

## Explicit non-goals

* No database, provider-specific SDK, frontend framework beyond Next/React, shared-types package, GraphQL, or frontend state library is justified by the existing flow.
* No removal of the current application before the Phase 4 acceptance gate.
