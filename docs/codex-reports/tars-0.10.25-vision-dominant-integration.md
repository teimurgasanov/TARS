# TARS 0.10.25 Vision-dominant integration

## Scope

- Base develop commit: `7ce4a5e9900348542c0bbc56db7ce271aaa653ee`.
- Reviewed feature commit: `39fd391568bb1f5b88e6c74f1fc5ad9ddfef84e4`.
- Release commit: `805295fee3851f1968b57ae54ca6162039c21834`.
- Integration branch: `integration/vision-dominant-current-develop`.
- Version: `0.10.25`.

The feature was a direct continuation of current `origin/develop`, so it was integrated by fast-forward without conflicts. `develop`, `main`, production settings, and the deployed application were not changed.

## Behavior

- High-confidence `WORK_PHOTO` enters the existing work-photo pipeline without receipt OCR.
- High-confidence `RECEIPT` or bank-transfer evidence enters the existing financial validation pipeline.
- High-confidence `MAILING` enters the existing mailing pipeline.
- Medium-, low-confidence, and unknown results retain the compact manual selection fallback.
- Preview/original reuse, SOURCE/MIME telemetry, financial validation, duplicate protection, owner attribution, accepted/rejected indexes, running totals, control routing, mailing accounting, source handling, and Scanner 2.0 `RECORD_ONLY` behavior remain covered by regression tests.

## Files

The feature changes `TarsReportApp.js`, targeted routing/regression tests, the packaging CI branch trigger, and its technical report. The release step changes only version metadata in `app.json`, `package.json`, and the root entries of `package-lock.json`, plus the corresponding version/hash assertions in Scanner 2.0 release and packaging tests.

## Verification

- Vision routing runtime: PASS.
- Manual fallback runtime: PASS.
- Preview/original and SOURCE/MIME telemetry/privacy: PASS.
- Work-photo, receipt, mailing, owner attribution, running total, and rejected-to-control paths: PASS.
- Scanner/runtime suite: `22/22` PASS.
- Legacy suite: `77/77` PASS.
- Canonical build, ZIP integrity, Node syntax, and bundle policy: PASS.
- Bundle SHA-256: `4d519f059f04f8ad6b03d313899af32a1b57bd3966502153bb85b1cc9de10690`.
- ZIP contains exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, and `icon.png`.

## Risks

Regression risk is MEDIUM because personal-image routing order changes for high-confidence Vision results. Financial validation and safety guards remain intact, and inconclusive results retain the manual fallback. No deploy was performed.

## Next step

Review the integration branch and its CI result. Only after explicit approval should it be fast-forwarded into `develop`; deployment and production-setting changes remain separate operations.
