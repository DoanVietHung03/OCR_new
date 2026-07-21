# Legacy browser parity evidence

The recreation uses only public API data. No UI block depends on fabricated
progress, telemetry, logs, or provider state.

| UI block | Public source |
| --- | --- |
| Dashboard totals and rows | `GET /api/state` metrics, jobs, limits, pagination |
| Engine configuration | `StateResponse.ocr_methods`, `POST /api/engines/{id}/check` |
| Upload | limits plus create, file upload, and one-shot start endpoints |
| Lifecycle actions | cancel, rerun, delete-preview, and bulk-delete endpoints |
| Review workspace | `GET /api/jobs/{id}` documents, pages, fields, and safe errors |
| Save and approve | `POST /api/jobs/{id}/corrections` |
| Crop evidence | page artifact plus `POST /api/jobs/{id}/manual-crop` |
| Inline report and logs | job `report_url`, counters, documents, and legacy `logs` |
| System Monitor | `GET /api/system-metrics` |

Baseline and completed-state captures use the same sanitized browser fixture:

- `legacy-dashboard.png`: populated legacy dashboard at 1440x900.
- `recreated-dashboard.png`: recreated dashboard using the same sanitized job.
- `review-workspace.png`: recreated desktop review workspace at 1440x900.
- `crop-modal.png`: recreated natural-pixel crop editor at 1366x768.

Acceptance is interaction/checklist based, not a pixel-diff gate. The desktop
checks cover upload, URL filters, all lifecycle actions, every document/page,
Save-and-Approve, conflict preservation, report, crop coordinates, conditional
logs, and System Monitor. The 390x844 check covers horizontal overflow, intact
layout, and closable dialogs only.

The final local run on 2026-07-21 passes 10 default browser tests. With
`UPDATE_UI_BASELINE=1`, all 11 tests pass and refresh the four sanitized images
above. These captures and mocked/real-eager browser paths are local UI contract
evidence, not Milestone C evidence.
