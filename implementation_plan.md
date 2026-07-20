# OCR MVP implementation plan

## Objective

Implement the backend used by `web/` for internal OCR of Vietnamese archival and administrative PDFs. The UI keeps its current dashboard, report, crop, correction, polling, cancellation, rerun, and deletion flows; only the upload UI becomes PDF-only.

The development workstation needs only source checks and unit tests. Redis, Celery, PyMuPDF rendering, and a real VLM endpoint run only on the strong server.

## Locked MVP scope

- Input is PDF-only: up to 15 PDFs/job, 200 MB total, and 100 pages/PDF.
- One uploaded PDF is one document. A PDF containing several logical documents is not split automatically.
- Documents follow the existing Vietnamese archival/admin field schema in `web/app.js`. Fields may be empty; the model must not invent new fields.
- One configured engine is exposed at a time: `qwen`, `openai`, or `azure_openai`. Do not advertise PaddleOCR until it has a verified OpenAI-compatible endpoint.
- The service is internal-only. No application authentication is added in this MVP.
- Do not add a database, provider SDK, generic parser, HTML export, rate limiter, or worker-concurrency policy.

## PDF to VLM flow

PyMuPDF is a **local PDF/image utility**, not an OCR engine and not a VLM client.

```text
uploaded PDF
  -> PyMuPDF opens PDF locally
  -> PyMuPDF renders each page to PNG at 200 DPI
  -> runner sends one page PNG per request to the configured OpenAI-compatible VLM API
  -> VLM returns strict JSON for that page
  -> backend validates and merges field candidates into normalized job JSON
  -> /jobs/{job_id} reads the JSON/artifacts and renders the existing UI
```

PyMuPDF also crops the stored page PNG for manual-crop requests. It never calls a model and never performs OCR. Sending page images, rather than PDFs, makes the VLM input consistent across Qwen, OpenAI, and Azure OpenAI compatible endpoints.

## Runtime architecture

```text
Browser -> FastAPI -> data/jobs/<job-id>/ (durable JSON, PDF, PNGs, artifacts)
                       |             ^
                       v             |
                   Redis <-> Celery worker -> OpenAI-compatible VLM API
```

FastAPI never performs long OCR work in a request. Redis is only the Celery broker/result backend; filesystem state survives Redis and API restarts.

## Source layout

```text
src/ocr/
  __main__.py  # starts Uvicorn
  app.py       # FastAPI routes and UI/static responses
  jobs.py      # filesystem storage, validation, transitions, atomic writes
  tasks.py     # Celery task and worker orchestration
  runner.py    # PyMuPDF page rendering plus OpenAI-compatible VLM request
web/           # existing dependency-free frontend
tests/         # focused unittest checks
data/jobs/     # runtime only; ignored by git
```

## Durable job model

Each job directory contains `job.json`, `uploads/`, `artifacts/`, `corrections/`, and a per-job lock/cancellation marker. `job.json` snapshots provider, model, and `prompt_version`; it never contains an API key or raw provider response.

All job updates use a per-job lock plus atomic JSON replacement. Cancellation is a separate marker so the worker can observe it while it is processing pages.

Lifecycle:

1. `POST /api/jobs` creates an `uploading` job after validating options.
2. `PUT /api/jobs/{id}/files?path=` stores one PDF under `uploads/`; reject traversal, duplicate names, non-PDFs, and quota excess.
3. `POST /api/jobs/{id}/start` requires every expected upload, requires external-data consent for the configured external engine, marks `queued`, and submits Celery work.
4. The worker renders and processes one PDF page at a time, persisting progress after each safe boundary.
5. A job is `completed_with_warnings` if one or more PDFs/pages fail but at least one PDF succeeds; it is `error` only when every PDF fails.
6. Cancellation becomes `cancelling`; an in-flight VLM request may finish, then the worker stops before the next page and marks `cancelled`.
7. Rerun creates a new job from the source upload/options and never changes the old job.

Keep frontend status values supported: `uploading`, `ready`, `queued`, `running`, `starting`, `cancelling`, `completed`, `completed_with_warnings`, `error`, `cancelled`, and `interrupted`.

## VLM contract

Environment configuration:

