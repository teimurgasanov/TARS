# TARS 0.10.26 — Vision authority integration

## Integration

- Integration branch: `integration/vision-high-authority-current-develop`
- Base develop SHA: `6a68d4fc5c8b0d2facb035afc464bdaaaac05a07`
- Reviewed hotfix SHA: `46c17abe3c3ac41049dd50c5e2c4a5c4ed1624cf`
- Merge-base: `6a68d4fc5c8b0d2facb035afc464bdaaaac05a07`
- Version commit: `0c2ed3699dc922fbafde881e82f9ae005aab56ab`
- Conflicts: none; the reviewed hotfix was a direct continuation and was applied by fast-forward.
- Application version: `0.10.26`.

## Effective behavior

- `HIGH WORK_PHOTO` enters the automatic work-photo route when a visible service result is present and no concrete financial/document evidence is present.
- Incidental financial-looking text and broad receipt candidate heuristics do not independently veto `HIGH WORK_PHOTO`.
- Banking/payment UI, receipt layout, financial/QR document, and document layout remain positive safety overrides.
- `HIGH RECEIPT` and `HIGH BANK_TRANSFER` still enter the unchanged date, amount, status, identity, duplicate, index, and running-total pipeline.
- Unknown or non-dominant cases retain the existing manual/dedicated fallback.
- Preview/original reconciliation, MIME handling, owner attribution, rejected-to-control routing, mailing accounting, `PERSONAL_IMAGE_PIPELINE_V2`, and Scanner 2.0 `RECORD_ONLY` remain present.

## Changed files in the integration release

The reviewed hotfix contributes:

- `TarsReportApp.js`
- `tests/fixtures/vision-high-confidence-authority.json`
- `tests/vision-high-confidence-authority.runtime.js`
- `tests/scanner2-packaging.test.js`
- `.github/workflows/scanner2-packaging-ci.yml`
- the 0.10.25 hotfix report

The release integration additionally changes only:

- `app.json`
- `package.json`
- root versions in `package-lock.json`
- version and manifest-integrity assertions in existing tests
- this report

## Verification

- Aleksei close-up men's fade fixture: PASS.
- Hair, nails, pedicure, brows/lashes fixtures: PASS.
- HIGH WORK_PHOTO authority: PASS.
- HIGH WORK_PHOTO dedicated Vision calls: `0`.
- HIGH WORK_PHOTO Yandex/receipt OCR calls: `0`.
- Financial false-positive guards: PASS.
- HIGH RECEIPT financial routing: PASS.
- Unknown/manual fallback: PASS.
- Preview/original and MIME telemetry tests: PASS.
- Owner attribution, running total, and rejected-to-control tests: PASS.
- Scanner/runtime test files: `22/22` PASS.
- Legacy test files: `77/77` PASS.
- Canonical build: PASS.
- ZIP integrity: PASS; exactly five expected files.
- Bundle policy: PASS; unresolved relative imports `0`, unapproved externals `0`.
- Source `TarsReportApp.js` SHA-256: `2523e6a47e76da665529adf3abd4dce0c728744cdf5ee9d2eb24ac531888a2ef`.
- Manifest SHA-256: `49803f5ac92b39645c776607ba8aa83155825c9180c0b5fa1b05530238d8fb42`.
- Bundled `TarsReportApp.js` SHA-256: `13b059ffe7a2876ab75de0d1a3854dfe8a7e8256260b134b8c7740fe5a0a5ce6`.
- ZIP SHA-256: `207e4916489e0569c3c10ac918fcac102675a4a4f2599eb9986b6bef8946cd7f`.

## Risks

Regression risk is `MEDIUM` because primary Vision normalization is central to personal-image routing. The change is constrained to the authority of a positively classified `HIGH WORK_PHOTO`, while positive financial evidence remains fail-closed and every affected legacy boundary is covered by passing tests.

## Next step

Run the packaging CI on this integration branch, review its result, and only then consider a separately authorized fast-forward into `develop`. No deploy or production settings change is part of this stage.
