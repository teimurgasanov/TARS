# TARS 0.10.21 Receipt Primary Reuse and Processing Status

## Scope

- Parent commit: `8110315572025cf4200366dc6369528366b36793`.
- Branch: `perf/receipt-primary-reuse-status`.
- Application version remains `0.10.21`.
- Deploy performed: **NO**.
- Production settings changed: **NO**.

This hotfix removes one redundant primary OpenAI receipt analysis when the
personal-image classifier has already produced valid structured receipt
evidence for the exact same canonical upload and bytes. It also gives the
master immediate feedback with one temporary `⏳ Чек проверяется…` message.
Receipt acceptance, rejection, accounting, duplicate, provider retry, and
Scanner 2.0 decision behavior are unchanged.

## Implementation

### Upload-bound primary OpenAI reuse

- The initial personal-image primary result is retained for at most ten
  minutes under a key containing the canonical upload ID, exact image hash,
  required receipt date, and primary model.
- Reuse requires the same key, provider group `openai`, pass type `primary`,
  and structured evidence that actually marks the image as a receipt.
- A negative or inconclusive classification is not reused for financial
  validation; the legacy primary request still runs in that case.
- Evidence is consumed once per validation context. A retry after an
  inconclusive validation therefore preserves the existing provider retry
  semantics.
- `amount-focus` remains mandatory on the accepted path. Existing conditions
  for `date-focus`, early `DATE_MISMATCH`, status, identity, and duplicate
  checks are unchanged.

### Idempotent processing status

- The status is created only after the media-v2 route has positively selected
  the receipt path and the post-message claim winner is known.
- A dedicated `receipt-processing-status-v1:<anonymous-token>` association and
  an in-process promise gate prevent preview/original and concurrent event
  duplicates.
- Status persistence is separate from the accepted/rejected receipt index and
  cannot affect totals.
- After the existing final ACCEPT/REJECT/duplicate publication, the temporary
  status is removed. Stale status cleanup is bounded and does not publish a
  second status when cleanup is uncertain.
- Publication, persistence, or cleanup failures are fail-open for the legacy
  receipt path.
- Work photos and ordinary unknown images do not publish the receipt status.

### Privacy-safe instrumentation

`RECEIPT_STAGE` logs use only a short SHA-256-derived case token, stage name,
elapsed milliseconds, and a bounded outcome. Stages cover media resolution,
status publication, primary reuse/request, Yandex validation, amount/date
focus, strict validation, identity/duplicate checks, final publication, and
running-total publication. No image, OCR/Vision response, name, room/user ID,
secret, or provider payload is logged by the new instrumentation.

## Changed files

- `TarsReportApp.js` — upload-bound primary evidence, processing-status
  lifecycle, and stage timing.
- `tests/receipt-primary-reuse-status.runtime.js` — provider call-order,
  upload binding, fallback, status race/idempotency, and failure-isolation
  coverage.
- `tests/scanner2-personal-rejected-control-runtime.test.js` — ACCEPT/REJECT,
  unknown-image, repeat-event, status cleanup, early mismatch, control route,
  and running-total assertions.
- `tests/scanner2-packaging.test.js` — runtime gate and protected source hash.
- `tests/scanner2-runtime-record-only.test.js` — cache behavior assertion made
  compatible with timing instrumentation.
- `tests/automatic-receipt-unified-pipeline.test.js`,
  `tests/clean-vision-classifier.test.js`,
  `tests/quoted-image-duplicate-routing.test.js`, and
  `tests/receipt-ocr-inconclusive-retry.test.js` — existing architectural
  assertions updated for the explicit context/status dependencies.
- `.github/workflows/scanner2-packaging-ci.yml` — packaging CI trigger for the
  isolated performance branch only.
- This report.

## Verification

- Scanner/runtime tests: **22/22 PASS**.
- Legacy TARS tests: **77/77 PASS**.
- Primary reuse runtime: **PASS**.
- Same-upload second primary call removed: **PASS**.
- Missing or mismatched evidence legacy fallback: **PASS**.
- Processing status concurrency/idempotency and fail-open behavior: **PASS**.
- Accepted receipt index and running total `1 / 1200 RUB`: **PASS**.
- Rejected receipt to `cheki-kontrol`: **PASS**.
- Early `DATE_MISMATCH`: **PASS**.
- Scanner 2.0 decision runtime remains unused: **PASS**.
- Packaging, safe-deploy, and deploy credential hygiene tests: **PASS**.
- Node syntax, workflow YAML, `git diff --check`: **PASS**.
- Canonical `./build-tars.sh`: **PASS**.
- `unzip -t tars-report_0.10.21.zip`: **PASS**.
- Bundle policy: **PASS**, unresolved relative imports `0`, unapproved
  externals `0`.
- ZIP contents: exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`,
  and `icon.png`.

## Hashes

- Tracked `TarsReportApp.js` SHA-256:
  `1297f47189532ad68a9e4afae01ee838010605d74ad9e1980f08099b36b6ae3d`.
- Bundled `TarsReportApp.js` SHA-256:
  `2177c1ce5ae0514e9803945783207dab89e7b411a354c30fd378d968f556df62`.
- Canonical ZIP SHA-256:
  `16bc574b5917ed4dd5a8f3805c4c709604b8e6a621662e20ff501bda1c30780e`.

## Risk and expected improvement

Regression risk: **MEDIUM** because the change touches the central personal
receipt route and adds a temporary Rocket.Chat message lifecycle. The provider
reuse is guarded by upload ID plus exact bytes and retains the complete legacy
fallback. Status failures cannot escape into receipt processing, and the full
legacy suite protects accounting, duplicates, photos, control routing, and
reports.

For a positively classified receipt, one complete primary OpenAI round trip is
removed. The practical improvement equals that provider call's latency—usually
several seconds and bounded by the existing 14-second request timeout per
attempt. Media settle, Yandex serialization, amount/date focus, retries, and
all safety checks remain unchanged, so no fixed end-to-end latency is claimed.

## Next step

Review the branch and Packaging CI result. Do not merge, deploy, change
production settings, or increase parallelism without separate authorization.
