# Stage 3B-2.6 — Deploy credential hygiene

Date: 2026-09-01

Branch: `fix/deploy-token-hygiene`

Parent `origin/develop`: `8cfce53caf025743e1c47919003b067d0ee2207e`

## Scope

The production application was not changed or redeployed. Scanner 2.0 remains disabled. The change is limited to the guarded deployment workflow, its static/simulated security coverage, and this report.

## Changes

- Replaced the cross-step Rocket.Chat authentication handoff with one manual-only guarded shell step.
- The guarded sequence is now: login, immediate runner masking, revoke older deployment-user sessions, upload the reviewed package, and logout.
- Dynamic authentication credentials remain local shell variables and are not written to persistent GitHub Actions channels, summaries, or artifacts.
- Cleanup uses an exit trap and attempts logout after every successful login, including when session revocation or package upload fails.
- Failure to revoke older deployment-user sessions stops execution before the application update endpoint.
- Response files are bounded to the runner temporary directory and removed during cleanup.
- The application-update call still has no automatic retry.
- A simulated shell test proves successful ordering, logout after upload failure, and fail-closed behavior when older-session revocation is unavailable.

## Files

- `.github/workflows/deploy-rocketchat.yml`
- `tests/scanner2-safe-deploy-workflow.test.js`
- `tests/scanner2-deploy-token-hygiene.test.js`
- `docs/codex-reports/stage-3b26-deploy-token-hygiene.md`

## Verification

- Credential hygiene security test: pass.
- Safe deployment workflow test: pass.
- Scanner 2.0 tests: 18/18 pass.
- Legacy TARS tests: 77/77 pass.
- YAML syntax validation: pass.
- JavaScript syntax validation: pass.
- `git diff --check`: pass.
- No deployment workflow was dispatched.
- No Rocket.Chat API was called by the tests; all flow simulations used a local mock.

## Previous deployment session

The older deployment session associated with run `33474295740` was not invalidated from this workstation. The required Rocket.Chat deployment-user credentials are not available locally, and using a different interactive administrator session would not safely prove that the correct deployment-user sessions were revoked.

Safe remediation requires a separate guarded session-cleanup action using the deployment-user secrets, or an explicit administrator operation targeting that exact account. It must perform login, masking, older-session revocation, and logout without invoking the application update endpoint. The next deployment workflow will also revoke older sessions before any update, but waiting for a future deployment is not an immediate cleanup.

## Risks

- Availability and authorization of the older-session revocation endpoint cannot be proven without a guarded Rocket.Chat call. The new workflow deliberately fails before application update if that call is rejected.
- Until a dedicated cleanup action or exact-account administrator cleanup is completed, the session exposed by the earlier run must be treated as potentially active.
- The workflow trigger does not run production validation on pushes to this fix branch; local tests provide the current evidence until the branch is reviewed and separately merged.

## Next step

Review this isolated security commit, then merge it into `develop` only with separate authorization. Before any later deployment, run an independently reviewed credentials-only session cleanup or otherwise revoke all sessions for the exact deployment account. Do not enable Scanner 2.0 RECORD_ONLY as part of that cleanup.

Final commit SHA is reported by Codex after the validated commit is created.

## Stage 3B-2.7 SESSION_CLEANUP

The existing manual workflow now has an explicit choice between `DEPLOY` and `SESSION_CLEANUP`.

- `DEPLOY` continues to require exact `DEPLOY` confirmation and a reviewed `develop` commit SHA.
- `SESSION_CLEANUP` requires exact `CLEANUP` confirmation.
- The cleanup job is gated to manual dispatch and cannot run from a `develop` push.
- The cleanup job does not check out source code, build a package, upload an artifact, or call the application update endpoint.
- Its single authenticated shell step logs in, immediately masks dynamic credentials, revokes older deployment-user sessions, and always attempts to close its fresh session through an exit trap.
- Revocation failure is fail-closed and still executes fresh-session cleanup. There is no retry.
- The existing deployment path retains its full tests, canonical build, package gate, previous-session revocation, application update, and final logout.

Security simulations cover successful cleanup and rejected revocation. Both prove that cleanup never reaches the application update endpoint and that fresh-session logout remains last. This mode was not executed during implementation; the older session remains potentially active until a separately authorized guarded cleanup run succeeds.

Validation from parent `2b391e75188a9b3f23bc875389703ae481ee11f9`:

- Scanner 2.0 tests: 18/18 passed.
- Legacy TARS tests: 77/77 passed.
- Workflow YAML parsing, JavaScript syntax checks, and `git diff --check`: passed.
- `TarsReportApp.js`, `app.json`, `build-tars.sh`, `scanner2/`, packaging files, translations, and production behavior were unchanged.

Residual risk: the cleanup depends on Rocket.Chat permitting `users.logoutOtherClients` for the deployment account. A rejection or unavailable endpoint fails closed, skips every application-update path, and still attempts logout of the newly created cleanup session. The cleanup action must therefore be run only after separate review and authorization.
