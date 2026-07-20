# OCR implementation plan

## Objective

Implement the backend required by the existing frontend in `web/`: create an asynchronous OCR job from uploaded archive/PDF/images, expose progress/result data, and persist manual crops and human corrections.

The current computer is development-only. It only needs source checks and unit tests. Redis, Celery, GPU support, and calls to a real OCR endpoint are only required on the strong deployment server.

## Selected stack

| Area | Choice | Responsibility |
| --- | --- | --- |
| Runtime | Python 3.12 | API and workers |
| HTTP | FastAPI + Uvicorn | APIs, `web/`, job report and artifacts |
| Background jobs | Celery | Run OCR outside request handlers |
| Broker/result backend | Redis | Celery messaging/task state |
| Persistent state | JSON + filesystem | Jobs, uploads, artifacts, logs, corrections |
| OCR | OpenAI API Compatible HTTP | Qwen, OpenAI, Azure OpenAI |
| Frontend | HTML/CSS/JS in `web/` | Existing UI, unchanged |
| Tests | `unittest` | Local behavior/contract checks |

No database, WebSocket layer, frontend framework, or provider SDK is needed. The current UI polls, so Celery and persisted job JSON is sufficient.

## Runtime architecture

```text
Browser -> FastAPI -> data/jobs/<job-id>/...
                    -> Redis <-> Celery worker -> OpenAI-compatible endpoint
```

The filesystem is the durable source of truth. Redis must not hold uploaded files, OCR artifacts, or corrections; completed jobs must still work after a Redis restart.

## Minimal source layout

```text
src/ocr/
  __main__.py  # start Uvicorn
  app.py       # FastAPI routes, static/report responses
  jobs.py      # storage, validation, state transitions
  tasks.py     # Celery application and OCR task
  runner.py    # OpenAI-compatible HTTP call and normalized OCR output
web/           # current frontend
tests/         # focused unittest checks
data/jobs/     # runtime only; gitignored
```

Do not add model/repository/service layers unless the listed modules become genuinely difficult to maintain.

## Job model and lifecycle

Each job stores `job.json`, `uploads/`, `artifacts/`, `reports/`, and `corrections/` below `data/jobs/<id>/`. `job.json` contains identity, selected engine/VLM options, expected/uploaded files, status, progress/stage, logs, timings, failure, report URL, documents, and correction/dataset counts.

1. `POST /api/jobs` creates an `uploading` job.
2. `PUT /api/jobs/{id}/files` writes each selected file into `uploads/`.
3. `POST /api/jobs/{id}/start` verifies all files arrived, marks it `queued`, and submits a Celery task.
4. The worker marks `running`, writes progress/log/artifacts, and invokes OCR.
5. The job ends as `completed`, `completed_with_warnings`, `error`, or `cancelled`.
6. Cancel requests revoke the task when possible. Rerun creates a new job from the old upload/options and never overwrites the old result.

The complete frontend status vocabulary remains supported: `uploading`, `ready`, `queued`, `running`, `starting`, `cancelling`, `completed`, `completed_with_warnings`, `error`, `cancelled`, and `interrupted`.

## OCR runner

Use one Python function to call an OpenAI API Compatible endpoint and normalize its response into the document/page/field payload already consumed by `web/app.js`. Provider choice changes endpoint configuration, not the job flow.

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

Use a standard-library HTTP client where practical. Azure URL/query details are limited to `runner.py`. API keys never appear in source, job JSON, reports, artifacts, responses, or logs.

## API contract required by the frontend

| Route | Responsibility |
| --- | --- |
| `GET /` | Serve the UI with injected `window.INTELLIDOC_DATA` in server mode |
| `GET /jobs/{id}` | Serve the same UI with one job report payload |
| `GET /api/state` | Paginated/filtered jobs, metrics, logs, reports, limits |
| `POST /api/jobs` | Create job and validate engine/options |
| `GET /api/jobs/{id}` | Latest status and report data |
| `PUT /api/jobs/{id}/files?path=` | Upload one raw file body |
| `POST /api/jobs/{id}/start` | Queue Celery work |
| `POST /api/jobs/{id}/cancel` | Request cancellation |
| `POST /api/jobs/{id}/rerun` | Create and queue a new job from a prior job |
| `GET /api/engines` | Available engines and readiness |
| `POST /api/engines/{id}/check` | Check provider/engine configuration |
| `POST /api/jobs/{id}/manual-crop` | Validate and save a page crop artifact |
| `POST /api/jobs/{id}/corrections` | Save audit correction and corrected JSON |
| `POST /api/jobs/delete-preview` | List terminal jobs eligible for deletion |
| `POST /api/jobs/bulk-delete` | Delete only eligible previewed jobs |
| `GET /api/system-metrics` | CPU/RAM/disk/GPU/queue summary with no-GPU fallback |

FastAPI serves artifacts/corrected JSON read-only from a controlled job path. API failures are explicit JSON errors matching the frontend's handling.

## Validation and safety

- Permit only `pdf` but can open for more file extensions in the future phases; enforce file-count and total-size limits returned to the UI.
- Reject absolute paths, `..`, NUL, duplicate paths, and uploads after upload state ends.
- Reject invalid transition/start/cancel/rerun/delete operations.
- Verify crop document/page/image/field ownership and rectangle bounds before writing an artifact.
- Corrections retain OCR old values and evidence in an audit trail; do not overwrite raw OCR evidence.
- Limit log size and remove secrets before persistence or display.

## Implementation order

1. Update package metadata for Python 3.12, FastAPI, Uvicorn, Celery, and Redis; gitignore `.env` and runtime job data.
2. Replace the static HTTP server with FastAPI, serve `web/`, and inject state for `/` and `/jobs/{id}`.
3. Implement job JSON/filesystem storage plus create/upload/list/status/start routes and unit tests using a temporary directory.
4. Add Celery task execution, state/progress/log updates, cancellation, and rerun.
5. Add OpenAI-compatible runner, configuration, and engine readiness checks.
6. Generate report/artifacts; implement manual crop and correction audit.
7. Add aggregate state, deletion preview/bulk delete, and system metrics.
8. Validate locally, then run full deployment validation on the strong server.

## Validation and deployment

### Development workstation

```powershell
$env:PYTHONPATH = "src"
python -m unittest discover -s tests
python -m compileall src
```

### Strong server

1. Configure `.env` with real Redis and OCR provider settings.
2. Install with `python -m pip install -e .`.
3. Start Redis, `celery -A ocr.tasks worker --loglevel=INFO`, and `python -m ocr`.
4. Verify engine readiness, real upload/report polling, correction, manual crop, cancellation, rerun, and persistence after API/Redis restart.

## Done criteria

- The current frontend works without a framework rewrite or API contract drift.
- OCR runs in Celery without blocking HTTP requests.
- Completed reports/artifacts/corrections survive FastAPI and Redis restart.
- OCR failures become safe, visible terminal job errors.
- Local unit tests pass; real endpoint behavior is verified on the strong server.

