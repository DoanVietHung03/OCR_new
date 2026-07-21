# Phase 4 acceptance evidence

Complete this file on the strong server. Do not record secrets, provider URLs,
raw responses, unredacted document text, or API keys. A local test pass cannot
replace the evidence below.

## Build and environment

- Date/operator: _pending_
- Commit: _pending_
- Image digests: _pending_
- Host/runtime versions: _pending_
- Sanitized `docker compose config` attached: _pending_

## Data protection and worker cutover

- Uploads paused: _pending_
- Legacy queue drained and worker stopped: _pending_
- `OCR_DATA_DIR` resolved path: _pending_
- Backup path, size, SHA-256: _pending_
- Verified only one worker version used the directory: _pending_

## Fixed acceptance fixtures

Fixtures remain outside Git and `OCR_DATA_DIR`. Record metadata only.

| Fixture | SHA-256 | Bytes/pages | Job ID | Artifacts/report | Manual field check |
| --- | --- | --- | --- | --- | --- |
| Clear digital PDF | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Multi-page scan | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
| Difficult scan | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |

## Runtime gates

- Nginx health on `52409`: _pending_
- Direct frontend and `/api/*` proxy on `54846`: _pending_
- Backend/Redis internal-only: _pending_
- Worker registered `ocr.process_job`: _pending_
- Worker concurrency `1`, prefetch `1`: _pending_
- Upload over 1 MiB succeeds without `413`: _pending_
- No `worker_unavailable`, duplicate task, secret, or raw response in logs:
  _pending_
- Correction reload, crop evidence, approval, rerun, delete: _pending_

## Restart, compatibility, and rollback

- Terminal job survives backend/worker/Redis restart: _pending_
- Active job becomes `interrupted`; stale task no-ops: _pending_
- New-to-legacy and legacy-to-new round-trip: _pending_
- New stack stopped before legacy started: _pending_
- Rollback route rehearsal and result: _pending_
- Backup restore required: _pending (expected: no)_

## Commands and sign-off

Record each exact command, timestamp, exit status, and sanitized evidence path:

```text
pending
```

- Gate result: **PENDING**
- Approver/date: _pending_
- One-day rollback window ends: _pending_
