# OCR monorepo handoff

## Current state

Milestones A and B are implemented and locally verified. The Next.js/FastAPI
stack supports strict PDF upload, typed OpenAPI, one-shot Celery dispatch,
durable job persistence, correction/approval/crop evidence, rerun, and the
PDF-only VI/EN UI. Local coverage includes backend old-job compatibility,
mocked browser paths, and a real eager-task/fake-provider browser flow.

Milestone C is not complete. It is an internal production-like pilot gate, not
customer-production approval. Do not claim even that pilot until the overall P0
`X7`–`X11` and `X16` gates close and the `BE-C-EVIDENCE` ledger in
`implementation_plan.md` contains real Nginx/Redis/Celery/provider, four-fixture,
restart, persistence, and deployment rollback evidence.

The Next.js browser was locally verified on 2026-07-21 with safe Provider Profiles,
durable Codes, rich typed evidence/reports/artifacts/events, and allowlisted
telemetry.

The 2026-07-22 Repair Gate passed 28 backend tests, 10 legacy compatibility
tests, focused browser coverage for task/page retry and partial review, typecheck,
build, generated OpenAPI/types, and diff checks. These are the protected baseline.
The current suite has 49 backend tests and 19 passing browser checks. The local
contracts for `X7`–`X13`, `X16`, and the
locally actionable `X15` scope pass. `X7`/`X16` remain IN PROGRESS at the overall
gate only because fixture/live acceptance is missing; `X14` still needs real
benchmark fingerprints. `incomlpeted.md` lists every external condition still
required.

The X7/X16 local contract now also preserves typed suggestion confidence/reason
with provider-owned provenance, validates create/rerun against configured
Provider Profile capabilities, keeps both segmentation waiting states across
worker restart, and covers arbitrary native boundary edits, inline validation,
revision conflict, and Continue in the browser gate.

## Repository map

- `frontend/`: Next.js App Router, native CSS/browser APIs, generated API types.
- `backend/app/api/`: `/api/*` transport and Pydantic response contracts.
- `backend/app/services/`: durable filesystem state and provider HTTP client.
- `backend/app/workers/`: Celery ownership of render/provider work.
- `backend/tests/`: local contract, lifecycle, persistence, and worker checks.
- `data/jobs/`: durable offline state; Redis is disposable.
- `implementation_plan.md`: canonical backend contract, Repair Gate, cutover
  runbook, and sole Milestone C evidence ledger.
- `frontend_plan.md`: canonical frontend workflow, counterpart gates,
  regression checks, and UI evidence mapping.
- `incomlpeted.md`: external fixture/infrastructure/operator dependencies and
  their completion conditions.
- `docs/ui-parity/`: sanitized 1440/1366/mobile PNG captures.

## Architecture invariants

- Accept only PDFs: 15 files/job, 200 MiB/job, 100 pages/PDF, rendered at
  200 DPI. The browser may select those PDFs individually or through one native
  folder picker; this does not authorize ZIP, images, or directory management.
- FastAPI must not render PDFs or call the provider. Celery owns OCR; eager
  execution is test-only.
- `data/jobs/` JSON and artifacts are durable truth. Do not add a database,
  Redis AOF, or a Redis volume.
- Preserve `/api/*`, artifact URLs, filesystem layout, safe error codes, and
  compatibility with persisted old jobs. Unknown extras remain readable and
  reading an old job must not rewrite it.
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
- `combined_dossier` with multiple PDFs sorts sources by file name: the first
  PDF is one whole `dossier_cover`, and every later PDF is one whole
  `administrative_document`; this path must not call provider segmentation.
  A single combined PDF still segments every page with the existing page retry
  policy. Both paths require per-source revisioned confirmation before extraction.
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
- Provider HTTP uses the minimal OpenAI Chat Completions subset: `model`,
  `temperature`, and `messages` with `image_url`. Keep JSON enforcement in the
  prompt/parser; do not add provider-specific `thinking` fields or require
  optional `response_format` support.
- The frontend may expose server-defined Provider Profile IDs, labels, capabilities,
  and safe readiness. The browser must never receive or submit arbitrary provider
  URLs, keys, headers, or models.
- Readiness distinguishes configured/reachable/ready using a sanitized synthetic
  provider request. Create/upload may proceed when configured; readiness gates
  `/start` and `/continue` without losing uploaded or confirmed state.
- Backend owns ordered expected/required field policy, typed blockers/risks, and
  prompt/write allowlists. New administrative documents use 11 fields; Bìa uses
  the approved 13-field schema with `khoa` and without `hop_so`. Keep
  `co_quan_luu_tru` as all visible organization/archive-authority lines and keep
  `khoa`, `nhiem_ky`, `phong_so`, and `ho_so_dvbq` distinct. Legacy
  `fields.document_type` stays read-only; system metadata uses
  `logical_document_type`.
