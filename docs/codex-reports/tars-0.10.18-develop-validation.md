# TARS 0.10.18 — develop validation

Date: 2026-09-01

Target branch: `develop`

Previous develop baseline: `a665edc87ba1edd89d14ab5aac8e1b1c388517ed`

Validated release candidate: `3cf500db808773cc4b2150b905b5eb551f866e51`

Source branch: `feature/scanner-2.0`

## Transfer verification

- The working tree was clean before the transfer.
- `origin/develop` still pointed exactly to the expected 0.10.17 baseline.
- Local and remote `feature/scanner-2.0` both pointed to the 0.10.18 RC commit.
- The merge base was exactly the develop baseline.
- The feature branch was a direct continuation of develop with 13 commits and no independent develop commits.
- Local `develop` was advanced using only `git merge --ff-only feature/scanner-2.0`.
- No merge commit or conflict resolution was created.
- The release candidate was pushed to `origin/develop` as a fast-forward.

## Release state after fast-forward

- `app.json` version: `0.10.18`
- `scanner2_shadow_mode` package default: `OFF`
- RECORD_ONLY was not enabled.
- The working tree was clean.

## Local validation before push

- Scanner 2.0 tests: `17/17` passed.
- Legacy TARS tests: `77/77` passed.
- Packaging test: passed.
- Safe-deploy workflow test: passed.
- `git diff --check`: passed.
- Canonical `./build-tars.sh`: passed.
- `unzip -t tars-report_0.10.18.zip`: passed.
- Bundle policy: passed.
- Bundled `TarsReportApp.js` SHA-256: `4e76b87a28b12e7efde09bf3e67e62164947acda3b0b3b7955c4991845fef2db`.

The canonical ZIP contained exactly:

```text
app.json
TarsReportApp.js
en.json
ru.json
icon.png
```

## GitHub Actions validation

Workflow: `Validate TARS and manually deploy to Rocket.Chat`

Run: [33473801040](https://github.com/teimurgasanov/TARS/actions/runs/33473801040)

Conclusion: `success`

Confirmed successful steps included:

- exact develop commit verification;
- repository and manifest safety;
- all Scanner 2.0 tests;
- all 77 legacy tests;
- canonical single-file package build;
- canonical package gate;
- validation artifact upload.

Confirmed skipped steps:

- `Validate Rocket.Chat deployment secrets`;
- `Authenticate to Rocket.Chat`;
- `Update private app through Rocket.Chat upload API`;
- `Manual deployment summary`.

Therefore the develop push was validation-only. No Rocket.Chat authentication or application update occurred.

The separate Scanner 2.0 Packaging CI did not start a new run for the develop ref because its push trigger is restricted to `feature/scanner-2.0`. The same RC commit had already passed feature-branch Packaging CI in run [33473587451](https://github.com/teimurgasanov/TARS/actions/runs/33473587451).

## Deployment status and risks

- No deploy was performed.
- No `workflow_dispatch DEPLOY` was started.
- `main` was not changed.
- Production settings were not changed.
- RECORD_ONLY remains disabled by default.
- This report is the only post-validation change. Its docs-only push must pass the same validation-only workflow and must again skip every deployment step.

Any deployment, RECORD_ONLY activation, or merge into `main` requires separate explicit authorization.
