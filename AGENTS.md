# OCR monorepo handoff

## Current state

Milestones A and B are implemented and locally verified. The Next.js/FastAPI
stack supports strict PDF upload, typed OpenAPI, one-shot Celery dispatch,
durable job persistence, correction/approval/crop evidence, rerun, and the
PDF-only VI/EN UI. Local coverage includes backend tests, legacy compatibility
tests, mocked browser paths, and a real eager-task/fake-provider browser flow.

Milestone C is not complete. Do not claim production readiness until
`docs/phase4_acceptance.md` contains real Nginx/Redis/Celery/provider, fixture,
restart, cross-version, and rollback evidence. Keep `src/ocr/` and `web/` as the
rollback runtime until the one-day rollback window closes.

## Repository map

- `frontend/`: Next.js App Router, native CSS/browser APIs, generated API types.
- `backend/app/api/`: `/api/*` transport and Pydantic response contracts.
- `backend/app/services/`: durable filesystem state and provider HTTP client.
- `backend/app/workers/`: Celery ownership of render/provider work.
- `backend/tests/`: local contract, lifecycle, persistence, and worker checks.
- `data/jobs/`: durable offline state; Redis is disposable.
- `src/ocr/`, `web/`, `tests/`: legacy rollback runtime.
- `implementation_plan.md`: locked decisions and remaining gate.
- `docs/phase4_cutover_runbook.md`: strong-server commands.
- `docs/phase4_acceptance.md`: sole Milestone C evidence record.

## Architecture invariants

- Accept only PDFs: 15 files/job, 200 MiB/job, 100 pages/PDF, rendered at
  200 DPI.
- FastAPI must not render PDFs or call the provider. Celery owns OCR; eager
  execution is test-only.
- `data/jobs/` JSON and artifacts are durable truth. Do not add a database,
  Redis AOF, or a Redis volume.
- Preserve `/api/*`, artifact URLs, filesystem layout, safe error codes, and
  two-way legacy/new readability through rollback. Legacy extras remain
  readable and reading an old job must not rewrite it.
- Pydantic v2/OpenAPI is canonical for public fields. `frontend/lib/api.ts`
  must consume generated types; do not add handwritten API DTOs.
- `/start` atomically transitions `ready → starting` once. Publish uncertainty
  becomes `interrupted`; never auto-retry or resume a whole job.
- Retry a page once only for a pre-response connection failure or HTTP
  `429/502/503/504`; cap `Retry-After` at 10 seconds. Do not retry read timeout,
  invalid JSON, or validation errors.
- Production Celery always uses `--concurrency=1 --prefetch-multiplier=1`.
- Backend writes before dispatch, worker writes while active, backend writes
  again after terminal. Cancel creates a marker; do not add distributed locks.
- Snapshot provider/model/prompt/external status without URL, key, or headers.
  `OCR_ENDPOINT_EXTERNAL` defaults to `true` and requires per-job consent.
- Persist corrections with original OCR value and immutable audit. Manual crop
  is evidence only. Approval persists even with no correction.
- Rerun copies only source PDFs into a clean job and leaves the old job intact.
- Delete only `uploading`, `ready`, or terminal jobs; never delete active jobs.
- Persist only stable safe errors. Never persist secrets, raw provider
  responses, or unredacted request/response payloads.
- Keep the frontend dependency-light: Next/React, CSS, and native browser APIs;
  no UI kit, state manager, BFF, database, or shared-types package.
- Preserve valid VI/EN UTF-8, Vietnamese default,
  `localStorage["intellidoc.language"]`, and parity checks at `1440×900` and
  `390×844`.

## Runtime contract

- Legacy: `62472`.
- Direct backend: `50177`.
- Direct frontend: `54846`.
- Compose: only Nginx publishes `52409`; backend/frontend/Redis stay internal
  on `50177`/`54846`/`6380`.
- Do not add `BACKEND_PORT`; it does not configure the listener.
- Browser API calls remain relative `/api/*`; TLS terminates outside Compose.

## Working procedure

1. Read `implementation_plan.md` before migration work.
2. Before editing code, use the CodeGraph MCP against `C:\HProjecT\OCR` to
   inspect the target symbols, callers, routes, and blast radius. Do not infer
   flow from filenames or query `.codegraph/codegraph.db` directly.
3. Reuse existing modules and native platform features; keep changes minimal.
4. Preserve unrelated worktree changes. Do not delete legacy code.
5. Add focused checks for non-trivial branches and persistence behavior.
6. Regenerate OpenAPI/types whenever public schemas change.
7. Keep `README.md`, this file, the plan, runbook, and acceptance report aligned
   when architecture, commands, or rollout state changes.

## Required local checks

Run from the repository root:

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

Local checks need no Redis, running worker, Docker, GPU, or real provider. They
are contract evidence, not proof of OCR quality or production readiness.

## Milestone C rules

- Use three sanitized fixed PDFs outside Git and `OCR_DATA_DIR`; record SHA-256.
- Pause uploads, drain and stop legacy, then back up the real data directory
  with a checksum before the new worker touches it.
- Never run both worker versions against the same directory.
- Verify Nginx health, registered task, concurrency/prefetch, artifacts/report,
  manual fields, restart/interrupted behavior, cross-version round-trip, and
  rollback rehearsal.
- Record sanitized evidence in `docs/phase4_acceptance.md`. Do not replace live
  evidence with mock/unit-test claims.
- Delete `src/`, `web/`, legacy packaging, or tests only in a separate cleanup
  request after the rollback window.
