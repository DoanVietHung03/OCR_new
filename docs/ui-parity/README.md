# Legacy browser parity evidence

The recreation uses only public API data. No UI block depends on fabricated
progress, telemetry, logs, or provider state.

| UI block | Public source |
| --- | --- |
| Dashboard totals and rows | `GET /api/state` metrics, jobs, limits, pagination |
| Provider configuration | `GET /api/provider-profiles`, `POST /api/engines/{id}/check` |
| Upload | limits plus create, file upload, and one-shot start endpoints |
| Lifecycle actions | cancel, rerun, delete-preview, and bulk-delete endpoints |
| Review workspace | `GET /api/jobs/{id}` documents, pages, fields, and safe errors |
| Save and approve | `POST /api/jobs/{id}/corrections` |
| Crop evidence | page artifact plus `POST /api/jobs/{id}/manual-crop` |
| Documents/Manage | `GET /api/documents` filesystem projection |
| Artifact explorer | `GET /api/jobs/{id}/artifacts`; missing references stay explicit |
| Logs/timeline | `GET /api/events` derived from durable lifecycle/review/crop state |
| Reports/benchmark | `GET /api/reports`; absent compatible samples stay unavailable |
| Codes | `/api/codes` CRUD backed by atomic `OCR_DATA_DIR/_codes.json` |
| System Monitor | `GET /api/system-metrics` allowlist |

Baseline and completed-state captures use the same sanitized browser fixture:

- `legacy-dashboard.png`: populated legacy dashboard at 1440x900.
- `legacy-dashboard-1366x768.png`: the same legacy fixture at 1366x768.
- `recreated-dashboard.png`: recreated dashboard using the same sanitized job.
- `recreated-dashboard-1366x768.png`: the same recreated state at 1366x768.
- `review-workspace.png`: recreated desktop review workspace at 1440x900.
- `crop-modal.png`: recreated natural-pixel crop editor at 1366x768.
- `mobile-upload-390x844.png`: PDF-only mobile safety state.

Acceptance is interaction/checklist based, not a pixel-diff gate. The desktop
checks cover upload, URL search/sort, all lifecycle actions, every document/page,
Save-and-Approve, conflict preservation, report timing/coverage, crop coordinates,
scoped safe logs, and CPU load in System Monitor. The 390x844 check covers
horizontal overflow, intact layout, and closable dialogs only.

The final local run on 2026-07-21 passes 11 default browser tests; the twelfth is
capture-only. With `UPDATE_UI_BASELINE=1`, all 12 tests pass and refresh the
sanitized images above. The visual review caught and fixed the 1366px action-grid
overflow and restored the truthful Run comparison block. These captures and
mocked/real-eager browser paths are local evidence, not Milestone C evidence.
