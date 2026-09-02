# Personal Image Router V3

## Scope

- Branch: `feature/personal-image-router-v3`
- Base develop commit: `9849a5d68ce4acc3ebef33d6feb9f002a82a08e8`
- Implementation commit: `c07358d`
- Application version: `0.10.27` (unchanged)
- Deploy: not performed
- Production settings: unchanged

## What changed

- Added the isolated `scanner2/personal-image-router-v3.js` parser and routing policy.
- Replaced the overloaded receipt/type primary classification call with one compact image-type Vision pass.
- Added three persistent pre-upload choices in each personal report launcher: `Фото`, `Чек`, and `Рассылка`.
- A personal image now requires exactly one active pre-upload intent before Vision or any downstream pipeline runs.
- Vision must confirm the selected type. A missing, inconclusive, or mismatched result fails closed without starting a receipt, work-photo, or mailing pipeline.
- A clean `HIGH WORK_PHOTO` routes through the existing work-photo pipeline with zero receipt OCR/Yandex calls.
- Positive payment, receipt, financial-document, or document-layout evidence blocks the work-photo route.
- The old post-upload `Что вы отправили?` selection path is no longer reachable from `executePostMessageSent`.
- The persistent three-button launcher is not deleted after a selection; only the temporary fallback menu may be removed.
- Existing receipt validation, duplicate protection, owner attribution, accepted/rejected indexes, running totals, control routing, reports, and Scanner 2.0 RECORD_ONLY logic were not changed.

## Files changed

- `.github/workflows/scanner2-packaging-ci.yml`
- `TarsReportApp.js`
- `scanner2/personal-image-router-v3.js`
- `tests/automatic-receipt-unified-pipeline.test.js`
- `tests/compact-upload-menu.test.js`
- `tests/dedicated-work-photo-forwarder.test.js`
- `tests/manual-image-selection-telemetry.runtime.js`
- `tests/manual-image-type-selection.runtime.js`
- `tests/no-upload-buttons-auto-classification.test.js`
- `tests/personal-image-router-v3.runtime.js`
- `tests/photo-report-button.test.js`
- `tests/preselected-image-type-routing.runtime.js`
- `tests/receipt-mode-ten-minutes.test.js`
- `tests/scanner2-packaging.test.js`
- `tests/vision-dominant-image-routing.runtime.js`
- `tests/vision-high-confidence-authority.runtime.js`

## Verification

- Targeted Vision/router/manual-selection/MIME/security runtime checks: PASS.
- Scanner/runtime suite: 22/22 PASS.
- Legacy TARS suite: 77/77 PASS.
- Aleksei and Dasha HIGH hair-work regression fixtures: PASS.
- Preselected photo: one Vision V3 call, zero receipt OCR/Yandex calls, one existing photo pipeline: PASS.
- Upload without a preselected type: three-button menu shown, no processing pipeline started: PASS.
- Financial/document safety overrides: PASS.
- Canonical packaging test: PASS.
- `git diff --check`: PASS.
- Node syntax checks: PASS.
- `build-tars.sh`: PASS.
- ZIP test and exact five-file package contract: PASS.
- Bundle policy: PASS; approved Rocket.Chat externals plus `crypto` only.
- Bundled `TarsReportApp.js` SHA-256: `e5c84cb60459240c706d7f84e1562c1ec489d7a699d78347f03ee602d713b35f`.
- Local ZIP SHA-256 (diagnostic only): `fe251bf209ed57ae1026e4f2d00d15b676ba37d508e1a55badcfd77363a2fbc5`.

## Risks

- Regression risk: MEDIUM. The central personal-image routing gate changed, although all downstream business pipelines remain intact.
- Provider outage or malformed Vision output now fails closed and requires the user to select/retry; it cannot silently classify by OCR.
- The intent TTL remains ten minutes for stale-state safety, but a successfully handled upload clears the chosen intent.
- The previous post-upload selection implementation remains in the source for backward-compatible action handling, but is disconnected from the normal runtime path.

## Recommended next step

Review the branch and successful Packaging CI. If approved, integrate it into the current `develop` through a controlled fast-forward/integration step, run validation-only CI, then prepare a separate patch release. Do not deploy until that review is complete.
