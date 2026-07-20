# Tech-stack research notes

Research date: 2026-07-20. Sources are official documentation; versions below
are compatibility floors/major lines for the Phase 1 scaffold, not a promise to
upgrade an already locked dependency later.

## Python 3.12

- Use timezone-aware UTC values: `datetime.now(datetime.UTC)` and
  `datetime.fromtimestamp(value, tz=datetime.UTC)`. Python 3.12 documents
  `utcnow()` and `utcfromtimestamp()` as deprecated.
- Do not introduce deprecated asyncio child-watcher APIs. Keep worker work out
  of the FastAPI request path; Phase 2 will move long work behind Celery.
- The existing legacy package already declares `requires-python >=3.12`; the
  new backend repeats that constraint.

Source: https://docs.python.org/3.12/whatsnew/3.12.html

## FastAPI and Pydantic v2

- FastAPI route handlers that await I/O should be `async def`; synchronous
  blocking libraries can remain regular `def` handlers until ported.
- Use `pydantic.BaseModel` for API DTOs and `pydantic-settings.BaseSettings`
  for environment-only configuration. Settings are not API models and secrets
  must never be serialized into job state or browser bundles.
- FastAPI's generated `/openapi.json` is the source for frontend types. Async
  tests can use HTTPX `ASGITransport`; no Redis/provider is needed locally.
- Compatibility lines selected for the scaffold: FastAPI `>=0.115,<1`,
  Pydantic `>=2.10,<3`, and pydantic-settings `>=2.7,<3`.

Sources:

- https://fastapi.tiangolo.com/async/
- https://fastapi.tiangolo.com/advanced/settings/
- https://fastapi.tiangolo.com/advanced/async-tests/
- https://pydantic.dev/docs/validation/latest/concepts/pydantic_settings/

## Celery and Redis

- Celery 5.6 is the current stable documentation line on the research date;
  use `celery[redis]>=5.6,<6`.
- Redis may be both broker and result backend. It is not durable job state for
  this project: `OCR_DATA_DIR` remains the filesystem source of truth.
- Celery tasks must own PDF rendering and OCR. FastAPI only validates,
  persists, dispatches, and polls.

Sources:

- https://docs.celeryq.dev/en/stable/
- https://docs.celeryq.dev/en/latest/getting-started/backends-and-brokers/

## uv and packaging

- `backend/` is an independent uv project, not a Python workspace: one backend
  package does not need workspace machinery.
- `uv sync --project backend` creates/updates `backend/uv.lock` and the project
  environment. Commit the lockfile once generated; do not hand-edit it.
- The backend uses a normal `pyproject.toml` with `requires-python >=3.12` and
  a Hatch build backend.

Sources:

- https://docs.astral.sh/uv/concepts/projects/sync/
- https://docs.astral.sh/uv/concepts/projects/layout/

## Next.js App Router and pnpm

- Use Next App Router with TypeScript and Next `output: "standalone"` for the
  production image. Node 22 is pinned by `.nvmrc` and the Docker base image.
- Browser calls remain relative `/api/*`. Development uses a Next rewrite to
  FastAPI; production Nginx owns the same path split.
- `pnpm-workspace.yaml` contains only `frontend`; there is no shared-types
  package. `openapi-typescript` generates `frontend/lib/api-schema.ts` from
  backend OpenAPI.
- Scaffold dependency lines: Next `^16.0.1`, React `^19.2.0`, TypeScript
  `^5.9.0`, and pnpm `10.12.1` via root `packageManager`.

Sources:

- https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
- https://pnpm.io/workspaces
