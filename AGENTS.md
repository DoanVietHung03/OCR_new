# OCR monorepo handoff

## Current state

The repository now has an isolated Phase 2/3 two-package migration stack. The
current production runtime remains `src/ocr/` plus static `web/`; do not move
or delete it until the Phase 4 cutover gate in `implementation_plan.md` passes.

## Target stack

- `frontend/`: Next.js App Router + TypeScript.
- `backend/`: Python 3.12, async FastAPI, Pydantic v2, Celery + Redis.
- Filesystem state under `data/jobs/` remains durable; Redis is broker/result
  backend only.
- OCR uses one OpenAI-compatible HTTP endpoint. Do not add provider SDKs or a
  database without an approved requirement.

## Architecture rules

- FastAPI must never execute long OCR work in an HTTP request; Celery owns it.
- Preserve current `/api/*` routes, response fields, statuses, job layout,
  artifact paths, crop ownership validation, correction audit, and safe errors
  through cutover. The current UI depends on them.
- Pydantic v2/OpenAPI is the source of truth for shared API types. Generate
  frontend types from OpenAPI; do not duplicate backend DTOs by hand.
- Keep frontend dependency-light: Next/React, CSS, and native browser APIs
  first. Use CSS and minimal React state/context; do not add a UI kit, state
  manager, database, or a second type package by default.
- Do not put API keys in source, generated artifacts, job JSON, or logs.

## Expected layout after Phase 0

```text
backend/app/{api,schemas,services,workers}/
backend/tests/
frontend/{app,components,lib,public}/
package.json
pnpm-workspace.yaml
docker-compose.yml
```

Use Node 22/pnpm for `frontend` and Python 3.12/`uv --project backend` for
Python. A Python workspace is unnecessary while there is one backend package.

## Locked rollout decisions

- Production Compose runs Nginx, frontend, backend, worker, and Redis under
  one domain. Nginx routes `/api/*` to FastAPI; TLS is handled outside Compose.
- Frontend uses Next standalone output and relative browser API calls. One root
  server `.env` supplies backend/worker secrets; frontend has none.
- `OCR_DATA_DIR` is a host bind mount shared by backend/worker. Back it up,
  pause incoming work, and drain Celery before cutover. Never run two worker
  versions against it. Legacy rollback window is one day.
- Preserve internal-only access, API compatibility, existing job/artifact data,
  polling, Celery/Redis, and sequential job processing. Do not add auth,
  WebSocket, auto-retention, persistent code catalog, or host telemetry.
- Port UI with visual parity and valid VI/EN UTF-8. Preserve the existing
  `intellidoc.language` localStorage preference; Vietnamese is default.
- Commit generated OpenAPI TypeScript types and check they are current. Add a
  fake-provider Playwright smoke test; provider-real testing is strong-server
  acceptance only.

## Working rules

1. Read `implementation_plan.md` and crawl `.codegraph/codegraph.db` before
   proposing a structural migration change. Confirm caller/route flow, not just
   filenames.
2. Keep a milestone independently runnable before starting the next one.
3. Add focused tests for non-trivial behavior. Local tests must not require
   Redis, Celery, GPU, Docker, or a real provider.
4. Do not delete legacy `src/`/`web/` until an explicit post-cutover cleanup.
5. Update this file, `README.md`, and the plan when architecture or commands
   materially change.
