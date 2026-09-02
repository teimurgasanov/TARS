# TARS 0.10.27 — Vision maximum authority integration

## Scope

- Base `origin/develop`: `e285453b5de102621e430b2d5bb622c99912ea1a`.
- Functional implementation: `b2d7aedb17db1b999409dc7d065a48acf61b7938`.
- Feature CI trigger: `69ad95b7c5109d706175d6f6c5f8830737466a35`.
- Release preparation: `82e27ec173749e506c0f44774cef0b389c1f162b`.
- Version: `0.10.27`.
- Work is isolated on `integration/vision-maximum-authority-current-develop`; `develop`, `main`, production settings, and the installed app were not changed.

## Behavior

- A parsed primary Vision result with `kind=work_photo`, `confidence=high`, and no positive financial/document evidence is final for image-type routing.
- Missing service-area/result confirmation and a secondary `UNKNOWN` cannot veto that result.
- Positive banking UI, payment UI, receipt layout, financial-document layout, or document layout still blocks the work-photo route.
- HIGH receipt/bank-transfer, mailing, and inconclusive fallback behavior remain unchanged.
- Receipt date, amount, operation status, identity, duplicate protection, owner attribution, accepted/rejected indexes, running total, control routing, Scanner 2.0 RECORD_ONLY, telemetry, and preview/original idempotency remain unchanged.

## Changed files relative to the base

- `.github/workflows/scanner2-packaging-ci.yml`
- `TarsReportApp.js`
- `app.json`
- `package.json`
- `package-lock.json`
- `tests/fixtures/vision-high-confidence-authority.json`
- `tests/vision-high-confidence-authority.runtime.js`
- `tests/scanner2-packaging.test.js`
- `tests/scanner2-runtime-record-only.test.js`
- `docs/codex-reports/tars-0.10.26-vision-maximum-authority.md`
- `docs/codex-reports/tars-0.10.27-vision-maximum-authority-integration.md`

## Verification

- Aleksei male haircut fixture: PASS.
- Dasha female hair-work fixture: PASS.
- HIGH WORK_PHOTO authority: PASS.
- Receipt OCR/Yandex calls for both HIGH WORK_PHOTO cases: `0`.
- Positive financial/document guards: PASS.
- HIGH RECEIPT financial validation and UNKNOWN/manual fallback: PASS.
- Scanner/runtime tests: `22/22` PASS.
- Legacy tests: `77/77` PASS.
- `git diff --check`: PASS.
- Node syntax and `zsh -n build-tars.sh`: PASS.
- Canonical `./build-tars.sh`: PASS.
- `unzip -t tars-report_0.10.27.zip`: PASS.
- ZIP contents: exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, `icon.png`.
- Bundle policy: PASS; only approved Rocket.Chat externals and `crypto` remain.
- Bundle SHA-256: `1f264a3292df1c975922ea88691a0cc8151fc0d712f1bb594aafbddd8521ba93`.
- Local ZIP SHA-256: `e44b5f5eb114f33fbe9ecfea50b1656742a3b771c59544ad7a5ebf0046ffbb5e` (diagnostic only because ZIP timestamps vary).
- Feature Packaging CI run `33607080882`: SUCCESS with `22` Scanner/runtime and `77` legacy tests.

## Risks

- Regression risk: MEDIUM. The change intentionally broadens authority of a HIGH primary work-photo result, while retaining explicit positive financial/document vetoes.
- Residual provider risk: incorrect HIGH classification without any positive financial/document flags can route an image as a work photo. Regression fixtures cover receipt, banking, payment-screen, and document evidence.
- No deploy was performed.

## Next step

Wait for the integration-branch Packaging CI. After review, merge to `develop` only under a separate explicit instruction; deploy remains a separate guarded action.
