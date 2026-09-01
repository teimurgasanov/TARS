# Stage 3B-1 — Deterministic Single-File Packaging

Date: 2026-09-01
Branch: `feature/scanner-2.0`
Starting commit: `2a6e0c34a79a8e263e642696c57f3a529fe5445b`
Planned commit message: `feat(scanner2): add deterministic single-file packaging`

## Outcome

Stage 3B-1 adds a reproducible local packaging path that includes the tested Scanner 2.0 shadow infrastructure inside one bundled `TarsReportApp.js` in the ZIP.

The shadow code is packaged but inactive:

- `TarsReportApp.js` does not import or call Shadow Recorder;
- the build entry does not call `safeShadowRecord()`;
- the build entry does not call `createShadowTokenizer()`;
- no receipt, duplicate, report, calculation or Rocket.Chat flow was changed;
- the production app continues to expose only `TarsReportApp`.

No runtime Shadow Recorder integration, merge or deploy was performed.

## Files changed

Added:

- `package.json` — private build package with local packaging commands and exact esbuild dependency;
- `package-lock.json` — reproducible npm lock for esbuild;
- `tools/tars-build-entry.js` — build-only CommonJS entry that retains all three shadow modules and re-exports the production app;
- `tools/verify-tars-bundle.js` — syntax, marker, unresolved-import and external-module policy verifier;
- `tests/scanner2-packaging.test.js` — deterministic packaging and source-integrity test;
- `docs/codex-reports/stage-3b1-packaging-implementation.md` — this report.

Modified:

- `build-tars.sh` — creates an isolated `.build` directory, bundles, validates, builds the ZIP and cleans temporary files on exit;
- `.gitignore` — ignores `node_modules/` and `.build/` in addition to existing ZIP artifacts.

Explicitly unchanged:

- `TarsReportApp.js`;
- `app.json`;
- `scanner2/shadow-contract.js`;
- `scanner2/shadow-tokenizer.js`;
- `scanner2/shadow-recorder.js`;
- `.github/workflows/deploy-rocketchat.yml`.

## Build dependency

Pinned version: `esbuild@0.12.29`.

Verification:

- `npm install`: passed;
- `npm ci`: passed;
- installed package version: exactly `0.12.29`;
- executable version: exactly `0.12.29`;
- current environment: Node.js `v24.19.0`.

No alternative esbuild version was selected.

## Build process

`build-tars.sh` now:

1. resolves paths relative to the script location;
2. creates a clean `.build` directory;
3. invokes the repository-local pinned esbuild binary;
4. bundles `tools/tars-build-entry.js` for Node 20;
5. keeps only `@rocket.chat/apps-engine/*` external during bundling;
6. runs `node --check` on the emitted class file;
7. applies the explicit bundle policy verifier;
8. verifies that tracked `TarsReportApp.js` retained its original SHA-256;
9. creates the versioned ZIP from the temporary bundle and four support files;
10. verifies the archive with `unzip -t`;
11. moves the successful ZIP to the established repository-root output path;
12. removes `.build` through an EXIT/INT/TERM cleanup trap.

The first implementation run intentionally failed on an overly narrow export assertion. The build stopped before replacing the ZIP and the temporary directory was removed. The build entry was then made explicit (`{ TarsReportApp }`) and the verifier was corrected without weakening import or marker checks.

## Production source integrity

SHA-256 after all builds and tests:

- `TarsReportApp.js`: `d75cb06873fce73330b24e108ac7d96bc367eadb2723c43ccd376ac95beaba9e`
- `app.json`: `8c93b34e8339027896c94872af55f656511c0b338d813bde2c25a0cddfeca963`
- `scanner2/shadow-contract.js`: `9122724d0bc0935301cb080746aa96648fac6cd98c2119b13f248fe7175dbd1d`
- `scanner2/shadow-tokenizer.js`: `fd6fde6a473ef2a84b42c52fee3e2fa962d17230da26bc821ffac001b7b6bfe9`
- `scanner2/shadow-recorder.js`: `d8450189c3b1ad7d0303246fbe776eed627cbbb103ff3ad7fe4213377e5d7250`
- `.github/workflows/deploy-rocketchat.yml`: `a6b8f531cb4f1f91218fd75878a7c3a86d55c42a76d4390b9575a6ebd2d01ce5`

