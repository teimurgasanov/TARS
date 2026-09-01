# Stage 3B-2.5 — Safe production packaging path

Date: 2026-09-01

Branch: `feature/scanner-2.0`

Parent commit: `2e0c4e01b42e9a41372c48674a2bd3a1344a3ef8`

Implementation commit: `ci(scanner2): use canonical bundle for guarded deployment` (Git reports the SHA after this report is committed)

## What changed

- `.github/workflows/deploy-rocketchat.yml` now validates and packages TARS through the canonical `./build-tars.sh` path only.
- The former manual `zip -j ... app.json TarsReportApp.js ...` command was removed completely.
- Node.js 20, zsh, `npm ci`, and the exact esbuild `0.12.29` version gate run before tests and packaging.
- Scanner 2.0 and legacy tests are separated and counted explicitly.
- A package gate verifies ZIP integrity, exact five-file contents, bundle syntax, bundle policy, Shadow Recorder infrastructure, absence of runtime Scanner 2.0 decision calls, and protected source hashes.
- Canonical ZIP is uploaded as a short-lived validation artifact. Artifact upload never installs the application.
- `tests/scanner2-safe-deploy-workflow.test.js` permanently checks the deploy safety boundary.
- `.github/workflows/scanner2-packaging-ci.yml` expects the new total of 17 Scanner 2.0 tests.

## Canonical build path

The only packaging command in the production workflow is:

```text
./build-tars.sh
```

The generated `tars-report_<version>.zip` is resolved from `app.json`, verified, uploaded as the optional validation artifact, and used unchanged by the guarded manual deployment step.

Direct ZIP packaging of tracked `TarsReportApp.js` is now forbidden because the tracked source contains local Scanner 2.0 module imports. Only the deterministic esbuild bundle resolves those imports while preserving the Rocket.Chat single-file application contract.

## Automatic deploy prevention

- A push to `develop` executes checkout, commit verification, manifest checks, all tests, canonical build, package verification, artifact upload, and a validation summary.
- A develop push never reads Rocket.Chat secrets, never authenticates, and never calls `/api/apps/update`.
- Every secret/authentication/update step has the explicit condition:

```text
github.event_name == 'workflow_dispatch' && inputs.confirm == 'DEPLOY'
```

- Manual dispatch still requires `confirm` to equal `DEPLOY` exactly.
- Manual `commit_sha` must be a full 40-character SHA, resolve to the checked-out commit, and be an ancestor of `origin/develop`.
- The workflow keeps read-only repository permissions.

No `workflow_dispatch` run was started during this stage.

## Package gate

Before any Rocket.Chat step, the workflow verifies:

- `unzip -t` succeeds;
- ZIP contains exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, and `icon.png`;
- bundled `TarsReportApp.js` passes `node --check`;
- `tools/verify-tars-bundle.js` passes;
- unresolved relative imports: `0`;
- unapproved external imports: `0`;
- Shadow Recorder contract/timeout/runtime association markers are present;
- `evaluateRules`, `resolveConflicts`, `makeDecision`, `runOfflineComparison`, and `runOfflineDataset` runtime calls are absent;
- tracked `TarsReportApp.js` and `app.json` hashes are unchanged by build.

## Files changed

- `.github/workflows/deploy-rocketchat.yml`
- `.github/workflows/scanner2-packaging-ci.yml`
- `tests/scanner2-safe-deploy-workflow.test.js`
- `docs/codex-reports/stage-3b25-safe-deploy-packaging.md`

Protected production files remain unchanged:

- `TarsReportApp.js`: `1db768134ac846cb9cd909c10abbc3aa7867c399bbff9fd7c830ffa8770aa9f6`
- `app.json`: `8c93b34e8339027896c94872af55f656511c0b338d813bde2c25a0cddfeca963`
- `build-tars.sh`
- `scanner2/*`
- `en.json`
- `ru.json`

Receipt logic, duplicates, OCR, reports, photos, calculations, permissions, and RECORD_ONLY configuration were not changed.

## Verification

- Deploy workflow YAML syntax: passed using the local Ruby YAML parser.
- Static guarded-deploy test: passed.
- Scanner 2.0 tests: `17/17` passed.
- Legacy TARS tests: `77/77` passed.
- Packaging test: passed as part of the Scanner 2.0 suite.
- `git diff --check`: passed.
- `zsh -n build-tars.sh`: passed.
- Canonical `./build-tars.sh`: passed.
- `unzip -t`: passed.
- Bundle policy: passed.
- Bundled `TarsReportApp.js` SHA-256: `4e76b87a28b12e7efde09bf3e67e62164947acda3b0b3b7955c4991845fef2db`.
- Local ZIP SHA-256: `aa5768f94ed20be2ecd4dec981264786ffeb0cfa393b87f68fd69b45108f0b8c` (diagnostic only; ZIP timestamps are not the reproducibility contract).
- Scanner 2.0 Packaging CI: pending feature-branch push.

## Risks

- Production workflow duration increases because validation-only develop pushes now install pinned build dependencies and execute all tests before packaging.
- Manual deployment depends on the selected develop commit containing the canonical build tooling. Older commits without it fail closed before Rocket.Chat authentication.
- GitHub-hosted runner or package-registry outages can block validation/deployment, but cannot trigger a partial Rocket.Chat update because all network deployment steps occur after the package gate.
- Artifact storage contains the same canonical private-app ZIP that would be deployed; retention is limited to two days and repository permissions remain read-only.

## Recommended next step

After successful Scanner 2.0 Packaging CI and review, merge only through a separately authorized process. Keep `scanner2_shadow_mode` set to `OFF`. Any manual production installation must be a separate explicit `workflow_dispatch` with the reviewed develop SHA and `confirm=DEPLOY`.
