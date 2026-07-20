# Repository Guidelines

This is a Python 3.12 OCR service with a static HTML/CSS/JS frontend. Keep the
project boring: use the standard library first and add only selected runtime
dependencies needed by the workflow.

## Chosen tech stack

- Python 3.12.
- FastAPI + Uvicorn for JSON APIs, static `web/` files, reports, and read-only
  OCR artifacts.
- Celery + Redis for background OCR work. FastAPI must not run long OCR work
  inside an HTTP request.
- JSON plus job filesystem is persistent state. Redis is only a broker/result
  backend; do not add a database without a real requirement.
- One OpenAI API Compatible HTTP OCR runner, configured for Qwen, OpenAI, or
  Azure OpenAI with environment variables. Do not add provider SDKs per engine.
- HTML, CSS, and vanilla JavaScript stay in `web/`; no frontend framework or
  build pipeline.

## Project structure

- `src/ocr/` - Python application package.
- `web/` - browser entrypoint and static assets.
- `tests/` - focused `unittest` checks.
- `pyproject.toml` - package metadata and build configuration.
- `data/jobs/` - runtime job data only; never commit it.

Do not add a database layer, provider-specific SDK wrappers, frontend asset
directories, or framework-specific frontend code without a real feature need.
Keep frontend assets in `web/`.

## Development flow

Install the package in editable mode once per environment:

```powershell
python -m pip install -e .
```

Run the API locally when dependencies are available:

```powershell
python -m ocr
```

Then open `http://localhost:8000`. The FastAPI app serves `web/` and injects
frontend server data at `/` and `/jobs/{job_id}`.

The current workstation is development-only. Do not require Redis, Celery, GPU
software, or a real OCR provider for local checks. Run the complete stack and
end-to-end OCR flow only on the designated strong server. Configure `.env` on
that server; never expose API keys in source, artifacts, job JSON, or logs.

## Checks

Run the focused test suite:

```powershell
$env:PYTHONPATH = "src"
python -m unittest discover -s tests
```

Add one small regression test for non-trivial behavior. Keep tests focused on
observable behavior; avoid fixtures and test frameworks until needed. Local
checks must not call a real OCR endpoint.

## Conventions

- Python: standard formatting, four-space indentation, descriptive `snake_case`
  names.
- HTML/CSS/JS: keep files small, semantic, accessible, and dependency-free.
- Preserve the existing source layout and public API unless the task requires a
  change.
- Validate inputs and handle errors at trust boundaries; do not hide failures.
- Keep API behavior aligned with `web/app.js`: job lifecycle, polling, upload,
  cancellation/rerun, crop, corrections, delete preview, and metrics.
- Persist job metadata, uploads, artifacts, and correction audit trails beneath
  each job directory. Treat paths, state transitions, and crop ownership as
  trust boundaries.
- A provider failure must become a clear terminal job error with safe logs, not
  an HTTP request failure.

## Changes and reviews

Use short imperative commit summaries, such as `Add OCR image loader`. A change
description should state what changed and list the validation command that was
run. Include screenshots or sample output for visible UI changes.
