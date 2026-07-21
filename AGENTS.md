# OCR monorepo handoff

## Current state

Milestones A and B are implemented and locally verified: strict PDF upload,
typed API, one-shot dispatch, worker lifecycle, safe persistence, the PDF-only
VI/EN UI, and mocked plus real eager-task browser paths pass without Redis or
a real provider. The strong-server gate remains open. Legacy `src/ocr/` plus
`web/` remains the rollback runtime until Milestone C in
`implementation_plan.md` passes.

## Target stack and scope

- `frontend/`: Next.js App Router + TypeScript, Node 22/pnpm.
- `backend/`: Python 3.12, async FastAPI, Pydantic v2, Celery + Redis.
- PDF-only: 15 files/job, 200 MiB/job, 100 pages/PDF, rendered at 200 DPI.
- `data/jobs/` is durable offline state. Redis is disposable broker/result
  infrastructure only; do not add AOF, a Redis volume, or a database.
- OCR uses one server-configured OpenAI-compatible HTTP endpoint. The browser
  never selects provider/model or receives secrets.

## Architecture rules

- FastAPI must not render PDFs or call the provider in an HTTP request. Celery
  owns OCR; test-only eager execution is allowed for the integration smoke.
- Preserve `/api/*`, artifact URLs, filesystem layout, safe errors, and
  two-way legacy/new job compatibility through the one-day rollback window.
- Pydantic v2/OpenAPI fully describes known public response fields and is the
  source for committed frontend API types. Persistence remains tolerant of
  legacy extras and must not rewrite old jobs merely by reading them.
- `/start` is one-shot and idempotent. Production Celery uses
  `--concurrency=1 --prefetch-multiplier=1`; no automatic job retry/resume.
- Use single-writer ownership: backend before dispatch, worker while active,
  backend again after terminal. Cancel writes a marker; do not add Redis/file
  distributed locks.
- Provider/model/prompt/external status are snapshotted per job without URL,
  key, or headers. `OCR_ENDPOINT_EXTERNAL` defaults true and controls consent.
- Persist correction values plus immutable audit, manual-crop evidence, and
  approval. Rerun copies only PDFs into a clean job; the old job remains.
- Store only stable safe error codes in job/API data. Redact logs; never store
  API keys, raw provider responses, or unredacted payloads.
- Keep frontend dependency-light: Next/React, CSS, and native browser APIs.
  Do not add a UI kit, state manager, BFF, database, or shared-types package.

## Ports and runtime

- Direct backend: `50177` (`uv run --project backend uvicorn app.main:app --host 0.0.0.0 --port 50177 --reload`).
- Direct frontend: `54846` (`pnpm --dir frontend dev -- --hostname 0.0.0.0 --port 54846`).
- Compose entry point: Nginx host port `52409`; backend/frontend/Redis remain
  internal on `50177`/`54846`/`6379`.
- Do not add `BACKEND_PORT`; it does not control the internal listener.

## Locked rollout decisions

- Production Compose is Nginx, frontend, backend, worker, and Redis under one
  domain. TLS stays outside Compose; browser API calls are relative `/api/*`.
- Back up the real `OCR_DATA_DIR`, pause uploads, and drain/stop legacy before
  the new worker uses it. Never run two worker versions on the same directory.
- Storage is offline only; the configured OCR endpoint may be external and
  then requires per-job consent.
- Visual/behavior parity is checklist-based at `1440×900` and `390×844`, not
  pixel-perfect. Preserve valid VI/EN UTF-8, Vietnamese default, and
  `localStorage["intellidoc.language"]`.
- Keep mocked Playwright cases plus one real Next/FastAPI/eager-task/fake-HTTP
  happy path. Real Redis/Celery/Nginx/provider evidence is strong-server only.
- Strong-server uses three sanitized fixed PDFs stored outside Git and
  `OCR_DATA_DIR`; record their SHA-256 in `docs/phase4_acceptance.md`.
- Legacy receives only PDF-only synchronization, two-way data compatibility,
  and fixes required to prevent data loss/corruption.

## Working rules

1. Read `implementation_plan.md` and crawl `.codegraph/codegraph.db` before a
   structural migration change; confirm caller/route flow, not filenames only.
2. Keep each milestone independently runnable and finish A before B, then C.
3. Add focused checks for non-trivial behavior. Local tests need no Redis,
   running Celery worker, GPU, Docker, or real provider.
4. Do not delete legacy `src/`/`web/` until the explicit post-rollback cleanup.
5. Update this file, `README.md`, and the plan when architecture or commands
   materially change.
6. Phase B needs all UI actions plus integration smoke. Phase C additionally
   needs three real-provider fixtures, restart/interrupted behavior,
   cross-version round-trip, rollback rehearsal, and a completed acceptance
   report.
