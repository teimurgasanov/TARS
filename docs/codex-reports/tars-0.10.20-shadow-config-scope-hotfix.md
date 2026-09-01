# TARS 0.10.20 Shadow Config Scope Hotfix

## Release context

- Parent commit: `b7dff76ab57e6de2b5f48f72db51995b2c9d8515`
- Branch: `fix/scanner2-shadow-config-scope`
- Version: `0.10.20`
- Deployment performed: **no**
- Production settings changed: **no**

## Root cause

`receiptOcrConfig()` is a method of the outer `TarsReportApp` module, while
`parseShadowSamplePercent`, `parseShadowRetentionDays`, and
`parseShadowMaxRecords` were lexical bindings inside the bundled
`upload-duplicate-guard` module. The method called those names unqualified, so
the production bundle raised `ReferenceError` before receipt OCR and accounting
could begin.

## Fix

The existing parser implementations are now exported by the internal guard
module and `receiptOcrConfig()` calls them through the already established `G`
module object. No parser was copied and no parsing, sampling, OCR, duplicate,
financial, reporting, photo, or routing rule changed.

## Changed files

- `TarsReportApp.js` — exports the three existing parser functions and uses
  `G.parseShadow*` from `receiptOcrConfig()`.
- `app.json`, `package.json`, `package-lock.json` — version `0.10.20`.
- `tests/helpers/canonical-tars-runtime.js` — isolated Rocket.Chat runtime mocks
  and canonical esbuild loader for executable bundle tests.
- `tests/scanner2-shadow-config-runtime.test.js` — executes the canonical bundle
  and calls the real `receiptOcrConfig()` with RECORD_ONLY/100/30/5000 settings.
- `tests/scanner2-receipt-running-total-runtime.test.js` — executes the real
  config method and real receipt index/running-total functions for one accepted
  personal-room receipt of 1200 RUB.
- `tests/scanner2-packaging.test.js` — makes both runtime tests packaging gates
  and updates source/manifest integrity hashes.
- `tests/scanner2-runtime-record-only.test.js` — release metadata assertions for
  `0.10.20`; safe defaults remain OFF/0/30/5000.
- `tests/scanner2-safe-deploy-workflow.test.js` and the two validation workflows
  — expected Scanner 2.0 test count updated from 19 to 21; deploy guards are
  unchanged.

## Runtime regression test

The canonical single-file bundle was loaded with Rocket.Chat API mocks and its
actual `TarsReportApp.prototype.receiptOcrConfig()` method returned:

- `scanner2ShadowMode = RECORD_ONLY`
- `scanner2ShadowSamplePercent = 100`
- `scanner2ShadowRetentionDays = 30`
- `scanner2ShadowMaxRecords = 5000`

Result: **PASS**, with no `ReferenceError`.

The final ZIP bundle was extracted and subjected to the same runtime smoke
test. Result: `BUNDLED_RECEIPT_OCR_CONFIG_SMOKE=PASS`.

## Receipt 1200 RUB regression test

The test uses production functions rather than replacement business logic:

1. the canonical bundle loads the real receipt configuration;
2. the real `writeIndex()` stores an accepted personal-room receipt;
3. the stored entry retains `receiptAmount = 1200`;
4. the real `publishMasterTransferSummary()` rebuilds the authoritative ledger;
5. the generated message contains `Чеков: 1` and
   `Общая сумма чеков: 1 200 ₽`.

Result: **PASS**.

## Verification results

- Scanner 2.0 test files: **21/21 PASS**.
- Legacy TARS test files: **77/77 PASS**.
- Safe deploy workflow test: **PASS**.
- Deploy token hygiene test: **PASS**.
- Node syntax checks: **PASS**.
- `git diff --check`: **PASS**.
- `./build-tars.sh`: **PASS**.
- Bundle policy: **PASS**, zero unresolved relative imports and zero unapproved
  externals.
- `unzip -t tars-report_0.10.20.zip`: **PASS**.
- ZIP contents: exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`,
  and `icon.png`.

## Artifact hashes

- Tracked `TarsReportApp.js` SHA-256:
  `29bbbe3717cbf3366acb16d71238fd493aeb1051cfd22b3db79be17e08978f23`
- Tracked `app.json` SHA-256:
  `ec0eecd7f7de18234cd39e2cd51d67c8a04c5f1fe6f328490ab73bc3a03ca7d0`
- Bundled `TarsReportApp.js` SHA-256:
  `db24a796bf6579f92777daf93e9cc742a2d3cd46af9c68dc80fd9dff053ae49f`
- `tars-report_0.10.20.zip` SHA-256:
  `5033e9891207068740736fa5ad5210afcf34bab4ce97b65e078308cebe1c50b3`

## Regression risk

**LOW.** The production change is limited to module export/scope wiring and is
covered by executable bundle and receipt-accounting regression tests. The
receipt path is financially sensitive, so deployment should still remain a
separate, explicitly authorized manual step after CI review.

## Recommended next step

After successful branch CI, review and fast-forward/cherry-pick this hotfix into
`develop`. Do not deploy until separately authorized.
