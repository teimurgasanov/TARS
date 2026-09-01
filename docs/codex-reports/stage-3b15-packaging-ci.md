# Stage 3B-1.5 — Packaging CI only

Date: 2026-09-01

Branch: `feature/scanner-2.0`

Baseline commit: `f7dd57a46ab9cf93daf4bafc17cee1207b62f21f`

Planned commit: `ci(scanner2): verify deterministic packaging without deploy`

## Scope

Added a dedicated GitHub Actions workflow at
`.github/workflows/scanner2-packaging-ci.yml`. It verifies the deterministic
single-file packaging path introduced in Stage 3B-1 without calling or
modifying the production deployment workflow.

No production source, Scanner 2.0 module, receipt pipeline, runtime integration,
build implementation, or application manifest was changed in this stage.

## Workflow behavior

The workflow:

- runs on pushes to `feature/scanner-2.0`;
- is available for pull requests whose head or base is
  `feature/scanner-2.0`;
- supports input-free `workflow_dispatch`;
- uses `actions/checkout@v4`, `actions/setup-node@v4`, and Node.js 20;
- installs the required `zsh` shell explicitly on the Ubuntu runner;
- installs dependencies with `npm ci` and fails unless esbuild is exactly
  `0.12.29`;
- runs the packaging test, all 15 Scanner 2.0 test files, and all 77 legacy
  TARS test files;
- runs `git diff --check`, `zsh -n build-tars.sh`, and Node syntax checks;
- invokes only the canonical `./build-tars.sh` packaging command;
- verifies the ZIP, bundled JavaScript, approved externals, absence of relative
  unresolved imports, included shadow infrastructure, and absence of runtime
  recorder calls;
- verifies that tracked `TarsReportApp.js` and `app.json` hashes do not change;
- writes commit, tool versions, test counts, bundle hash, diagnostic ZIP hash,
  and ZIP contents to the GitHub Actions job summary;
- uploads the ZIP only as a verification artifact with two-day retention.

## Local verification

The following checks passed locally:

- workflow YAML parsed successfully with Ruby/Psych;
- forbidden secret names, Rocket.Chat API calls, deployment environment, and
  write permissions were absent;
- `npm ci` completed and installed esbuild `0.12.29`;
- packaging test: PASS;
- Scanner 2.0 tests: 15/15 test files PASS;
- legacy TARS tests: 77/77 test files PASS;
- `git diff --check`: PASS;
- `zsh -n build-tars.sh`: PASS;
- build entry, bundle verifier, and packaging test Node syntax: PASS;
- canonical `./build-tars.sh`: PASS;
- `unzip -t`: PASS;
- bundle policy verifier: PASS;
- unresolved relative imports: 0;
- unapproved externals: 0.

Local validation used Node.js `v24.19.0`; the GitHub Actions run is the required
proof for the requested Node.js 20 environment.

## First GitHub Actions run

Run `33471571713` for commit
`a777251fa21f23d54e444f2e0ecc88502829b62b` failed before tests at
`Validate scripts and working tree`. The exact error was
`zsh: command not found` (exit 127). The runner had successfully installed
Node.js `v20.20.2` and esbuild `0.12.29` before that failure.

The workflow now installs `zsh` explicitly through Ubuntu's package manager
before syntax validation. This is a CI-environment correction only; it does not
alter the canonical build command or any application source.

## Successful GitHub Actions confirmation

The corrected workflow completed successfully for commit
`693ee72a2a4853cd63136ce789f019e37ef88007`:

- workflow: `Scanner 2.0 Packaging CI`;
- run ID: `33471730799`;
- run number: `2`;
- event: `push`;
- status: `completed`;
- conclusion: `success`;
- run URL:
  `https://github.com/teimurgasanov/TARS/actions/runs/33471730799`.

The single job `Verify deterministic package` completed successfully. Its
steps were:

1. Set up job — success.
2. Checkout reviewed commit — success.
3. Set up Node.js 20 — success.
4. Install required shell — success.
5. Capture protected source hashes — success.
6. Install pinned build dependency — success.
7. Validate scripts and working tree — success.
8. Run Scanner 2.0 tests — success.
9. Run 77 legacy TARS tests — success.
10. Build canonical package — success.
11. Verify package and source integrity — success.
12. Write verification summary — success.
13. Upload verification artifact — success.
14. Post Set up Node.js 20 — success.
15. Post Checkout reviewed commit — success.
16. Complete job — success.

GitHub Actions reported:

- Scanner 2.0 test files: `15`;
- legacy TARS test files: `77`;
- bundled `TarsReportApp.js` SHA-256:
  `1c55207d44e4a5875a0d07f32d2a1d522e440e3437796e4cc348e4ff346a0747`;
- ZIP SHA-256:
  `47baaf92d560dd6ebdd1701634fdb0a7e735270e1f5f921c880481debbe749d5`.

## Package verification

ZIP contents were exactly:

1. `app.json`
2. `TarsReportApp.js`
3. `en.json`
4. `ru.json`
5. `icon.png`

Observed local hashes:

- source `TarsReportApp.js` SHA-256:
  `d75cb06873fce73330b24e108ac7d96bc367eadb2723c43ccd376ac95beaba9e`;
- source `app.json` SHA-256:
  `8c93b34e8339027896c94872af55f656511c0b338d813bde2c25a0cddfeca963`;
- bundled `TarsReportApp.js` SHA-256:
  `1c55207d44e4a5875a0d07f32d2a1d522e440e3437796e4cc348e4ff346a0747`.

The ZIP SHA is emitted for diagnostics only. ZIP timestamps are explicitly not
treated as the reproducibility contract; the bundled JavaScript SHA-256 is the
primary comparison hash.

## Security boundary

The workflow has only:

```yaml
permissions:
  contents: read
```

It contains no Rocket.Chat secrets, authentication variables, `curl`,
`apps/update`, deployment environment, deploy step, or write permission. The
artifact is retained only for inspection and is never installed into
Rocket.Chat.

The production workflow `.github/workflows/deploy-rocketchat.yml` remains
unchanged at SHA-256
`a6b8f531cb4f1f91218fd75878a7c3a86d55c42a76d4390b9575a6ebd2d01ce5`.

## Risks

- Local validation cannot fully emulate the GitHub-hosted Node.js 20 runner;
  the first pushed Actions run is therefore part of this stage's acceptance.
- Installing `zsh` adds an Ubuntu package-repository dependency and a small
  amount of CI latency. It is required because both the requested syntax check
  and canonical build script use zsh.
- The intentionally pinned esbuild `0.12.29` is old and npm reports a moderate
  advisory. Changing it is outside this stage and must be reviewed separately
  because the exact version is part of the approved packaging path.
- Pull-request events are registered repository-wide, but the job is gated so
  it only executes when the PR head or base is `feature/scanner-2.0`.
- Artifact upload uses GitHub's artifact service only; it does not validate a
  Rocket.Chat deployment, by design.

## Next step

Stage 3B-1.5 is complete. Do not merge, deploy, modify `develop`/`main`, or
begin runtime Shadow Recorder integration without separate authorization.

The immutable implementation commit SHA is reported by Git after commit and in
the GitHub Actions summary; a report cannot embed its own SHA without changing
that SHA.