- `quyen_han_ky_thay` stores the complete visible signing-authority line, for
  example `KT. BỘ TRƯỞNG`; do not reduce it to the leading abbreviation or mix
  in the signer's own title from `chuc_vu_nguoi_ky`.
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
  → review/correct/approve. The frontend provides permanent Jobs, Upload, Manage,
  Logs, Report, and Codes navigation with real routes and data; System Monitor
  remains a global dialog/deep-linkable state.
- `/corrections` saves and approves in one call. UI with drafts must say “Save
  and approve”; do not invent an unapproved saved-correction state. Unknown or
  non-scalar legacy fields remain visible but read-only.
- Multi-PDF structure review may confirm every valid unconfirmed source
  sequentially through the existing per-source revision endpoint; do not add a
  bulk API or bypass revision validation. Its type selector exposes only Cover
  and Document. A single combined PDF may also expose Excluded; Unclassified is
  a provider-error state to resolve, not a user-selectable target.
- New provider `bbox` is normalized `[left, top, right, bottom]` in `0..1` and
  encloses the field label plus value. The worker creates an automatic evidence
  crop for every returned field with a valid bbox. When a labeled metadata value
  conflicts with an available independent full-OCR line, clear its bbox and
  confidence, mark it for review, and do not publish a misleading crop.
  Never inject the full-OCR transcription into the metadata provider prompt;
  use it only for this local post-response validation.
  Legacy/invalid bbox remains unavailable; it never seeds Manual crop, which still
  starts from a user-drawn natural-pixel rectangle.
- Preserve valid VI/EN UTF-8, Vietnamese default, and
  `localStorage["intellidoc.language"]`. The approved follow-up is responsive
  desktop-first: visual/functional anchors at `1440×900` and `1366×768`; at
  `390×844` require only no horizontal overflow, no broken layout, and closable
  modals.
- System telemetry describes the environment visible to the backend. The frontend
  may add sanitized CPU/runtime details, memory, the disk containing
  `OCR_DATA_DIR`, best-effort GPU details, and persisted OCR operation samples.
  It must not expose hostname, IP, usernames, paths, processes, environment
  dumps, raw command output, secrets, or provider configuration; do not require
  GPU access in the default Compose stack.
- Durable Code Catalog state belongs in atomic `OCR_DATA_DIR/_codes.json` with
  revision conflicts and restart/backup tests; do not add a database.

## Runtime contract

- Direct backend: `50177`.
- Direct frontend and Compose frontend: `54846`.
- Compose also publishes Nginx on `52409`; backend and Redis stay internal on
  `50177`/`6380`. The frontend image builds its `/api/*` rewrite to
  `http://backend:50177`, while Nginx routes `/api/*` directly to backend.
- Do not add `BACKEND_PORT`; it does not configure the listener.
- Browser API calls remain relative `/api/*`; TLS terminates outside Compose.

## Working procedure

1. Read `implementation_plan.md` before backend, migration, or cutover work. For
   frontend work, read `frontend_plan.md`. Follow the matching
   `BE-Xn`/`FE-Xn` backlink and do not close one side without its counterpart.
2. Before editing code, use the CodeGraph MCP against `C:\HProjecT\OCR` to
   inspect the target symbols, callers, routes, and blast radius. Do not infer
   flow from filenames or query `.codegraph/codegraph.db` directly.
3. Reuse existing modules and native platform features; keep changes minimal.
4. Preserve unrelated worktree changes.
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
6. Add typed logs, the real System Monitor, desktop/accessibility
   parity, and aligned documentation.

The frontend then added full routes/sidebar, Provider Profile selection, Documents,
rich review evidence/suggestions, artifact manifest/Safe Events, typed reports,
durable Codes and expanded safe telemetry. Preserve these regression contracts,
and keep task/page execution and partial-result rendering under the paired Repair
Gate regression checks. This plan does not authorize automatic commits.

## Required local checks

Run from the repository root:

```powershell
uv run --project backend pytest backend/tests -q
pnpm --dir frontend typecheck
pnpm --dir frontend build
pnpm --dir frontend e2e:smoke
pnpm api:check
python -m compileall -q backend/app
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
  drain the worker, then back it up with size/checksum before deployment changes.
- Verify Nginx health, registered task, concurrency/prefetch, artifacts/report,
  field evidence, segmentation/confirmation, manual boundaries, blockers,
  independent approval, restart/interrupted behavior, persisted-job compatibility,
  and deployment rollback rehearsal.
- Record sanitized evidence only in `implementation_plan.md#be-c-evidence`. Do
  not replace live evidence with mock/unit-test claims.