```text
OCR_PROVIDER=qwen|openai|azure_openai
OCR_BASE_URL=https://...
OCR_API_KEY=...
OCR_MODEL=...
OCR_TIMEOUT_SECONDS=120
AZURE_OPENAI_API_VERSION=...       # Azure only
AZURE_OPENAI_DEPLOYMENT=...        # Azure only
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
OCR_DATA_DIR=data/jobs
```

The runner uses standard-library HTTP. It sends one rendered page PNG per VLM request and accepts only strict JSON containing the existing field names and per-field `value`, `confidence`, `bbox`, and `page_index`. Invalid model JSON is a safe terminal page/document failure; do not add a best-effort parser.

When candidates disagree, keep their evidence and choose the highest-confidence value. Mark that field `review_only`; the completed job gets warnings. Retry once only for network failures, timeout, `408`, `429`, or `5xx`. Treat `400`, `401`, `403`, `404`, and `413` as terminal.

`POST /api/engines/{id}/check` validates configuration, then makes a bounded real request with a 1x1 image on configured strong servers. On an unconfigured workstation it returns `not_configured` without a network call.

## Corrections, crops, reports, and deletion

- Manual crop validates document/page/field ownership and image bounds, then uses PyMuPDF/Pillow-free local image handling to save a crop artifact. It does not invoke VLM again.
- Corrections append an audit record with `actor: "anonymous"`, old/new values, timestamp, and existing evidence. Raw OCR evidence is never overwritten.
- A document becomes `approved` only when no field still needs review. Saving an unchanged document may approve it if no blocker remains.
- `report_url` is `/jobs/{id}`. That route reads persisted normalized JSON/artifacts and serves the current UI; do not generate static report HTML.
- Persist only normalized results, page PNGs, crop artifacts, and corrected JSON. Do not persist raw VLM responses.
- Logs are redacted structured events only, capped at 200 events and 64 KB/job.
- Deletion is permanent. `bulk-delete` rechecks each requested job is terminal immediately before removing its whole directory, and reports skipped/failed jobs.

## API contract

Implement the routes consumed by `web/app.js`:

`GET /`, `GET /jobs/{id}`, `GET /api/state`, `POST /api/jobs`, `GET /api/jobs/{id}`, `PUT /api/jobs/{id}/files`, `POST /api/jobs/{id}/start`, `POST /api/jobs/{id}/cancel`, `POST /api/jobs/{id}/rerun`, `GET /api/engines`, `POST /api/engines/{id}/check`, `POST /api/jobs/{id}/manual-crop`, `POST /api/jobs/{id}/corrections`, `POST /api/jobs/delete-preview`, `POST /api/jobs/bulk-delete`, and `GET /api/system-metrics`.

Serve job artifacts read-only through controlled job-relative paths. Errors are explicit JSON codes already understood by `web/app.js`; no secret, request body, or raw VLM response enters an API error or log.

## Implementation order

1. Add FastAPI, Uvicorn, Celery, Redis client, and PyMuPDF metadata; ignore `.env` and `data/jobs/`.
2. Serve `web/` with injected `window.INTELLIDOC_DATA`; make its upload controls PDF-only and populate engines from the configured engine.
3. Implement filesystem jobs, atomic state updates, PDF validation/limits, create/upload/list/status/start routes, and focused tests using a temporary directory.
4. Add Celery dispatch, page-by-page processing, cancellation markers, retries, batch warning/error semantics, and rerun.
5. Implement PyMuPDF render/crop and the strict OpenAI-compatible runner with mocked HTTP tests.
6. Add correction audit, dynamic `/jobs/{id}` report data, deletion, aggregate state, and no-GPU system-metrics fallback.
7. Run local checks, then validate a real PDF/VLM flow on the strong server.

## Validation

Development workstation:

```powershell
$env:PYTHONPATH = "src"
python -m unittest discover -s tests
python -m compileall src
```

FastAPI must start without Redis/Celery/provider configuration. `start` then returns a clear configuration/worker error; tests inject a fake dispatcher and never call a real endpoint.

Strong server validation: configure `.env`, start Redis, a Celery worker, and `python -m ocr`; then verify readiness, PDF upload, polling, corrections, crop, cancellation, rerun, and persistence after FastAPI/Redis restart.
