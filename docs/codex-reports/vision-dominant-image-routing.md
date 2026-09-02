# Vision-dominant personal image routing

## Scope

- Branch: `feature/vision-dominant-image-routing`
- Base develop SHA: `7ce4a5e9900348542c0bbc56db7ce271aaa653ee`
- Implementation commit: `b096fce`
- Application version remains `0.10.24`.
- No merge, deploy, restart, or production setting change was performed.

## What changed

- Reused the existing primary OpenAI Vision pass as the authoritative image-type classifier instead of adding another competing classifier.
- Added normalized primary classes: receipt, bank transfer, work photo, mailing, document, and unknown.
- Added normalized confidence, service kind, and bounded safety flags.
- High-confidence clean work photos enter the existing work-photo pipeline without dedicated Vision voting or receipt OCR.
- High-confidence receipt, bank-transfer, and document classes enter the unchanged legacy financial validation pipeline. Vision does not accept date, amount, status, identity, or duplicates.
- High-confidence mailing enters the existing mailing-proof/accounting path.
- Medium-, low-confidence, malformed, unavailable, and unknown results retain the existing dedicated work-photo/OCR/manual fallback behavior.
- Manual selection is retained as the fallback for inconclusive primary Vision, rather than being mandatory for every image.
- Original uploads are preferred over thumbnails; preview is used only after the existing bounded resolver fallback.
- Vision data-URL MIME is derived from magic bytes for JPEG, PNG, WebP, HEIC, and HEIF before falling back to the declared MIME.
- Extended `PERSONAL_IMAGE_PIPELINE_V2` with enum-only fields: `vision_class`, `vision_confidence`, `vision_service_kind`, `vision_safety_override`, `vision_source_original_or_preview`, `fallback_required`, and `final_route`.

## Financial safety preserved

- Payment UI, receipt layout, financial text, document layout, banking evidence, and existing receipt evidence override a conflicting work-photo label.
- Receipt date, amount, operation status, identity, exact/visual/identity duplicate checks, accepted index, owner attribution, running total, and rejected-to-control behavior remain in the legacy receipt pipeline.
- No early ACCEPT was added.
- Scanner 2.0 runtime decision functions remain absent from `TarsReportApp.js`; RECORD_ONLY remains observational.

## Files changed

- `TarsReportApp.js`
- `tests/vision-dominant-image-routing.runtime.js`
- Existing routing, telemetry, primary-reuse, manual-fallback, and packaging regression tests updated to assert the new architecture rather than stale source shapes.

## Verification

- Vision routing runtime cases A-P: PASS.
- High work photo bypasses receipt OCR/dedicated classifier: PASS.
- High receipt/bank transfer enters legacy financial validation: PASS.
- Unknown/medium/low uses fallback: PASS.
- Original/preview reconciliation and MIME magic-byte cases: PASS.
- Work-photo, receipt, mailing, owner, running-total, rejected-control, early date-mismatch, and telemetry privacy regressions: PASS.
- Scanner/runtime suite: 22/22 PASS.
- Legacy suite: 77/77 PASS.
- Canonical packaging test: PASS.
- `build-tars.sh`: PASS.
- ZIP integrity: PASS; exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, `icon.png`.
- Bundle policy: PASS; unresolved relative requires 0, invalid externals 0.
- Bundle SHA-256: `4d519f059f04f8ad6b03d313899af32a1b57bd3966502153bb85b1cc9de10690`.
- `git diff --check`: PASS.

## Risks

- Regression risk: MEDIUM. High-confidence Vision now selects the pipeline automatically, so provider calibration directly affects routing.
- Safety mitigation: financial/document flags always prevent work-photo routing; non-high responses retain the conservative fallback/manual path.
- HEIC/HEIF are now labeled with their detected MIME. Provider-side format support should be observed in diagnostics; a provider rejection remains fail-closed and reaches fallback.
- The regression fixtures validate normalized provider outcomes rather than containing customer images. A privacy-approved, anonymized visual evaluation corpus remains useful before production rollout.

## Recommended next step

Run Packaging CI for this feature branch, review the prompt/normalized contract and runtime fixtures, then prepare a separate patch-version release candidate. Do not merge or deploy until that review is complete.
