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
