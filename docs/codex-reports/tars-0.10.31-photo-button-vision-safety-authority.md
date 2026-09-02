# TARS 0.10.31 — PHOTO button Vision safety authority

## Outcome

For a personal-room upload made after the user selects `PHOTO`, Primary Vision
is now the only type-safety authority. Legacy filename/text heuristics and the
receipt fallback can no longer override that selected route.

## Root cause

Two legacy paths remained active after the 0.10.30 fix:

1. `directFileIntent()` and `blocksPersonalPhotoForwardingText()` could reject
   the selected photo from incidental message or filename text before Vision.
2. If photo forwarding returned false, `processPersonalMediaV2()` fell through
   into the receipt pipeline and could start OCR/Yandex for a selected photo.

## Fix

- Explicit `PHOTO` plus `manualPhotoSafetyOnly` bypasses legacy text and
  filename classifiers.
- The upload-bound Primary Vision result remains mandatory and parsed.
- Positive banking, payment UI, receipt layout, financial document, document
  layout, receipt/bank/document/mailing class evidence still blocks the photo.
- A selected photo never falls through into receipt OCR if forwarding cannot
  complete.
- Receipt and mailing paths are unchanged.

Implementation commit: `60cf473334eccb9382ff41fd6208e212f563b3da`.

## Changed files

- `.github/workflows/scanner2-packaging-ci.yml`
- `TarsReportApp.js`
- `app.json`
- `package.json`
- `package-lock.json`
- `tests/preselected-image-type-routing.runtime.js`
- `tests/scanner2-packaging.test.js`
- `tests/scanner2-runtime-record-only.test.js`

## Tests

- Selected safe photo with receipt-like filename/message text: PASS.
- Selected parsed UNKNOWN without financial/document evidence: PASS.
- Positive financial evidence blocks photo routing: PASS.
- Missing report publisher does not fall through to receipt OCR: PASS.
- Primary Vision calls: 1.
- Receipt OCR/Yandex calls for selected photo: 0.
- Scanner/runtime: 22/22 PASS.
- Legacy: 77/77 PASS.
- Vision authority, manual selection, safe deploy, token hygiene: PASS.
- Syntax, `git diff --check`, canonical build, ZIP integrity, bundle policy:
  PASS.

## Package

- Version: `0.10.31`.
- Bundle SHA-256: `18177b685faf75dc7d3daa86db94e337884047c74ebe612d67e0458a5cb0886f`.
- ZIP SHA-256 (diagnostic): `01e0c514a489374714ca69d6b80b3338dd69b636f6ce402d8869dfe0a42d2045`.
- ZIP contents: `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`,
  `icon.png`.

## Risk

Regression risk: **MEDIUM**. The change affects the live selected-photo path,
but financial safety remains fail-closed and is covered by a positive banking
fixture. Receipt accounting, duplicate handling, owner attribution, reports,
and Scanner 2.0 decision logic are unchanged.

## Next step

Run Packaging CI, fast-forward the reviewed branch into `develop`, confirm the
validation-only workflow skips deployment, and perform one guarded manual
deployment. Keep production settings unchanged.
