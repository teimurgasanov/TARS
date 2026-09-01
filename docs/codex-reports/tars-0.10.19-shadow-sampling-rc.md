# TARS 0.10.19 Shadow Sampling Release Candidate

## Release metadata

- Version: `0.10.19`
- Parent commit: `0994bee9a36013c1df66f08e9caa35021e123392`
- Branch: `feature/scanner2-shadow-sampling`
- Application ID, `nameSlug`, `classFile`, `requiredApiVersion`, and permissions are unchanged from TARS 0.10.18.

The version was synchronized in `app.json`, `package.json`, and the root package entries of `package-lock.json`. No runtime or business behavior was changed.

## Safe defaults

- Shadow Recorder mode: `OFF`
- Shadow sample percent: `0`
- Shadow retention: `30` days
- Shadow maximum records: `5000`

`RECORD_ONLY` was not enabled and the planned 5% rollout sample was not configured.

## Protected logic

The following remained byte-for-byte unchanged from the parent commit:

- `TarsReportApp.js`: `c47cbed1ba3b1185b5d4cb42763e0d4cd91470ef27b94b096b26ba2a093d3f04`
- `build-tars.sh`: `6eddc815e8fd3e05ef0e4c9e3aaf1279a6d21b1b3ea445360074d6b5419821e2`
- all `scanner2/*.js` modules;
- `en.json` and `ru.json`;
- OCR, receipts, duplicate protection, reports, photos, calculations, Rocket.Chat routing, and Scanner 2.0 decision logic.

## Validation

- Scanner 2.0 tests: 19/19 passed.
- Legacy TARS tests: 77/77 passed.
- Packaging test: passed.
- Safe-deploy workflow test: passed.
- `git diff --check`: passed.
- Canonical `./build-tars.sh`: passed.
- `unzip -t tars-report_0.10.19.zip`: passed.
- ZIP contents are exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, and `icon.png`.
- Bundled `TarsReportApp.js` SHA-256: `0fabf18eaef0a120e8ef3b9de88ba42ac82cb0ef41c8fbd222545cb3e4e3d51a`.
- Diagnostic ZIP SHA-256: `641ebf83378e1b6b67efbeb89006a92c87317e49983ac1e14db8b00eeab02cde`.

## Deployment status

No merge, deployment, manual deployment workflow, `RECORD_ONLY` enablement, sampling rollout, or change to `develop`/`main` was performed.

## Next step

Review the release commit and its Packaging CI result before any separately authorized merge or deployment.
