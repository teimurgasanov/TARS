# TARS 0.10.29 Personal Image Selector Visibility Hotfix

## Root cause

The three image-type buttons were embedded only in the report launcher created after a report profile existed. Existing personal rooms could retain an older launcher, and rooms without a selected profile received only the report-type menu. Consequently, the deployed Vision router was present but the required pre-upload selector was not reliably visible.

## Fix

- Added one standalone persistent `Что вы отправите?` selector with `Фото`, `Чек`, and `Рассылка` buttons.
- Selector lifecycle is independent from report profile and report launcher lifecycle.
- App update refreshes the selector in every registered personal room and also recovers configured `tars-<username>` rooms missing from the historical room registry.
- The replacement selector is created before the previous selector is removed.
- Report submission and master-room creation refresh the selector as the latest room launcher.
- Removed duplicate image buttons from the report launcher.
- Vision Router V3, receipt validation, financial accounting, photo/mailing pipelines, control routing, and Scanner 2.0 behavior were not changed.

## Changed files

- `.github/workflows/scanner2-packaging-ci.yml`
- `TarsReportApp.js`
- `app.json`
- `package.json`
- `package-lock.json`
- `tests/personal-image-selector-visible.runtime.js`
- `tests/compact-upload-menu.test.js`
- `tests/photo-report-button.test.js`
- `tests/no-upload-buttons-auto-classification.test.js`
- `tests/scanner2-packaging.test.js`
- `tests/scanner2-runtime-record-only.test.js`
- `docs/codex-reports/tars-0.10.29-personal-image-selector-visibility-hotfix.md`

## Verification

- Standalone selector runtime and replacement idempotency: PASS.
- Preselected Vision routing: PASS.
- Vision Router V3 financial-only safety override: PASS.
- Scanner/runtime tests: `22/22 PASS`.
- Legacy tests: `77/77 PASS`.
- Safe deploy and token hygiene: PASS.
- Node syntax and `git diff --check`: PASS.
- Canonical build, five-file ZIP, unzip integrity, and bundle policy: PASS.
- Bundle SHA-256: `19adcfc6dd1e1abd0ebb25263cc958df3bb9bb00c2c96e1936db8e4f6e9b53a4`.
- Local ZIP SHA-256 (diagnostic only): `dc5c7289c19bf6b310bc5ec630f5bcd48b3dc62f8f7791001980c2f5aa3548c3`.

## Risk

Regression risk: LOW–MEDIUM. The patch changes only launcher publication and persistence. Image classification and all downstream business pipelines are unchanged. A selector publication failure keeps the previous selector and is logged without affecting receipt/report processing.

## Next step

Run Packaging CI, fast-forward into `develop`, pass validation-only CI, then deploy through the guarded manual workflow. After deployment, the user only needs to press one of the three buttons and upload an image.
