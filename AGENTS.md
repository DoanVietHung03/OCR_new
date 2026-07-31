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
The protected baseline has 54 backend tests and 20 passing browser checks. The local
contracts for `X7`–`X13`, `X16`, and the
locally actionable `X15` scope pass. `X7`/`X16` remain IN PROGRESS at the overall
gate only because fixture/live acceptance is missing; `X14` still needs real
benchmark fingerprints. The locally actionable `X17A`–`X17E` scope is
implemented; `X17F` still needs real provider/fixture/server evidence.
The Scenario Price Profile form can preview exact-model pricing and exchange
rates from a fixed official-source allowlist; provenance and explicit user
confirmation are required before save, and unsupported models stay unavailable.
New MiniMax-M3 jobs use Provider Profile ID `minimax`; runtime reads legacy
`qwen` jobs without rewriting them. An explicitly approved offline migration may
relabel confirmed MiniMax-M3 history only after dry-run, worker stop, and backup.
The frontend-only `X18` guide/reference scope is implemented with two static
VI/EN routes, one permanent sidebar entry, and five sanitized captures. Its
production build and non-browser checks pass; Playwright reached all 25 tests
without a reported test failure but Windows teardown still needs a clean
non-timeout confirmation before `X18` is called `LOCAL COMPLETE`.
The paired `X19` shared demo login is locally implemented. It uses one shared
credential, keeps OCR actor data anonymous, and is specified in
`Simple_Auth.md`. Backend, build and browser gates pass; do not claim the live
deployment until Nginx/direct-port/rate-limit/full OCR smoke is recorded.
`incomlpeted.md` lists every external condition still required.

The 2026-07-27 OpenAI-compatible reliability update preserves the minimal
Chat Completions payload, raises the default provider timeout to 180 seconds,
and gives each eligible page operation at most two total attempts. Its local
gate passed 61 backend tests, 21 browser checks, frontend typecheck/build,
OpenAPI generation/check, Python compileall, and diff checks; real
provider/fixture/server evidence remains open.

The same-day semantic hardening selects the last complete JSON object in model
content, treats an administrative page-zero response with no header metadata as
invalid model JSON within the same two-attempt budget, and reports required-field
blockers as `completed_with_warnings` instead of a clean completion.

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
- `frontend/public/guide/`: five sanitized task-focused user-guide captures.
- `User_guide.md`: canonical `FE-X18` content and acceptance contract.
- `Simple_Auth.md`: implemented `BE-X19`/`FE-X19` shared demo login contract;
  live deployment evidence pending.

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
- A provider page operation has at most two attempts total. Retry once after the
  first pre-response connection failure, read timeout, invalid model JSON, or HTTP
  `429/502/503/504`; mixed failure types do not reset this budget and
  `Retry-After` is capped at 10 seconds. Do not retry other HTTP failures, local
  field warnings, or a whole job. The default provider read timeout is 180 seconds
  and remains configurable with `OCR_TIMEOUT_SECONDS`.
- JSON enforcement remains provider-neutral: parse the last complete JSON object
  from model content. For administrative `metadata + auto`, page zero must return
  at least one non-signature metadata field; an empty semantic result is invalid
  model JSON and uses the same retry budget. Required-field blockers make the
  document/job `completed_with_warnings`, never a clean `completed`.
- Production Celery always uses `--concurrency=1 --prefetch-multiplier=1`.
- Backend writes before dispatch, worker writes while active, backend writes
  again after terminal. Cancel creates a marker; do not add distributed locks.
- Snapshot provider/model/prompt/external status without URL, key, or headers.
  `OCR_ENDPOINT_EXTERNAL` defaults to `true` and requires per-job consent.
- Provider HTTP uses the minimal OpenAI Chat Completions subset: `model`,
  `temperature`, and `messages` with `image_url`. Keep JSON enforcement in the
  prompt/parser; do not add provider-specific `thinking` fields or require
  optional `response_format` support.
