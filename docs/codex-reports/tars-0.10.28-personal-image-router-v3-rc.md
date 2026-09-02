# TARS 0.10.28 Personal Image Router V3 Release Candidate

## Release

- Version: `0.10.28`
- Parent commit: `01c2da88e67f1504a2e43fe97f83146bee919b00`
- Branch: `feature/personal-image-router-v3`
- Deploy: not performed
- Production settings: unchanged

## Scope

- Bumped only the application/package patch version from `0.10.27` to `0.10.28`.
- Updated the existing release and packaging expectations for the new manifest version.
- No additional routing, classification, receipt, accounting, reporting, or Scanner 2.0 behavior was changed.
- The Personal Image Router V3 remains: preselect `Фото`, `Чек`, or `Рассылка`; one primary Vision pass confirms the choice; exactly one existing downstream pipeline may run.

## Changed files

- `app.json`
- `package.json`
- `package-lock.json`
- `tests/scanner2-packaging.test.js`
- `tests/scanner2-runtime-record-only.test.js`
- `docs/codex-reports/tars-0.10.28-personal-image-router-v3-rc.md`

## Verification

- Scanner/runtime tests: `22/22 PASS`.
- Legacy tests: `77/77 PASS`.
- Personal Image Router V3 runtime: PASS.
- Preselected image type routing: PASS.
- Safe deploy workflow and deploy credential hygiene: PASS.
- Node syntax and `git diff --check`: PASS.
- Canonical `build-tars.sh`: PASS.
- ZIP integrity and exact five-file package contract: PASS.
- Bundle policy: PASS; only approved Rocket.Chat modules and `crypto` remain external.
- Bundled `TarsReportApp.js` SHA-256: `e5c84cb60459240c706d7f84e1562c1ec489d7a699d78347f03ee602d713b35f`.
- Local ZIP SHA-256 (diagnostic only): `02451fdce080f24884f8db3641c8081bfda54ce5d0c25e25060b5fc46255da9a`.

## Risk

- Release-only regression risk: LOW.
- Overall router rollout risk remains MEDIUM because the central personal-image routing gate changed in the parent implementation, although downstream receipt, photo, mailing, accounting, and control pipelines remain unchanged.

## Next step

After successful Packaging CI and review, fast-forward this feature branch into the then-current `develop`, run validation-only CI, and perform deployment only under a separate explicit instruction.
