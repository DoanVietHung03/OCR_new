# Phase 4 cutover runbook

The migrated stack is ready for strong-server acceptance, but this workspace
does not have Docker, Redis, or the real provider available. Do not delete the
legacy runtime until these commands pass on the target server.

## Acceptance

1. Pause uploads, drain and stop the legacy worker, then back up the host
   `OCR_DATA_DIR`. Record the path, size, and checksum. Do not start the new
   worker while legacy is still running.
2. Start the isolated stack with a non-secret `.env`:

   ```bash
   docker compose config
   docker compose up -d --build redis backend worker frontend nginx
   ```

3. Check service health and worker registration:

   ```bash
   docker compose ps
   docker compose logs --tail=200 backend worker redis nginx
   docker compose exec worker celery -A app.workers.tasks:celery_app inspect registered
   curl -fsS http://127.0.0.1:52409/health
   ```

4. Run the local gates from the repository root:

   ```bash
   uv run --project backend pytest backend/tests -q
   pnpm --dir frontend typecheck
   pnpm --dir frontend build
   pnpm --dir frontend e2e:smoke
   pnpm api:check
   ```

5. From an offline directory outside Git and `OCR_DATA_DIR`, submit the three
   fixed sanitized PDFs: clear digital, multi-page scan, and difficult scan.
   At least one must exceed 1 MiB. Record each SHA-256, job ID, page/artifact
   counts, report result, and manual field review.
6. Restart backend, worker, and Redis. Confirm terminal data remains readable,
   an active job becomes `interrupted`, and a stale task does not run again.
7. Stop the new stack before starting legacy against the same data. Perform the
   two-way round-trip and rollback rehearsal, then complete
   `docs/phase4_acceptance.md`.

## Cutover and rollback

Pause incoming work, drain Celery, then route the production proxy to the
new Nginx/frontend/backend stack. Keep the legacy deployment stopped but
available for one day. If acceptance or monitoring fails, point the proxy back
to the legacy service and restore the recorded filesystem backup only if data
was corrupted. Never run old and new workers concurrently against the same
job directory.

Legacy cleanup (`src/`, `web/`, root legacy packaging, duplicate tests) is a
separate explicit change after the rollback window, not part of this local run.
