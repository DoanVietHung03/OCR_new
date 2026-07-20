# OCR service

> Migration status: planning only. The legacy FastAPI/static-web application
> remains the production source until Phase 3 in `implementation_plan.md`.

## Target monorepo

- `frontend/` — Next.js App Router + TypeScript, Node 22 and pnpm.
- `backend/` — Python 3.12, async FastAPI + Pydantic v2.
- `worker` — Celery + Redis for long OCR work.

Production uses one domain. Nginx routes `/api/*` to FastAPI and all other
paths to the standalone Next frontend. TLS stays outside the Compose stack.

These commands are available for the Phase 2/3 isolated migration stack:

```bash
# frontend
pnpm install
pnpm --dir frontend dev
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke

# backend
uv sync --project backend
uv run --project backend pytest backend/tests -q
uv run --project backend uvicorn app.main:app --reload
uv run --project backend celery -A app.workers.tasks:celery_app worker --loglevel=INFO

# generated API types
pnpm api:generate
pnpm api:check

# strong server
docker compose up --build
```

Use one root server `.env` for backend/worker secrets only; browser code calls
relative `/api/*` and receives no API key. `OCR_DATA_DIR` is a host bind mount
shared by backend and worker, and must be backed up before cutover.

## Migration guarantees

- Existing `/api/*` contracts, `data/jobs/` layout, jobs, and artifacts remain
  compatible. No data migration is required.
- Cutover pauses new jobs and drains Celery. Never run legacy and new workers
  against the same job directory.
- The legacy deployment remains rollback-ready for one day.
- The frontend keeps visual parity, adds valid VI/EN UTF-8 text, and preserves
  `intellidoc.language` in localStorage.

## Current legacy application

Until the monorepo packages exist, run the checked-in application as follows:

```powershell
python -m pip install -e .
$env:PYTHONPATH = "src"
python -m unittest discover -s tests
python -m ocr
```

Local checks must not require Redis, Celery, GPU, Docker, or a real OCR
provider. See `implementation_plan.md` for the complete mapping, milestones,
and validation gates.
