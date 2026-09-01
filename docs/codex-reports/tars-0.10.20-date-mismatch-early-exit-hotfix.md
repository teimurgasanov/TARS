# TARS 0.10.20 DATE_MISMATCH early-exit hotfix

## Scope

- Branch: `fix/receipt-date-early-mismatch`
- Parent commit: `9cc6960da1ac830ae22c4696b745db53bcaf5cba`
- Version remains `0.10.20`.
- No deploy, production settings change, merge, or change to `develop`/`main` was performed.

## Change

`validateReceiptDate()` now returns the existing `DATE_MISMATCH` result immediately after the primary OpenAI pass only when:

- OpenAI explicitly identifies a successful financial receipt using an approved receipt visual type;
- at least one Yandex result strongly identifies a successful bank receipt;
- both providers independently read the same valid calendar date;
- every dated Yandex pass agrees on that date;
- the agreed date differs from `requiredDate`.

Only this case skips OpenAI `amount-focus` and `date-focus`. Single-provider evidence, provider disagreement, internal Yandex ambiguity, current-date receipts, unknown/work photos, and provider retry/fallback retain the previous full route.

The existing accepted path, amount confirmation, receipt identity, duplicate protection, OCR retry/timeout behavior, media settle, financial calculations, Rocket.Chat routing, and Scanner 2.0 RECORD_ONLY behavior were not changed.

## Files

- `TarsReportApp.js`
- `tests/receipt-date-early-mismatch.runtime.js`
- `tests/scanner2-packaging.test.js` — updated protected source SHA and invokes the new runtime gate
- `docs/codex-reports/tars-0.10.20-date-mismatch-early-exit-hotfix.md`

## Tests

- Scanner 2.0: `21/21 PASS`
- Legacy TARS: `77/77 PASS`
- DATE_MISMATCH runtime scenarios: `PASS`
- Deterministic packaging: `PASS`
- Safe deploy workflow: `PASS`
- Deploy token hygiene: `PASS`
- Node syntax checks: `PASS`
- `git diff --check`: `PASS`
- `build-tars.sh`: `PASS`
- `unzip -t tars-report_0.10.20.zip`: `PASS`
- Bundle policy: `PASS`

The runtime test uses a fake clock and provider-call trace. The early mismatch path calls four unchanged Yandex layouts followed by primary OpenAI, and calls neither `amount-focus` nor `date-focus`. All required non-early cases verify that the old provider route continues.

## Package

- Bundle SHA-256: `888a8a5908010608db4afcbb679c8c9647bbc8a69cdcfc7559ca3e6e9c7859b8`
- ZIP SHA-256: `eed92f716bdb860ba86bf7738eb7415fe47b4c09c4ca05de52bd9058e4e7f460`
- ZIP entries: `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, `icon.png`

## Risk

Regression risk: LOW–MEDIUM.

The early exit is deliberately conservative. Internal Yandex disagreement disables it, and explicit successful receipt evidence is required from both provider groups. The remaining risk is a correlated misread by two providers; this is lower than a single-provider shortcut and does not affect accepted receipts.

## Commit

Commit message: `fix(receipts): short-circuit confirmed date mismatch`

The immutable commit SHA is reported by Codex after Git creates the commit containing this report.

## Next step

Review the branch and its CI/test evidence. Merge or deploy only under a separate explicit instruction.
