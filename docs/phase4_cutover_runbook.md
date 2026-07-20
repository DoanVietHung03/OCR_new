# Phase 4 cutover runbook

The migrated stack is ready for strong-server acceptance, but this workspace
does not have Docker, Redis, or the real provider available. Do not delete the
legacy runtime until these commands pass on the target server.

## Acceptance

1. Back up the host `OCR_DATA_DIR` and record the backup path.
2. Start the isolated stack with a non-secret `.env`:

   ```bash
   docker compose config
   docker compose up -d --build redis backend worker frontend nginx
   ```

3. Check service health and worker registration:

   ```bash
   docker compose ps
   docker compose logs --tail=200 backend worker redis nginx
   curl -fsS http://127.0.0.1:8080/health
   ```

4. Run the local gates from the repository root:

   ```bash
   uv run --project backend pytest backend/tests -q
   pnpm --dir frontend typecheck
   pnpm --dir frontend build
   pnpm --dir frontend e2e:smoke
   pnpm api:check
   ```

5. Submit one real-provider job, verify its `data/jobs/<id>/` artifacts, then
   restart backend and worker. Poll the same job and confirm the job JSON,
   uploaded PDF, page images, corrections, and crop remain readable.

## Cutover and rollback

Pause incoming work, drain Celery, then route the production proxy to the
new Nginx/frontend/backend stack. Keep the legacy deployment stopped but
available for one day. If acceptance or monitoring fails, point the proxy back
to the legacy service and restore the recorded filesystem backup only if data
was corrupted. Never run old and new workers concurrently against the same
job directory.

Legacy cleanup (`src/`, `web/`, root legacy packaging, duplicate tests) is a
separate explicit change after the rollback window, not part of this local run.
