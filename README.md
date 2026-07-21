# OCR service

> Migration status: planning only. The legacy FastAPI/static-web application
> remains the production source until Phase 3 in `implementation_plan.md`.

## Target monorepo

- `frontend/` — Next.js App Router + TypeScript, Node 22 and pnpm.
- `backend/` — Python 3.12, async FastAPI + Pydantic v2.
- `worker` — Celery + Redis for long OCR work.

Production uses one domain. Nginx routes `/api/*` to FastAPI and all other
paths to the standalone Next frontend. TLS stays outside the Compose stack.

These commands are available for the isolated migration stack. Direct development uses ports chosen to avoid the host's existing services: backend `50177`, frontend `54846`.

```bash
# frontend
pnpm install
pnpm --dir frontend dev -- --hostname 0.0.0.0 --port 54846
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke

# backend
uv sync --project backend
uv run --project backend pytest backend/tests -q
uv run --project backend uvicorn app.main:app --host 0.0.0.0 --port 50177 --reload
uv run --project backend celery -A app.workers.tasks:celery_app worker --loglevel=INFO

# generated API types
pnpm api:generate
pnpm api:check

# strong server
docker compose up --build
# browse through Nginx at http://<server>:52409
```

The development server permits the current internal host `10.6.18.76` for Next HMR. Add a replacement LAN host to `frontend/next.config.ts` before using another server address.

If `uv` is not installed outside an old virtualenv, install it once for the user with `curl -LsSf https://astral.sh/uv/install.sh | sh`, then open a new shell. Use one root server `.env` for backend/worker secrets only; browser code calls
relative `/api/*` and receives no API key. `OCR_DATA_DIR` is a host bind mount
shared by backend and worker, and must be backed up before cutover.

`BACKEND_PORT` is intentionally not an environment setting: the backend is internal to Compose and always listens on `50177`. `FRONTEND_PORT` only controls the optional direct container mapping; normal production access is through Nginx on `52409`.

## Migration guarantees

- Existing `/api/*` contracts, `data/jobs/` layout, jobs, and artifacts remain
  compatible. No data migration is required.
- Cutover pauses new jobs and drains Celery. Never run legacy and new workers
  against the same job directory.
- The legacy deployment remains rollback-ready for one day.
- The frontend keeps visual parity, adds valid VI/EN UTF-8 text, and preserves
  `intellidoc.language` in localStorage.

## Current legacy application

The legacy application remains the rollback runtime until the Phase 4 strong-server acceptance gate passes. Run it as follows:

```powershell
python -m pip install -e .
$env:PYTHONPATH = "src"
python -m unittest discover -s tests
python -m ocr
```

Local checks must not require Redis, Celery, GPU, Docker, or a real OCR
provider. See `implementation_plan.md` for the complete mapping, milestones,
and validation gates.
