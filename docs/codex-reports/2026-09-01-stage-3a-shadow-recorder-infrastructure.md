# Stage 3A — Shadow Recorder Infrastructure

Date: 2026-09-01
Branch: `feature/scanner-2.0`
Implementation commit: `fadd7cdfcf18154f378c4562ddb55c418a4ed492`

## What changed

Stage 3A added an isolated, offline privacy-safe shadow recorder infrastructure for Scanner 2.0. It is not connected to the TARS 0.10.17 production pipeline.

The implementation provides:

- a strict whitelist contract for redacted shadow snapshots;
- recursive rejection of unknown, identifying, raw-provider, URL, image and file-path fields;
- an 8 KB snapshot limit and a maximum of eight observations;
- domain-separated HMAC-SHA-256 tokenization for cases, document and transaction identifiers, exact and visual hashes, duplicate references and composite transactions;
- token key versioning without persistence of the secret, source value or HMAC input;
- deterministic per-case date shifting that preserves relative date relationships without storing the offset;
- a fail-open `safeShadowRecord()` boundary that never throws into its caller;
- bounded writes without retries;
- an injectable circuit-breaker model;
- DRAFT/FINAL lifecycle and idempotent merge rules, with FINAL taking priority over DRAFT;
- mock-only persistence injection. No Rocket.Chat persistence adapter was connected.

## Files changed

Production files were not modified. Seven isolated files were added:

- `scanner2/shadow-contract.js`
- `scanner2/shadow-tokenizer.js`
- `scanner2/shadow-recorder.js`
- `tests/scanner2-shadow-contract.test.js`
- `tests/scanner2-shadow-tokenizer.test.js`
- `tests/scanner2-shadow-recorder.test.js`
- `tests/scanner2-shadow-privacy.test.js`

Protected production SHA-256 values remained unchanged:

- `TarsReportApp.js`: `d75cb06873fce73330b24e108ac7d96bc367eadb2723c43ccd376ac95beaba9e`
- `app.json`: `8c93b34e8339027896c94872af55f656511c0b338d813bde2c25a0cddfeca963`
- `build-tars.sh`: `c341585ce55d74c2b5dc0fcf6eae0a007bd566c40e90222f4599e6d4447522a5`

## Test results

- Stage 3A test files: 4/4 passed.
- All Scanner 2.0 test files: 14/14 passed.
- Existing legacy TARS test files: 77/77 passed.
- JavaScript syntax checks for all three new modules: passed.
- Dependency-boundary check: passed. The shadow modules import only local Scanner 2.0 contracts and Node.js `crypto`.
- `git diff --check`: passed.
- Local and remote feature-branch SHA after the implementation push: matched.

The tests cover privacy rejection, invalid HMAC secrets, deterministic tokenization and date shifting, malformed observations, oversized snapshots, persistence exceptions, synchronous adapter exceptions, write timeouts, duplicate calls, FINAL-over-DRAFT behavior and an open circuit breaker.

## Risks found

1. A bounded timeout cannot cancel an adapter write that has already started. A future real persistence adapter must support its own cancellation or strict internal timeout and remain idempotent if it completes after the caller times out.
2. HMAC secrecy is operationally critical. A short, missing or invalid secret deliberately keeps the recorder OFF. Secret rotation must preserve `tokenKeyVersion` handling.
3. Date shifting preserves relative relationships, but boundary movement across months or years is expected. Offline analysis must treat shifted dates only relationally.
4. Persistence retention and deletion policy are not implemented in Stage 3A because no real persistence adapter is connected.
5. Circuit-breaker state is currently in-memory and dependency-injected. Runtime lifecycle and multi-instance behavior must be designed before production integration.
6. The recorder is fail-open by design. Recording gaps are therefore possible and must never be interpreted as missing or rejected receipts.

## Recommended next step

Design Stage 3B before changing production code:

1. define a separate Scanner 2.0 persistence namespace, retention period, record cap and full-dataset deletion operation;
2. specify a narrow adapter with atomic idempotent upsert and adapter-level timeout behavior;
3. add adapter contract tests using an in-memory implementation only;
4. define configuration for OFF and sampled RECORD_ONLY modes;
5. review the exact capture points again before any guarded integration with `TarsReportApp.js`;
6. keep Scanner 2.0 decision execution disabled during the first runtime recorder rollout.

No merge, build or deploy was performed. Neither `develop` nor `main` was changed.
