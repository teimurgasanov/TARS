# Stage 3B-2 — Minimal RECORD_ONLY runtime integration

Date: 2026-09-01

Branch: `feature/scanner-2.0`

Parent commit: `0b6de5b25b4e65694cffe3f495118b1edd973a1f`

Implementation commit: `feat(scanner2): add fail-open record-only runtime capture` (the SHA is reported by Git after this report is committed)

## What changed

- `validateReceiptDate()` now copies structured observations from the Yandex and OpenAI passes that legacy TARS already executes. The additional `shadowEvidence` sidecar does not alter any existing legacy result field.
- `validateReceiptStrict()` keeps caching the complete validation promise, so a cache hit returns the same sidecar without an extra provider request.
- `rejectDuplicateMessage()` records only post-message receipt outcomes and only after the corresponding legacy action has completed.
- A small Rocket.Chat persistence adapter implements the Stage 3A `upsert(record, merge)` interface in a separate association namespace.
- Three private app settings were added. The recorder remains `OFF` unless the exact `RECORD_ONLY` value and a valid HMAC secret are both present.
- The deterministic packaging test and packaging-only CI policy were updated for the intentional runtime recorder call while continuing to forbid Scanner 2.0 decision-engine calls.

## Files changed

- `TarsReportApp.js`
- `en.json`
- `ru.json`
- `tests/scanner2-runtime-record-only.test.js`
- `tests/scanner2-packaging.test.js`
- `.github/workflows/scanner2-packaging-ci.yml`
- `docs/codex-reports/stage-3b2-runtime-record-only.md`

Unchanged protected files:

- `app.json` SHA-256: `8c93b34e8339027896c94872af55f656511c0b338d813bde2c25a0cddfeca963`
- `build-tars.sh`
- all `scanner2/shadow-*` Stage 3A modules
- deploy workflow

Final tracked production source SHA-256:

- `TarsReportApp.js`: `1db768134ac846cb9cd909c10abbc3aa7867c399bbff9fd7c830ffa8770aa9f6`

## Settings

- `scanner2_shadow_mode`: string, default `OFF`; only exact normalized `RECORD_ONLY` enables capture.
- `scanner2_shadow_hmac_secret`: private password setting; an absent or invalid secret keeps capture off.
- `scanner2_shadow_token_key_version`: string, default `k1`.

No app permissions were added or changed. This stage does not enable `RECORD_ONLY` on any deployed installation.

## Persistence and privacy

- Association namespace: `scanner2-shadow:v1:<anonymous-case-token>`.
- The production receipt index `receipt-duplicate-index-v1` is not used by the recorder.
- Case ID, strong document/transaction identity, exact hash, visual hash, and duplicate reference are HMAC-tokenized with the existing domain-separated tokenizer.
- The deterministic Stage 3A date shift runs inside `safeShadowRecord()` before persistence.
- Raw OCR text, provider payloads/responses, message/user/room/upload IDs, file metadata, bank names, cards, phones, accounts, and real transaction/document identifiers are absent from the snapshot schema.
- Weak `text:` receipt identities are never persisted as strong identity evidence.
- `validateShadowSnapshot()` is an explicit privacy gate before the recorder call; the recorder validates again after date shifting.

## Capture points

All capture calls are limited to `rejectDuplicateMessage()`:

1. Validation rejection: after the legacy receipt index write, message deletion/control handling, and user notification; stored as `REVIEW` with a mapped structured reason.
2. Identity duplicate: after the legacy duplicate index write, review publication where applicable, deletion, and user notification; stored as `REJECT / DUPLICATE_IDENTITY`.
3. Accepted receipt: queued in memory while processing, then recorded only after accepted receipt publication, receipt-index writes, and master transfer summary refreshes; stored as `ACCEPT / LEGACY_ACCEPTED`.

The pre-upload guard, exact duplicate pre-upload path, photo path, financial calculations, confirmed transfer calculations, reports, deletion rules, and notifications were not changed.

## Failure isolation

- Snapshot construction, tokenization, privacy validation, persistence reads/writes, timeouts, and circuit-breaker outcomes are contained by a fail-open boundary.
- Writes are bounded to 50 ms and have no retry.
- Missing settings, invalid settings, invalid sidecars, or unavailable persistence produce no shadow write and cannot change the legacy return value.
- No Yandex/OpenAI calls were added.
- No runtime calls exist to `evaluateRules`, `resolveConflicts`, `makeDecision`, `runOfflineComparison`, or `runOfflineDataset`.

## Verification

- Scanner 2.0 tests: `16/16` passed, including the new A–J runtime integration coverage.
- Legacy TARS tests: `77/77` passed.
- `git diff --check`: passed.
- Node syntax checks: passed.
- `zsh -n build-tars.sh`: passed.
- Canonical `./build-tars.sh`: passed.
- `unzip -t tars-report_0.10.17.zip`: passed; exactly five expected files.
- Bundle policy: passed; unresolved relative imports `0`, unapproved externals `0`.
- Bundled `TarsReportApp.js` SHA-256: `4e76b87a28b12e7efde09bf3e67e62164947acda3b0b3b7955c4991845fef2db`.
- Local ZIP SHA-256: `16b84cbe0acd8d6789ec7c0f340064dedd9d97b7796b6fd34ce1e5afc730e5fd` (ZIP timestamps are not a reproducibility contract).
- Remote Scanner 2.0 Packaging CI: pending the implementation push.

## Impact and remaining risks

- Receipts/OCR: legacy candidates and decisions are unchanged; sanitized copies add a small amount of CPU and memory.
- Duplicates: only post-message identity-duplicate outcomes are observed; existing duplicate decisions and index writes remain authoritative.
- Rocket.Chat: a separate persistence association is used only when explicitly enabled. The added write can add at most the configured 50 ms bound after legacy processing.
- Reports/calculations/photos: no code paths or data structures were changed.
- A process crash after the legacy action but before the shadow write can omit a case. This is intentional: shadow completeness is less important than legacy safety.
- Stage 3B-2 intentionally does not cover exact pre-upload duplicates or every historical/prevalidated receipt path, so the dataset is incomplete by design.
- Association upserts are idempotent by anonymous case ID, but concurrent RECORD_ONLY calls can still perform redundant safe writes; they cannot affect money or the production receipt index.

## Recommended next step

Keep production mode `OFF`. After successful packaging CI and code review, prepare a separate rollout stage that enables `RECORD_ONLY` for a small controlled sample, measures persistence size/latency, and verifies snapshots before any 100% rollout. Scanner 2.0 runtime decisions must remain disabled.
