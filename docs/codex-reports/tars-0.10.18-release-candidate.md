# TARS 0.10.18 — Scanner 2.0 RECORD_ONLY release candidate

Date: 2026-09-01

Branch: `feature/scanner-2.0`

Parent commit: `f24e81e5f35a49872e8b2921b6ed7ca18b3765d9`

Planned release commit: `release: prepare TARS 0.10.18 scanner2 record-only`

## Release metadata

- `app.json`: `0.10.18`
- `package.json`: `0.10.18`
- `package-lock.json` top-level version: `0.10.18`
- `package-lock.json` root package version: `0.10.18`

The application ID, `requiredApiVersion`, `nameSlug`, `classFile`, permissions, and production behavior are unchanged from the 0.10.17 parent.

## Shadow Recorder safety

- `scanner2_shadow_mode` remains `OFF` by default.
- RECORD_ONLY was not enabled.
- Scanner 2.0 decision logic was not connected to the production receipt path.
- `TarsReportApp.js`, `scanner2/*`, `build-tars.sh`, translations, receipt processing, OCR, duplicates, reports, photos, calculations, and Rocket.Chat routing were not changed.

## Tests and verification

- Scanner 2.0 tests: `17/17` passed.
- Legacy TARS tests: `77/77` passed.
- `tests/scanner2-packaging.test.js`: passed.
- `tests/scanner2-safe-deploy-workflow.test.js`: passed.
- Release safety assertions confirm all three version locations, the OFF default, and the unchanged 0.10.17 permission boundary.
- `git diff --check`: passed.
- `./build-tars.sh`: passed.
- `unzip -t tars-report_0.10.18.zip`: passed.
- Bundle policy: passed with zero unresolved relative imports and zero unapproved externals.

## Package

Canonical package: `tars-report_0.10.18.zip`

Bundled `TarsReportApp.js` SHA-256:

```text
4e76b87a28b12e7efde09bf3e67e62164947acda3b0b3b7955c4991845fef2db
```

The bundle SHA is unchanged from the previous verified package, confirming that this release-candidate change is metadata-only.

ZIP contents are exactly:

```text
app.json
TarsReportApp.js
en.json
ru.json
icon.png
```

## Deployment status

No merge, deploy, or `workflow_dispatch DEPLOY` was performed. Neither `develop` nor `main` was changed. After the release commit is pushed, only the separate Scanner 2.0 Packaging CI validation is allowed to run.

## Next step

Review the successful Packaging CI result. Any merge into `develop`, activation of RECORD_ONLY, or Rocket.Chat deployment requires separate explicit authorization.