The production source and manifest match the Stage 3B baseline exactly.

## ZIP result

Output: `tars-report_0.10.17.zip`

The archive contains exactly five entries:

1. `app.json`
2. `TarsReportApp.js`
3. `en.json`
4. `ru.json`
5. `icon.png`

No `scanner2/*.js`, build entry, verifier, source module or package metadata is shipped separately.

Final local proof:

- `unzip -t`: passed;
- bundled JavaScript syntax: passed;
- bundled `TarsReportApp.js` SHA-256: `1c55207d44e4a5875a0d07f32d2a1d522e440e3437796e4cc348e4ff346a0747`;
- ZIP SHA-256 for the final local run: `20c0dca34760de5299e5948d1030b159e9c6852aa10e97dd1a531c08ddf74bb7`.

ZIP byte hashes are not the reproducibility contract because ZIP metadata includes file timestamps. The packaging test instead proves identical entry order, identical entry set, identical bundled executable content and identical manifest content across two builds from the same working tree.

## Bundle policy result

- `TarsReportApp` export: present;
- shadow contract marker: present;
- shadow tokenizer/HMAC marker: present;
- shadow recorder marker: present;
- unresolved relative `require()`: 0;
- unapproved externals: 0.

Remaining externals:

- `@rocket.chat/apps-engine/definition/App`
- `@rocket.chat/apps-engine/definition/accessors`
- `@rocket.chat/apps-engine/definition/api`
- `@rocket.chat/apps-engine/definition/exceptions`
- `@rocket.chat/apps-engine/definition/metadata`
- `@rocket.chat/apps-engine/definition/rooms`
- `@rocket.chat/apps-engine/definition/scheduler`
- `@rocket.chat/apps-engine/definition/settings`
- `@rocket.chat/apps-engine/definition/ui`
- `@rocket.chat/apps-engine/definition/uikit`
- `crypto`

`crypto` is required only by the packaged tokenizer implementation and remains unused because runtime integration is disabled.

## Test results

- packaging test: passed;
- all Scanner 2.0 test files: 15/15 passed;
- all legacy TARS test files: 77/77 passed;
- `zsh -n build-tars.sh`: passed;
- syntax checks for build entry, verifier, packaging test and bundled output: passed;
- `build-tars.sh`: passed;
- `unzip -t`: passed;
- repeated-build equivalence: passed;
- temporary build cleanup after success: passed;
- temporary build cleanup after a validation failure: observed and passed;
- protected-source SHA checks: passed;
- `git diff --check`: passed before report creation.

## Risks found

1. `esbuild@0.12.29` is intentionally old and npm reports advisory `GHSA-67mh-4wv8-2f99` with moderate severity. The advisory concerns the esbuild development server. This packaging path invokes only one-shot local bundling and does not start a development server, so exposure is limited, but the pinned risk must remain documented until a separately reviewed version upgrade.
2. The bundle is deterministic at executable-content level, not necessarily at raw ZIP-byte level because ZIP timestamps vary.
3. The current CI workflow still uses its old direct ZIP command and therefore does not yet consume this build path. This is intentional for Stage 3B-1 and must be resolved in Stage 3B-1.5 before deployment.
4. Rebundling changes the executable artifact bytes even though production source is unchanged. A non-production Rocket.Chat installation smoke test remains necessary before runtime rollout.
5. The packaged tokenizer leaves `crypto` external. Local policy and Apps Compiler checks allow it, but exact production runtime compatibility still requires the later server smoke test.
6. The build verifier is static and proves package shape, syntax and imports; it does not construct the app inside Rocket.Chat Apps Engine.

## Recommended next step

Proceed with Stage 3B-1.5 only after review:

1. update `.github/workflows/deploy-rocketchat.yml` to install from `package-lock.json` and invoke the canonical build path;
2. keep deploy disabled while testing the CI-produced artifact;
3. compare CI and local bundle SHA-256 values from the same commit;
4. retain the five-entry ZIP and approved-external gates;
5. do not add runtime Shadow Recorder calls yet.

The implementation commit SHA is recorded in Git history and in the post-push completion response; embedding the commit's own SHA in the file would be self-referential.
