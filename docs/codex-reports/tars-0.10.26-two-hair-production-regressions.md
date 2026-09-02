# TARS 0.10.26 — two HIGH WORK_PHOTO production regressions

## Scope

This follow-up adds a second mandatory runtime regression case for a close-up women's hair result. It changes tests and fixtures only. Production classification, routing, prompts, receipt validation, Scanner 2.0, and application settings are unchanged.

Regression test commit: `1ef743a0bf29ff2ef3e076b5634774b15e1ccaef`.

## Common root path

Both regression contracts use the same path:

1. `primaryVisionDecisionForImage()` receives one OpenAI primary Vision result.
2. `primaryVisionDecisionFromCandidate()` normalizes the result.
3. `primaryVisionDominantKind()` selects the terminal photo route for a clean `HIGH WORK_PHOTO`.
4. `processPersonalMediaV2()` forwards the image to `Otchet` and publishes the existing accepted-photo confirmation.

Before the authority fix in commit `294d7e6f3e1450313f479f34b3b8510874978ba8`, `primaryVisionDecisionFromCandidate()` included broad indirect signals (`has_financial_text` and `aiCandidateMarksReceipt()`) in `financialBlock`. That could demote a provider-selected `HIGH WORK_PHOTO` before `primaryVisionDominantKind()` evaluated it, forcing the image into a secondary/strict fallback. The current implementation permits a veto only from positive visual financial/document evidence: banking/payment UI, receipt layout, financial document evidence, or document layout.

## Regression contracts

### Case A — men's haircut close-up

- Primary normalized class: `WORK_PHOTO`.
- Service kind: `HAIR`.
- Confidence: `HIGH`.
- Concrete financial/document evidence: absent.
- Incidental `has_financial_text`: present to reproduce the former broad veto.
- Expected final route: work photo.
- Dedicated classifier calls: `0`.
- Yandex/receipt OCR calls: `0`.

### Case B — women's hair close-up

- Primary normalized class: `WORK_PHOTO`.
- Service kind: `HAIR`.
- Confidence: `HIGH`.
- Concrete financial/document evidence: absent.
- Incidental `has_financial_text`: present to reproduce the same former broad veto.
- Expected final route: work photo.
- Dedicated classifier calls: `0`.
- Yandex/receipt OCR calls: `0`.

The fixture models the normalized provider contract required for the regression. Historical raw provider payloads for the two production uploads are not stored in the repository, so their exact historical primary payload and confidence cannot be reconstructed from source code alone.

## Changed files

- `tests/fixtures/vision-high-confidence-authority.json`
- `tests/vision-high-confidence-authority.runtime.js`
- `docs/codex-reports/tars-0.10.26-two-hair-production-regressions.md`

## Verification

- Two-case HIGH WORK_PHOTO runtime regression: PASS.
- Both cases reach `work-photo-forwarded`, `Otchet`, and the existing accepted-photo confirmation: PASS.
- Dedicated secondary classifier calls for both cases: `0`.
- Yandex/receipt OCR calls for both cases: `0`.
- Scanner/runtime tests: `22/22` PASS.
- Legacy tests: `77/77` PASS.
- Canonical package, ZIP integrity, Node syntax, and bundle policy: PASS.
- Production code changed: NO.
- Deploy performed: NO.

## Risk and next step

Regression risk is LOW because the follow-up adds test coverage only. The production fix remains the single system-level change. If exact historical provider output is required, collect the privacy-safe `PERSONAL_IMAGE_PIPELINE_V2` event for a new reproduction; do not infer the old payload from the user-visible rejection message.
