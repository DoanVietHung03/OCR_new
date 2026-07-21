# OCR service

The Next.js/FastAPI migration stack has locally verified Milestones A and B:
strict PDF upload, typed OpenAPI, one-shot Celery dispatch, safe persistence,
the PDF-only VI/EN UI, and a real Next/FastAPI/eager-task integration smoke.
Strong-server acceptance remains before cutover. Legacy `src/ocr/` + `web/`
stays as the rollback runtime until Milestone C in `implementation_plan.md`
passes.

## Scope and architecture

- PDF-only: at most 15 PDFs and 200 MiB per job, 100 pages per PDF.
- `frontend/`: Next.js App Router + TypeScript, Node 22/pnpm.
- `backend/`: Python 3.12, async FastAPI + Pydantic v2.
- Long OCR work: Celery; Redis is disposable broker/result infrastructure.
- Durable offline state: host-mounted `OCR_DATA_DIR` (`data/jobs/` by default).
- OCR inference: one server-configured OpenAI-compatible HTTP endpoint.

Production uses one domain. Nginx exposes host port `52409`, routes `/api/*`
to FastAPI, and routes everything else to standalone Next. Backend, frontend,
worker, and Redis stay internal; TLS is outside Compose.

## Development

```bash
# frontend
pnpm install
pnpm --dir frontend dev -- --hostname 0.0.0.0 --port 54846
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke

# backend
uv sync --project backend
uv run --project backend pytest backend/tests -q
uv run --project backend uvicorn app.main:app --host 0.0.0.0 --port 50177 --reload
uv run --project backend celery -A app.workers.tasks:celery_app worker --loglevel=INFO --concurrency=1 --prefetch-multiplier=1

# generated API types
pnpm api:generate
pnpm api:check

# strong server entry point
docker compose up -d --build redis backend worker frontend nginx
# browse http://<server>:52409
```

Local tests must not require Redis, a running Celery worker, GPU, Docker, or a
real provider. Playwright covers the locked `1440×900` desktop and `390×844`
mobile viewports, mocked error states, and one real Next/FastAPI/eager-task
flow against a local fake HTTP provider.

The development server currently permits `10.6.18.76` for Next HMR. Add the
actual LAN host to `frontend/next.config.ts` before using a different address.

## Configuration and data

Use one root server `.env` for backend/worker secrets; frontend receives none
and calls relative `/api/*`. Provider/model are server-owned.
`OCR_ENDPOINT_EXTERNAL` defaults to `true`, so external endpoints require
per-job consent.

`OCR_DATA_DIR` is shared by backend and worker. Redis has no durable volume;
restart makes active jobs `interrupted` and users rerun them manually. Do not
run legacy and new workers against the same directory.

`BACKEND_PORT` is intentionally absent: the container listens on `50177`.
Direct frontend development uses `54846`; normal Compose access uses only
Nginx on `52409`.

## Locked behavior

- Upload accepts only valid, unencrypted PDFs. Any PDF over 100 pages or any
  invalid/encrypted PDF fails the whole job before Celery/provider execution.
- `/start` enqueues once; worker concurrency and prefetch are both one.
- Job/API data contains safe error codes, never secrets or raw provider output.
- Corrections, manual-crop evidence, and approval persist across reload. Rerun
  creates a clean job from the same PDFs and leaves the old job unchanged.
- Pydantic/OpenAPI is canonical for frontend API types; legacy job extras stay
  readable through the one-day rollback window.
- UI parity is checked at `1440×900` and `390×844`; Vietnamese remains default
  and `intellidoc.language` remains in localStorage.

## Acceptance and rollback

Before the new worker uses the real offline `OCR_DATA_DIR`, stop uploads,
drain/stop legacy, and create a backup with a recorded checksum. Never run the
two workers together.

Strong-server acceptance uses three sanitized fixed PDFs stored outside Git
and `OCR_DATA_DIR`: a clear digital PDF, a multi-page scan, and a difficult
scan. Record commit/image, commands, backup checksum, fixture SHA-256, job and
artifact results, restart behavior, field review, and rollback rehearsal in
`docs/phase4_acceptance.md`. Legacy remains rollback-ready for one day.

## Legacy runtime

```powershell
python -m pip install -e .
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
python -m ocr
```

See `implementation_plan.md` for the remaining milestones and gates.
