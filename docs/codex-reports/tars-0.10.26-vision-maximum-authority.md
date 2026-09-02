# TARS 0.10.26 — Vision maximum authority

## Root cause

Primary Vision already selected the image class, but `primaryVisionDecisionFromCandidate()` and `primaryVisionDominantKind()` re-derived a `WORK_PHOTO` decision from secondary boolean fields. A clean `HIGH WORK_PHOTO` could therefore lose its terminal route when a secondary service-result/client signal was missing. Earlier broad financial signals could produce the same architectural failure: an already-confident primary type was vetoed before dominant routing.

## Fix

Commit: `b2d7aedb17db1b999409dc7d065a48acf61b7938`.

- A parsed `HIGH WORK_PHOTO` is authoritative when no positive financial/document evidence exists.
- Only banking/payment UI, receipt layout, financial-document evidence, or document layout can override it.
- Missing secondary service-area/result/client confirmation cannot veto the HIGH class.
- MEDIUM, LOW, and UNKNOWN continue through the existing fallback path.
- HIGH receipt/bank-transfer still enters the full financial pipeline; Vision does not accept money, dates, amounts, status, identity, or duplicates.

## Changed files

- `TarsReportApp.js`
- `tests/fixtures/vision-high-confidence-authority.json`
- `tests/vision-high-confidence-authority.runtime.js`
- `tests/scanner2-packaging.test.js`
- `docs/codex-reports/tars-0.10.26-vision-maximum-authority.md`

## Production regressions

- Aleksei men's haircut: `WORK_PHOTO / HAIR / HIGH`, final work-photo route, report publication, accepted-photo confirmation, dedicated calls `0`, Yandex/receipt OCR calls `0` — PASS.
- Dasha women's hair result: `WORK_PHOTO / HAIR / HIGH` with missing secondary service confirmation, final work-photo route, report publication, accepted-photo confirmation, dedicated calls `0`, Yandex/receipt OCR calls `0` — PASS.

## Verification

- Vision authority runtime: PASS.
- Work-photo and financial-negative matrix: PASS.
- Receipt and mailing routes: PASS.
- Preview/original and MIME handling: PASS.
- Owner attribution, running total, and rejected-control: PASS.
- Scanner/runtime tests: `22/22` PASS.
- Legacy tests: `77/77` PASS.
- Canonical build, five-file ZIP, Node syntax, and bundle policy: PASS.
- Version remains `0.10.26`.
- Deploy performed: NO.

## Risk and next step

Regression risk is MEDIUM because this is a central personal-image routing gate. Financial safety remains fail-closed on explicit positive evidence, and all financial, receipt, accounting, duplicate, ownership, and control-route regressions pass. The next safe step is CI review on this feature branch; merge and deploy require separate authorization.
