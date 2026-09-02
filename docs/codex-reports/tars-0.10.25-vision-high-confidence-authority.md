# TARS 0.10.25 — HIGH WORK_PHOTO authority hotfix

## Scope

- Branch: `fix/vision-high-confidence-authority`
- Base develop commit: `6a68d4fc5c8b0d2facb035afc464bdaaaac05a07`
- Implementation commit: `294d7e6f3e1450313f479f34b3b8510874978ba8`
- Application version remains `0.10.25`.
- No deploy, merge, settings update, or production data change was performed.

## Root cause

`primaryVisionDecisionFromCandidate()` in TARS 0.10.25 built `financialBlock` from both concrete visual evidence and broad indirect signals. In particular, `has_financial_text` and `aiCandidateMarksReceipt()` could veto a `HIGH WORK_PHOTO`; the latter may be true merely because the provider extracted a date or amount. The decision was then demoted to `document` or `receipt` before `primaryVisionDominantKind()` evaluated it.

The exact rejection shown to the user is produced by the manual image-selection handler after `fastForwardPersonalReportPhotos()` / `shouldForwardConfirmedWorkPhoto()` returns a blocked result. Thus the code path that allowed a confident work-photo result to reach that rejection is proven. The raw provider response for the production image at approximately 11:11 was not present in the local repository, so the exact individual provider flag for that one image is not asserted here.

## Fix

- A `HIGH WORK_PHOTO` is overridden only by concrete visible evidence:
  - banking/payment UI;
  - receipt layout;
  - financial or QR payment document;
  - document layout;
  - a financial visual type such as a bank-app screen or receipt on a phone.
- Incidental text, a logo, or date/amount-like text no longer forms the authoritative work-photo veto.
- The primary Vision contract now explicitly distinguishes financial text from financial/document layout and states that salon furniture or interior is not required.
- Hair still requires a visible client and visible service result. Nails, pedicure, brows, and lashes use the visible result itself and do not require a full client or service-area furniture.
- `HIGH RECEIPT` and `HIGH BANK_TRANSFER` still enter the unchanged legacy financial pipeline; Vision does not accept money.
- Medium/low/unknown results retain the existing dedicated/manual/receipt fallbacks.

## Changed files

- `TarsReportApp.js`
- `tests/fixtures/vision-high-confidence-authority.json`
- `tests/vision-high-confidence-authority.runtime.js`
- `tests/scanner2-packaging.test.js`
- this report

## Verification

- Aleksei close-up men's fade fixture: PASS.
- Aleksei runtime route to `Otchet` and existing `Фото работы принято` confirmation: PASS.
- HIGH WORK_PHOTO dedicated-classifier calls: `0`.
- HIGH WORK_PHOTO Yandex/receipt OCR calls: `0`.
- Female hair, manicure, pedicure, brows/lashes: PASS.
- Bank screen with person, receipt on phone, paper receipt, financial document with person, QR payment document: all blocked from work-photo routing.
- Ordinary portrait: remains fallback/unknown.
- Vision-dominant, manual-selection, MIME, owner, running-total, and rejected-control focused tests: PASS.
- Scanner/runtime test files: `22/22` PASS.
- Legacy test files: `77/77` PASS.
- Canonical build: PASS.
- ZIP integrity: PASS; exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, `icon.png`.
- Bundle policy: PASS; unresolved relative imports `0`, unapproved externals `0`.
- Tracked source SHA-256: `2523e6a47e76da665529adf3abd4dce0c728744cdf5ee9d2eb24ac531888a2ef`.
- Bundled `TarsReportApp.js` SHA-256: `13b059ffe7a2876ab75de0d1a3854dfe8a7e8256260b134b8c7740fe5a0a5ce6`.
- ZIP SHA-256: `703790357b403c9ba5d16f053b6dedcfc4e927dab1136bd9068281ff773b08b6`.

## Regression risk

`MEDIUM`. The patch changes the central primary-Vision normalization, but only narrows the override of a positively classified work photo. Concrete financial/document evidence remains fail-closed, and receipt acceptance, validation, identity, duplicates, indexing, totals, owner attribution, rejected-control routing, mailing, Scanner 2.0 RECORD_ONLY, MIME, and preview/original behavior are unchanged and covered by the passing suites.

## Recommended next step

Run branch CI if its workflow trigger is enabled, review the structured fixtures and normalization diff, and only then integrate through the normal reviewed develop workflow. Do not deploy directly from this branch.
