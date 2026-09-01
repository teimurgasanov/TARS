# Manual image type selection

Date: 2026-09-02

Branch: `feature/manual-image-type-selection`

Base: `origin/develop` / TARS `0.10.23`

Implementation commit: `656f352`

## What changed

- Every settled image in a TARS personal room now stops at one compact prompt: `What did you send?` with Receipt, Work photo, and Mailing choices.
- The choice is stored against the canonical post-message claim key, so original/preview variants share one selection and one pipeline.
- A persisted pending/processing/completed state and the existing post-message claim protect against repeated clicks, competing buttons, and duplicate post-message events.
- Receipt selection calls the existing full receipt pipeline without changing date, amount, payment status, identity, duplicate, accepted/rejected index, control-room, owner, or running-total rules.
- Work-photo selection does not call Yandex or receipt OCR. It runs the existing primary and dedicated OpenAI financial/document safety guards. Parsed clean results allow the user-selected photo route; financial/document evidence or provider/parser uncertainty fails closed.
- Mailing selection calls the existing mailing-proof detector and daily accounting only; receipt and work-photo pipelines are not entered.
- The selection prompt and temporary processing status are removed after a final outcome.
- Automatic classifiers remain in the codebase and are reused as safety evidence, but no longer choose the final personal-image route before the user selects a type.

## Files changed

- `TarsReportApp.js`
- `tests/manual-image-type-selection.runtime.js`
- `tests/automatic-mailing-accounting.test.js`
- `tests/dedicated-work-photo-forwarder.test.js`
- `tests/no-upload-buttons-auto-classification.test.js`
- `tests/scanner2-packaging.test.js`

No manifest or version file changed; the version remains `0.10.23`.

## Verification

- Manual-selection runtime scenarios: PASS, including work photo, receipt, mailing, financial-as-photo block, non-financial-as-receipt reject, preview/original reconciliation, double click, and completed-choice lock.
- Manual work-photo safety: PASS; no Yandex/receipt OCR request and fail-closed provider behavior verified.
- Scanner/runtime tests: `22/22` PASS.
- Legacy tests: `77/77` PASS.
- Personal-room owner attribution test: PASS.
- Rejected receipt to control runtime test: PASS.
- Receipt running-total runtime test: PASS.
- Safe-deploy workflow test: PASS.
- Deploy-token hygiene test: PASS.
- `git diff --check`: PASS.
- Node syntax checks: PASS.
- Canonical build: PASS.
- ZIP integrity and five-file contents: PASS.
- Bundle policy: PASS; no unresolved relative imports or unapproved externals.
- Source SHA-256: `e60e4b2206c44e19b7c8e28e2e073900553ae6ccba27c01e20382117184ac1f5`.

## Risks

- Regression risk is **MEDIUM** because the change intentionally replaces automatic personal-image routing with an interactive state transition.
- A Rocket.Chat persistence outage can prevent creation or completion of the selection state; the implementation fails closed and does not start a financial/photo/mailing pipeline implicitly.
- Cross-process prompt creation relies on persisted state plus the local serialization queue; the processing claim remains the authoritative guard preventing duplicate pipeline effects.
- A work photo is blocked when either safety provider/parser is unavailable. This favors financial safety over automatic acceptance.
- Existing legacy future-upload actions remain compatible but are bypassed by the new per-image prompt.

## Suggested next step

Review the branch and test the compact prompt in a non-production Rocket.Chat environment. If approved, integrate it into `develop` through a separate reviewed command, validate the develop push without deployment, then prepare a versioned release and manual deploy separately.

No merge or deployment was performed.
