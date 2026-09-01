# TARS 0.10.21: integration of early DATE_MISMATCH

## Scope

- Integration branch: `integration/date-mismatch-on-current-develop`
- Base: `origin/develop` at `67a639ce091b37df49b0d9d14de61772e849ee74`
- Common ancestor: `9cc6960da1ac830ae22c4696b745db53bcaf5cba`
- Functional source commit: `1c126d9ac8ea4293b8973b1214626630e8b4ec8b`
- CI-only source commit: `96f184152e64c4d83fb4078506cd497fe549e91e`
- Integrated functional commit: `e8c9116d4079546c1bcbbf22a79bec9c8420abf7`
- Integrated CI commit: `c50671ee4adfc9403de80918aa2da1d3611f8fed`

No merge into `develop`, deployment, production-setting change, or change to `main` was performed.

## Changes integrated

The conservative early exit in `validateReceiptDate()` was applied on top of the existing personal rejected-receipt control-route fix. It returns the existing `DATE_MISMATCH` only when strong, independent Yandex and primary OpenAI evidence agrees on the same non-required calendar date. All other cases retain the full legacy validation path.

The existing `financialDocumentConfirmed` evidence is preserved by the early result. Therefore a receipt rejected by the early date check continues through the existing rejected receipt index and `publishRejectedReceiptReview()` route.

## Conflicts

There was no conflict in production `TarsReportApp.js`; both production changes merged automatically and affect compatible stages of the route.

Two non-production conflicts were resolved manually:

- `tests/scanner2-packaging.test.js`: retained both runtime gates and updated the expected merged source hash.
- `.github/workflows/scanner2-packaging-ci.yml`: retained branch coverage for both hotfix branches.

## Additional integration coverage

The runtime tests now explicitly prove the combined scenario:

1. the personal-room image initially remains unknown;
2. strict validation obtains independent Yandex and primary OpenAI agreement on the previous date;
3. amount-focus and date-focus are not called;
4. the result retains confirmed financial-document evidence;
5. exactly one rejected index entry is created;
6. exactly one upload is published to `cheki-kontrol`;
7. no accepted index entry is created;
8. the confirmed-transfer summary remains `0` receipts and `0` amount;
9. repeated processing remains idempotent through the existing route.

## Verification

- Scanner 2.0/runtime tests: 22/22 PASS
- Legacy tests: 77/77 PASS
- Early DATE_MISMATCH runtime test: PASS
- Personal rejected-control and combined runtime test: PASS
- Packaging test: PASS
- Safe deploy workflow test: PASS
- Deploy token hygiene test: PASS
- `git diff --check`: PASS
- Node and shell syntax checks: PASS
- Canonical `build-tars.sh`: PASS
- `unzip -t tars-report_0.10.21.zip`: PASS
- Bundle policy: PASS
- Canonical ZIP contents: exactly 5 expected files

## Risks

Regression risk is LOW to MEDIUM. The early exit is restricted to independent, strongly confirmed date agreement, while the integration test covers the handoff into the rejected-control route. Residual risk is provider response-shape drift in production; ambiguous or incomplete evidence continues through the unchanged full legacy path.

## Next step

Review this integration branch. If approved, update `develop` only through a separately authorized integration step. Deployment remains a separate explicit action.