- The frontend may expose server-defined Provider Profile IDs, labels, exact safe
  configured model, capabilities, and safe readiness. The browser must never
  receive or submit arbitrary provider URLs, keys, headers, or models.
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
- For an administrative document, `metadata + auto` extracts header metadata
  from page zero, then searches backward for the signature group and stops at
  the first page with both signer title and signer name. Keep all selected
  signature fields from one page; `vlm_max_pages` caps distinct candidate pages.
  `all` and `first,last` retain their literal meanings.
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
- Milestone C and planned `X19` both keep `actor="anonymous"`. `X19` may add only
  the one shared HTTP demo credential/session gate specified in `Simple_Auth.md`;
  do not turn its username into durable identity or add OIDC, roles, user DB,
  API tokens, TLS claims or customer-production semantics.
- The primary UI persona is an operations reviewer completing upload → monitor
  → review/correct/approve. The frontend provides permanent Jobs, Upload, Manage,
  Logs, Report, Codes, Sizing, and User guide navigation with real routes and data; System Monitor
  remains a global dialog/deep-linkable state.
- `/guide` and `/guide/reference` are static VI/EN help routes. They do not fetch
  API data or persist state beyond the existing language setting. Keep guidance
  in the permanent sidebar entry instead of repeating contextual links on
  workflow screens.
- `/corrections` saves and approves in one call. UI with drafts must say “Save
  and approve”; do not invent an unapproved saved-correction state. Unknown or
  non-scalar legacy fields remain visible but read-only.
- Multi-PDF structure review may confirm every valid unconfirmed source
  sequentially through the existing per-source revision endpoint; do not add a
  bulk API or bypass revision validation. Its type selector exposes only Cover
  and Document. A single combined PDF may also expose Excluded; Unclassified is
  a provider-error state to resolve, not a user-selectable target.
- New provider `bbox` is normalized `[left, top, right, bottom]` in `0..1` and
  encloses the field label plus value. The worker creates automatic evidence
  only for the final selected field when its bbox produces a non-blank crop.
  Persist typed `evidence_reason` as `bbox_missing`, `bbox_invalid`, or
  `crop_blank`, and never overwrite an existing `validation_warning` with
  `missing_evidence`. A non-blank crop proves artifact availability, not
  semantic alignment; live fixture review remains required.
  `missing_evidence` is a review risk, never an approval blocker: retain a valid
  metadata value and let the reviewer open its full source page or draw Manual
  crop. Do not fabricate a broad automatic crop without grounded coordinates.
  When a metadata value conflicts with its provider `source_text` or an
  available independent full-OCR line, clear its bbox and
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
- Dashboard metrics are intentionally grouped as four job-status cards and
  three content-volume cards with one shared filtered-scope note. Job-list
  progress appears only for active jobs; terminal rows keep destructive Delete
  inside the secondary overflow menu. The sidebar language selection uses a
  neutral blue selected state, not the amber warning/brand accent.
- System telemetry describes the environment visible to the backend. The frontend
  may add sanitized CPU/runtime details, memory, the disk containing
  `OCR_DATA_DIR`, best-effort GPU details, and persisted OCR operation samples.
  It must not expose hostname, IP, usernames, paths, processes, environment
  dumps, raw command output, secrets, or provider configuration; do not require
  GPU access in the default Compose stack.
- Durable Code Catalog state belongs in atomic `OCR_DATA_DIR/_codes.json` with
  revision conflicts and restart/backup tests; do not add a database.

## Runtime contract

- Direct local development with `OCR_AUTH_MODE=disabled` may still use:
- Direct backend: `50177`.
- Direct frontend: `54846`.
- Auth deployment publishes only Nginx on `10.6.18.76:54846`; backend, frontend,
  worker and Redis stay private. The frontend image builds its `/api/*` rewrite to
  `http://backend:50177`, while Nginx routes `/api/*` directly to backend.
- Do not add `BACKEND_PORT`; it does not configure the listener.
- Browser API calls remain relative `/api/*`; TLS terminates outside Compose.
- The live `X19` target is `http://10.6.18.76:54846`, with Nginx alone binding
  `10.6.18.76:54846:80`; host `52409` and the frontend host publish are removed.
  HTTP risk is explicitly limited to the internal demo.

## Working procedure

1. Read `implementation_plan.md` before backend, migration, or cutover work. For
   frontend work, read `frontend_plan.md`. Follow the matching
   `BE-Xn`/`FE-Xn` backlink and do not close one side without its counterpart.
   For `X19`, also read `Simple_Auth.md` completely before changing auth,
   AppShell login/logout or deployment port ownership.
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
