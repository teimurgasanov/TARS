# TARS 0.10.30 — preselected photo financial-veto hotfix

## Root cause

The pre-upload `PHOTO` selection was not authoritative. After the user chose
`PHOTO`, `executePostMessageSent()` required an exact `HIGH WORK_PHOTO` Vision
route. Even after that check, `processPersonalMediaV2()` invoked the older
strict work-photo path again. A parsed `UNKNOWN`, `MEDIUM`, or `LOW` response
with no financial evidence could therefore reject a real work photo.

## Fix

- The explicit `PHOTO` route now treats the already obtained primary Vision
  result as a positive financial/document safety veto.
- Receipt, banking, document, payment-screen, and mailing evidence still block
  the photo route.
- A parsed result without those blockers may use the existing photo pipeline.
- Provider/parser failure remains fail-closed.
- The upload-bound primary Vision decision is passed into the downstream
  safety-only path, preventing a second classifier veto.
- Receipt OCR and Yandex calls remain zero for the selected safe-photo path.
- Receipt and mailing selections still require their exact confident Vision
  routes.

## Changed files

- `.github/workflows/scanner2-packaging-ci.yml`
- `TarsReportApp.js`
- `app.json`
- `package.json`
- `package-lock.json`
- `tests/automatic-receipt-unified-pipeline.test.js`
- `tests/preselected-image-type-routing.runtime.js`
- `tests/scanner2-packaging.test.js`
- `tests/scanner2-runtime-record-only.test.js`
- `tests/vision-dominant-image-routing.runtime.js`

Implementation commit: `0895b14848283b7ecadde22472ce1d3c614050a1`.

## Verification

- Selected HIGH work photo: PASS.
- Selected parsed UNKNOWN with no financial/document evidence: PASS.
- Positive financial evidence blocks `PHOTO`: PASS.
- Primary Vision calls: 1; receipt OCR/Yandex calls on selected photo: 0.
- Scanner/runtime tests: 22/22 PASS.
- Legacy tests: 77/77 PASS.
- Manual selection, preview/original, telemetry/privacy, work-photo routing,
  safe deploy, and deploy-token hygiene checks: PASS.
- `git diff --check`: PASS.
- Node and zsh syntax: PASS.
- Canonical build and ZIP integrity: PASS.
- Bundle policy: PASS.

## Package

- Version: `0.10.30`.
- Bundle SHA-256: `833cf5d20bc3dc8b2ad98e8dfe7f27735a121a4744ea8052066707ba98bc34b7`.
- ZIP SHA-256 (diagnostic): `29a6ba6fcfff23542209f44053924a5b4c2364fc8ff2f1c865afe326f57b629d`.
- ZIP contents: `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, `icon.png`.

## Risk

Regression risk is **MEDIUM** because the change affects live personal-image
routing. The scope is narrow: only the explicit `PHOTO` selection is relaxed,
and only after a successfully parsed Vision response with no positive
financial/document/mailing evidence. Financial routes and accounting logic are
unchanged.

## Next step

Validate the branch in Packaging CI, fast-forward the reviewed commit into
`develop`, run the validation-only workflow, and then perform one guarded manual
deployment. Production settings must remain unchanged.
