# TARS 0.10.21 Personal Rejected Receipt Control Hotfix

## Release context

- Version: `0.10.21`
- Parent commit: `9cc6960da1ac830ae22c4696b745db53bcaf5cba`
- Branch: `fix/personal-rejected-receipt-control-route`
- Commit message: `fix(receipts): route personal rejected receipts to control`
- Deploy performed: **NO**
- Production settings changed: **NO**

## ROOT CAUSE STATUS

`PROVEN_BY_CODE / NOT_PROVEN_IN_PRODUCTION`

The code-level routing gap is proven. For an uncaptioned image in a personal
room, the initial classifier can return `unknown` or `photo`. The strict
fallback can then identify a financial document while rejecting it under the
existing legacy rules (for example, because its date differs from the required
date). Before this hotfix, `protectedRoomForPersonalFile()` returned
`undefined` for every `ok: false` result. `rejectDuplicateMessage()` therefore
continued before entering the existing receipt rejection path.

The exact production event for Sergey was not confirmed from Rocket.Chat app
logs because the available read-only browser session required authentication.

## FIX

- `validateReceiptDate()` now returns an internal
  `financialDocumentConfirmed` signal derived from already available provider
  candidates. It does not change the legacy decision, date, amount, status, or
  confidence rules.
- OpenAI evidence confirms a financial document only when its structured
  response explicitly contains `is_receipt: true`.
- Yandex evidence confirms a financial document only through the existing
  `looksLikeBankReceiptText()` rule.
- Synthetic combined candidates are excluded from this routing signal so JSON
  field names cannot turn an explicit `is_receipt: false` into a receipt.
- A confirmed financial document now returns the existing `kassa` route even
  when its legacy result is rejected.
- The already completed strict result is carried as
  `prevalidatedReceiptCheck` into `rejectDuplicateMessage()`. The existing
  rejected handler writes the rejected receipt index, publishes through
  `publishRejectedReceiptReview()`, notifies the uploader, and applies the
  existing source-message policy.
- The same prevalidated result is reused for accepted fallback receipts. No
  additional Yandex/OpenAI/OCR pass is introduced.
- No second rejection pipeline was created.

## Changed files

- `TarsReportApp.js` — minimal fallback routing and prevalidated result reuse.
- `tests/scanner2-personal-rejected-control-runtime.test.js` — behavioral
  coverage for rejected, unknown, accepted, and repeated-event scenarios.
- `tests/scanner2-packaging.test.js` — updated protected source/manifest hashes
  and added the new runtime gate.
- `tests/scanner2-runtime-record-only.test.js` — release version assertion.
- `tests/scanner2-safe-deploy-workflow.test.js` — Scanner/runtime test count.
- `.github/workflows/scanner2-packaging-ci.yml` — hotfix branch trigger and test
  count.
- `.github/workflows/deploy-rocketchat.yml` — validation test count only; deploy
  guards are unchanged.
- `app.json`, `package.json`, `package-lock.json` — version `0.10.21`.
- This report.

## Behavioral tests

The new runtime test executes the real tracked receipt pipeline with Rocket.Chat
accessors and providers mocked only at their external boundaries.

1. Personal `unknown/photo` → strict financial receipt → invalid date:
   - one `source: rejected` receipt-index entry;
   - exactly one review upload to `cheki-kontrol`;
   - zero accepted entries;
   - running total remains `0 / 0 RUB`;
   - provider calls are not repeated after strict validation.
2. Ordinary unknown non-receipt:
   - zero control publications;
   - zero rejected receipt-index entries.
3. Valid receipt through the same fallback:
   - normal confirmed entry;
   - running total `1 / 1200 RUB`;
   - zero control publications.
4. Repeated event for the same rejected receipt:
   - one logical rejected entry;
   - no more than one control publication;
   - no repeated provider calls.

## Test results

- Scanner/runtime tests: **22/22 PASS**.
- Legacy TARS tests: **77/77 PASS**.
- Personal rejected-control runtime test: **PASS**.
- Existing 1200 RUB running-total runtime test: **PASS**.
- Canonical `receiptOcrConfig()` runtime smoke: **PASS**.
- Packaging test: **PASS**.
- Safe-deploy and credential-hygiene tests: **PASS**.
- Node syntax checks: **PASS**.
- `git diff --check`: **PASS**.
- `./build-tars.sh`: **PASS**.
- `unzip -t tars-report_0.10.21.zip`: **PASS**.
- ZIP contents: exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`,
  `icon.png`.

## Scanner 2.0

- Scanner 2.0 related: **NO**.
- `RECORD_ONLY` remains observational.
- Scanner 2.0 decision-engine runtime calls remain absent.
- Shadow defaults and sampling/retention logic are unchanged.

## Affected scope

Only personal-room images whose primary routing is inconclusive but whose
already completed strict validation confirms a financial document. Accepted
receipts, explicit receipt intent, document routing, duplicate detection,
financial calculations, reports, photos, and other Rocket.Chat routes are not
changed.

## Repair-path follow-up

`repairTodayReceiptIndex()` has a related gap: a failed validation can mark an
existing entry rejected without publishing it to control. Safely changing that
path requires an explicit durable publication marker to prevent repeated repair
runs from producing duplicate control messages. It is intentionally excluded
from this minimal hotfix because adding that idempotency state would be a
separate architecture change.

## Risk

Regression risk: **MEDIUM**.

The production change is narrow, but it sits in the receipt/photo classification
boundary. The new negative control test prevents ordinary unknown images from
being routed to control, while the accepted-path and duplicate/idempotency tests
protect existing receipt behavior.

## Package hashes

- Bundled `TarsReportApp.js` SHA-256:
  `12070919807b6a650318b5ff2cdd15637784f0d84543d9db9ea40fe5077a820f`
- `tars-report_0.10.21.zip` SHA-256:
  `9b8f8d4d3d4ef48be9010cfe9e25b568cdea9db6888a70cce8e90e3aa85dbaf2`
