# OCR monorepo handoff

## Current state

Milestones A and B are implemented and locally verified. The Next.js/FastAPI
stack supports strict PDF upload, typed OpenAPI, one-shot Celery dispatch,
durable job persistence, correction/approval/crop evidence, rerun, and the
PDF-only VI/EN UI. Local coverage includes backend tests, legacy compatibility
tests, mocked browser paths, and a real eager-task/fake-provider browser flow.

Milestone C is not complete. It is an internal production-like pilot gate, not
customer-production approval. Do not claim even that pilot until P0 `X7`–`X11`
and `X16` pass locally and the `BE-C-EVIDENCE` ledger in
`implementation_plan.md` contains real Nginx/Redis/Celery/provider, four-fixture,
restart, cross-version, and rollback evidence. Keep `src/ocr/` and `web/` as the
rollback runtime until the one-day rollback window closes.

Legacy+ v2 was implemented and locally verified on 2026-07-21: visual/workflow
parity with `OCR_paper` except ZIP/image/folder upload, safe Provider Profiles,
durable Codes, rich typed evidence/reports/artifacts/events, and allowlisted
telemetry.

The 2026-07-22 Repair Gate passed 28 backend tests, 10 legacy compatibility
tests, focused browser coverage for task/page retry and partial review, typecheck,
build, generated OpenAPI/types, and diff checks. These are the protected baseline;
the new P0 field/review/segmentation contracts remain OPEN.

## Repository map

- `frontend/`: Next.js App Router, native CSS/browser APIs, generated API types.
- `backend/app/api/`: `/api/*` transport and Pydantic response contracts.
- `backend/app/services/`: durable filesystem state and provider HTTP client.
- `backend/app/workers/`: Celery ownership of render/provider work.
- `backend/tests/`: local contract, lifecycle, persistence, and worker checks.
- `data/jobs/`: durable offline state; Redis is disposable.
- `src/ocr/`, `web/`, `tests/`: legacy rollback runtime.
- `implementation_plan.md`: canonical backend contract, Repair Gate, cutover
  runbook, and sole Milestone C evidence ledger.
- `legacy_browser_recreated.md`: canonical frontend workflow, counterpart gates,
  regression checks, and UI evidence mapping.
- `docs/ui-parity/`: sanitized 1440/1366/mobile PNG captures.

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
- New jobs expose job-level `processing_mode`: `administrative_document`,
  `dossier_cover`, or `combined_dossier`. It is independent from server-defined
  Provider Profile capability; legacy jobs missing it stay legacy/null.
- `source_pdfs[]` is the additive source/page layer. Confirmed Bìa and văn bản
  remain the only entries in existing `documents[]`; do not add a second logical
  document store. A logical document never spans source PDFs.
- Pydantic v2/OpenAPI is canonical for public fields. `frontend/lib/api.ts`
  must consume generated types; do not add handwritten API DTOs.
- `/start` atomically transitions `ready → starting` once. Publish uncertainty
  becomes `interrupted`; never auto-retry or resume a whole job.
- `combined_dossier` segments every source page with the existing page retry
  policy, then requires per-source revisioned confirmation before extraction.
  Reuse the single `ocr.process_job` task with expected phase/revision; stale
  dispatches no-op. `unclassified` requires manual assignment; every page must
  belong to one contiguous document or be explicitly `excluded`.
- Preserve states `segmenting`, `awaiting_segmentation_review`,
  `segmentation_confirmed`, `extraction_starting`, and `running`. The two waiting
  states survive restart; active states become `interrupted` and never auto-resume.
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
- Readiness distinguishes configured/reachable/ready using a sanitized synthetic
  provider request. Create/upload may proceed when configured; readiness gates
  `/start` and `/continue` without losing uploaded or confirmed state.
- Backend owns ordered expected/required field policy, typed blockers/risks, and
  prompt/write allowlists. New administrative documents use 11 fields; Bìa uses
  the approved 13-field schema. Legacy `fields.document_type` stays read-only;
  system metadata uses `logical_document_type`.
- Persist corrections with original OCR value and immutable audit. Manual crop
  is evidence only. `/corrections` saves and approves atomically only when typed
  blockers are empty; dossier approval may be `partially_approved`.
- Rerun copies source PDFs and the processing snapshot into a clean job. Default
  `reuse_segmentation` requires confirmation again; explicit `resegment` discards
  old boundaries. Neither mode changes Processing Mode or mutates the source job.
- Delete only `uploading`, `ready`, or terminal jobs; never delete active jobs.
- Persist only stable safe errors. Never persist secrets, raw provider
  responses, or unredacted request/response payloads.
- Keep the frontend dependency-light: Next/React, CSS, and native browser APIs;
  no UI kit, state manager, BFF, database, or shared-types package.
- Milestone C uses `actor="anonymous"` because this is an internal test product.
  Do not add free-form spoofable identity or auth; verified approver/customer
  production is a separate architecture request.
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

1. Read `implementation_plan.md` before backend, migration, or cutover work. For
   frontend work, read `legacy_browser_recreated.md`. Follow the matching
   `BE-Xn`/`FE-Xn` backlink and do not close one side without its counterpart.
2. Before editing code, use the CodeGraph MCP against `C:\HProjecT\OCR` to
   inspect the target symbols, callers, routes, and blast radius. Do not infer
   flow from filenames or query `.codegraph/codegraph.db` directly.
3. Reuse existing modules and native platform features; keep changes minimal.
4. Preserve unrelated worktree changes. Do not delete legacy code.
5. Add focused checks for non-trivial branches and persistence behavior.
6. Regenerate OpenAPI/types whenever public schemas change.
7. Keep `README.md`, this file, and both canonical plans aligned when
   architecture, commands, or rollout state changes.
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
durable Codes and expanded safe telemetry. Preserve these regression contracts,
and keep task/page execution and partial-result rendering under the paired Repair
Gate regression checks. This plan does not authorize automatic commits or
deleting the legacy runtime.

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
are mandatory contract evidence, not proof of OCR quality or live runtime.

## Milestone C rules

- Use the four approved fixtures and ground truth outside Git and `OCR_DATA_DIR`:
  `63-btc.pdf`, one Bìa, one clear combined dossier with an explicit blank
  separator, and one difficult combined dossier. Record PDF/manifest/ground-truth
  SHA-256 without document text in the ledger.
- The current `OCR_DATA_DIR` is non-production test data, but still pause uploads,
  drain and stop legacy, then back it up with size/checksum before the new worker
  touches it.
- Never run both worker versions against the same directory.
- Verify Nginx health, registered task, concurrency/prefetch, artifacts/report,
  field evidence, segmentation/confirmation, manual boundaries, blockers,
  independent approval, restart/interrupted behavior, cross-version round-trip,
  and rollback rehearsal.
- Record sanitized evidence only in `implementation_plan.md#be-c-evidence`. Do
  not replace live evidence with mock/unit-test claims.
- Delete `src/`, `web/`, legacy packaging, or tests only in a separate cleanup
  request after the rollback window.
