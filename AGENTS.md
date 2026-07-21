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

Legacy+ v2 was implemented and locally verified on 2026-07-21: visual/workflow
parity with `OCR_paper` except ZIP/image/folder upload, safe Provider Profiles,
durable Codes, rich typed evidence/reports/artifacts/events, and allowlisted
telemetry.

The 2026-07-21 closure audit passes 27 backend tests, 10 legacy compatibility
tests, and 11 default browser tests; capture mode passes 12/12. Baseline v1 is
14/14 and Legacy+ is 18/19: every local checkpoint is complete, while Milestone
C remains open. Do not call the stack production-ready before that acceptance.

## Repository map

- `frontend/`: Next.js App Router, native CSS/browser APIs, generated API types.
- `backend/app/api/`: `/api/*` transport and Pydantic response contracts.
- `backend/app/services/`: durable filesystem state and provider HTTP client.
- `backend/app/workers/`: Celery ownership of render/provider work.
- `backend/tests/`: local contract, lifecycle, persistence, and worker checks.
- `data/jobs/`: durable offline state; Redis is disposable.
- `src/ocr/`, `web/`, `tests/`: legacy rollback runtime.
- `implementation_plan.md`: locked decisions and the remaining rollout gate.
- `legacy_browser_recreated.md`: completed Legacy+ local spec/checkpoints and
  the pending Milestone C checkpoint.
- `CONTEXT.md`: canonical product vocabulary for Legacy+, Provider Profiles,
  Code Catalog, and Review Evidence.
- `docs/ui-parity/`: sanitized 1440/1366/mobile captures and local evidence notes.
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
- Legacy+ may expose server-defined Provider Profile IDs, labels, capabilities,
  and safe readiness. The browser must never receive or submit arbitrary provider
  URLs, keys, headers, or models.
- Persist corrections with original OCR value and immutable audit. Manual crop
  is evidence only. Approval persists even with no correction.
- Rerun copies only source PDFs into a clean job and leaves the old job intact.
- Delete only `uploading`, `ready`, or terminal jobs; never delete active jobs.
- Persist only stable safe errors. Never persist secrets, raw provider
  responses, or unredacted request/response payloads.
- Keep the frontend dependency-light: Next/React, CSS, and native browser APIs;
  no UI kit, state manager, BFF, database, or shared-types package.
- The primary UI persona is an operations reviewer completing upload → monitor
  → review/correct/approve. Legacy+ restores permanent Jobs, Upload, Manage,
  Logs, Report, and Codes navigation with real routes and data; System Monitor
  remains a global dialog/deep-linkable state.
- `/corrections` saves and approves in one call. UI with drafts must say “Save
  and approve”; do not invent an unapproved saved-correction state. Unknown or
  non-scalar legacy fields remain visible but read-only.
- OCR `bbox` has no stable pixel/normalized contract and is not a crop seed.
  Manual crop starts from a user-drawn natural-pixel rectangle and remains
  append-only evidence.
- Preserve valid VI/EN UTF-8, Vietnamese default, and
  `localStorage["intellidoc.language"]`. The approved follow-up is responsive
  desktop-first: visual/functional anchors at `1440×900` and `1366×768`; at
  `390×844` require only no horizontal overflow, no broken layout, and closable
  modals.
- System telemetry describes the environment visible to the backend. Legacy+
  may add sanitized CPU/runtime details, memory, the disk containing
  `OCR_DATA_DIR`, best-effort GPU details, and persisted OCR operation samples.
  It must not expose hostname, IP, usernames, paths, processes, environment
  dumps, raw command output, secrets, or provider configuration; do not require
  GPU access in the default Compose stack.
- Durable Code Catalog state belongs in atomic `OCR_DATA_DIR/_codes.json` with
  revision conflicts and restart/backup tests; do not add a database.

## Runtime contract

- Legacy: `62472`.
- Direct backend: `50177`.
- Direct frontend and Compose frontend: `54846`.
- Compose also publishes Nginx on `52409`; backend and Redis stay internal on
  `50177`/`6380`. The frontend image builds its `/api/*` rewrite to
  `http://backend:50177`, while Nginx routes `/api/*` directly to backend.
- Do not add `BACKEND_PORT`; it does not configure the listener.
- Browser API calls remain relative `/api/*`; TLS terminates outside Compose.

## Working procedure

1. Read `implementation_plan.md` before migration or cutover work. For changes
   to the recreated browser flow, also read `legacy_browser_recreated.md` and
   preserve its completed Legacy+ checkpoints and keep the Milestone C boundary.
2. Before editing code, use the CodeGraph MCP against `C:\HProjecT\OCR` to
   inspect the target symbols, callers, routes, and blast radius. Do not infer
   flow from filenames or query `.codegraph/codegraph.db` directly.
3. Reuse existing modules and native platform features; keep changes minimal.
4. Preserve unrelated worktree changes. Do not delete legacy code.
5. Add focused checks for non-trivial branches and persistence behavior.
6. Regenerate OpenAPI/types whenever public schemas change.
7. Keep `README.md`, this file, the plan, runbook, and acceptance report aligned
   when architecture, commands, or rollout state changes.
8. Do not create commits unless the user explicitly asks for them.

## Completed browser phases

1. Capture sanitized baseline and map every UI block to real schema/API data.
2. Implement minimal backend telemetry, focused tests, and generated API types.
3. Recreate the minimal shell, inline upload, dashboard, filters, and lifecycle
   actions without fake progress or placeholder screens.
4. Rebuild job detail, numeric page navigation, review, Save-and-Approve,
   conflict handling, and inline report.
5. Replace coordinate inputs with pointer/keyboard visual crop and verify
   natural-image coordinate conversion.
6. Add conditional legacy logs, the real System Monitor, desktop/accessibility
   parity, and aligned documentation.

Legacy+ then added full routes/sidebar, Provider Profile selection, Documents,
rich review evidence/suggestions, artifact manifest/Safe Events, typed reports,
durable Codes and expanded safe telemetry. Future changes must preserve all
18 local checkpoints. This plan does not authorize automatic commits or deleting
the legacy runtime.

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
