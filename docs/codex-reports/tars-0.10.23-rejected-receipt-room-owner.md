# TARS 0.10.23 rejected receipt room-owner hotfix

## Commit

`e93da37` — `fix(receipts): attribute rejected receipts to room owner`

## Changes

- Personal-room rejected receipt records now use the resolved room owner instead of the uploader.
- Control cards receive the same resolved owner.
- Approval normalizes legacy rejected entries to the personal-room owner before confirmation.
- An unresolved personal-room owner remains rejected and never falls back to the uploader.
- Source-copy and source-message deletion behavior is unchanged.

## Files

- `TarsReportApp.js`
- `tests/scanner2-personal-rejected-control-runtime.test.js`
- `tests/scanner2-packaging.test.js`

## Verification

- Scanner/runtime tests: 22/22 PASS.
- Legacy tests: 77/77 PASS.
- Owner scenarios: admin uploader, second admin uploader, master self-upload, approval, unresolved owner, source deletion and accepted path PASS.
- Canonical build, ZIP integrity and bundle policy PASS.

## Risk

Medium. The patch changes persisted identity metadata for rejected receipts and manual approval, but does not change classification, OCR, receipt validation, duplicate logic, running totals, source deletion, routing or Scanner 2.0 decisions.

## Next step

Review and integrate this branch independently. Do not combine it with the manual image-type selection feature until both branches are separately validated.
