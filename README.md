# OCR service

PDF-only Vietnamese administrative-document OCR. The migration stack uses
Next.js, FastAPI, Celery, Redis, and one server-configured OpenAI-compatible
OCR endpoint.

Milestones A and B are locally verified. Milestone C still requires the strong
server: real Nginx/Redis/Celery/provider execution, three fixed PDF fixtures,
restart checks, cross-version compatibility, and rollback rehearsal. Until
that gate passes, `src/ocr/` and `web/` remain the rollback runtime.

## Repository layout

- `frontend/`: Next.js App Router UI and generated API types.
- `backend/`: FastAPI API, durable job store, Celery task, and tests.
- `nginx/`: single-domain production routing.
- `data/jobs/`: durable offline job JSON, PDFs, and artifacts; never Redis.
- `src/ocr/`, `web/`, `tests/`: legacy rollback runtime and checks.
- `docs/phase4_cutover_runbook.md`: strong-server procedure.
- `docs/phase4_acceptance.md`: required Milestone C evidence.

## Locked contract

- PDF-only: at most 15 PDFs and 200 MiB per job; at most 100 pages per PDF.
- PDFs are validated before dispatch. Invalid, encrypted, or oversized PDFs
  fail the whole job without calling the provider.
- FastAPI handles short requests only. Celery renders pages at 200 DPI and
  calls the provider.
- `/start` is one-shot. Production workers use concurrency `1` and prefetch
  `1`; jobs are not automatically retried or resumed.
- Provider, model, prompt version, and external-endpoint status are snapshotted
  per job. URLs, keys, headers, raw provider responses, and unsafe errors are
  never persisted.
- Corrections, approval, immutable audit, and manual-crop evidence persist.
  Rerun creates a clean job from the original PDFs.
- `data/jobs/` is the durable source of truth. Redis has no persistent volume.
- Browser requests stay relative to `/api/*`; provider settings and secrets
  never reach the frontend.

## Requirements

- Python 3.12 and `uv`.
- Node.js 22 and pnpm 10.
- Docker Compose only for production-like and Milestone C runs.

## Local setup

Run from the repository root:

```powershell
Copy-Item .env.example .env
uv sync --project backend
pnpm install
```

Edit `.env` with the real server-only provider values. The example Redis host
`redis` is for Compose; direct Celery runs must use a reachable Redis host.

Start the API and frontend in separate terminals:

```powershell
uv run --env-file .env --project backend uvicorn app.main:app --host 0.0.0.0 --port 50177 --reload
pnpm --dir frontend dev -- --hostname 0.0.0.0 --port 54846
```

The frontend proxies relative `/api/*` calls to `http://127.0.0.1:50177` by
default. Set `OCR_BACKEND_URL` only when the direct backend uses another URL.
Next development currently allows `127.0.0.1` and `10.6.18.76`; update
`allowedDevOrigins` in `frontend/next.config.ts` for another LAN host.

For a direct worker, point both Celery URLs at the same reachable Redis, then
run:

```powershell
uv run --env-file .env --project backend celery -A app.workers.tasks:celery_app worker --loglevel=INFO --concurrency=1 --prefetch-multiplier=1
```

## Verification

Local checks do not require Redis, a running worker, Docker, GPU, or a real
provider:

```powershell
uv run --project backend pytest backend/tests -q
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
git diff --check
```

Playwright covers a mocked workflow, a real Next/FastAPI/eager-task flow with a
local fake provider, and the locked `1440×900` desktop plus `390×844` mobile
viewports. These checks do not prove production Redis/Celery/provider behavior.

When FastAPI schemas change, run `pnpm api:generate` and commit both
`frontend/openapi.json` and `frontend/lib/api-schema.ts`.

## Compose

Only Nginx publishes a host port (`52409`). Backend, frontend, Redis, and the
worker remain internal.

```bash
cp .env.example .env
# edit server-only values first
docker compose config
docker compose up -d --build redis backend worker frontend nginx
docker compose ps
curl -fsS http://127.0.0.1:52409/health
```

Do not use Compose against the real `OCR_DATA_DIR` until uploads are paused,
the legacy worker is drained and stopped, and a checksum-backed backup exists.
Never run legacy and new workers on the same job directory.

## Legacy rollback runtime

```powershell
python -m pip install -e .
$env:PYTHONPATH = "src"
python -m ocr
```

Keep this runtime available until Milestone C passes and the one-day rollback
window closes.

## Ports and data

- Legacy runtime: `62472`.
- Direct FastAPI: `50177`.
- Direct Next.js: `54846`.
- Compose entry point: `52409`.
- Compose-internal Redis: `6379`.

`OCR_ENDPOINT_EXTERNAL` defaults to `true`; each job must record consent before
page images are sent to an external endpoint. `BACKEND_PORT` is intentionally
unsupported—the backend listener is fixed at `50177`.

See [implementation_plan.md](implementation_plan.md) for the remaining gate and
[docs/phase4_cutover_runbook.md](docs/phase4_cutover_runbook.md) for cutover and
rollback.
