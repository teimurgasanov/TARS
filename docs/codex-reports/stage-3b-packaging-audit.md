# Stage 3B-0 — Packaging and Integration Audit

Date: 2026-09-01
Branch: `feature/scanner-2.0`
Analyzed Scanner 2.0 implementation: `fadd7cdfcf18154f378c4562ddb55c418a4ed492`
Branch HEAD before this report: `daa1e08b00341402b57d474fd040222a382f0c4d`

## Scope and repository state

This was an analysis-only audit. No production, Scanner 2.0, test, manifest, build, merge or deployment changes were made.

The requested implementation commit `fadd7cd` is an ancestor of the current branch HEAD. The only intervening change before this report is the previous Stage 3A markdown report. There is no code difference between `fadd7cd` and the analyzed working tree in:

- `TarsReportApp.js`;
- `app.json`;
- `build-tars.sh`;
- `scanner2/`;
- `tests/`.

Protected SHA-256 values at audit time:

- `TarsReportApp.js`: `d75cb06873fce73330b24e108ac7d96bc367eadb2723c43ccd376ac95beaba9e`
- `app.json`: `8c93b34e8339027896c94872af55f656511c0b338d813bde2c25a0cddfeca963`
- `build-tars.sh`: `c341585ce55d74c2b5dc0fcf6eae0a007bd566c40e90222f4599e6d4447522a5`

## Findings

### 1. Can Rocket.Chat load `require("./scanner2/shadow-recorder")` from files added to the ZIP?

The answer is conditional: current Rocket.Chat Apps Engine source supports multi-file JavaScript apps as a legacy packaging form, but relying on this server-side behavior is not the safest integration for TARS.

Evidence:

1. `AppPackageParser` reads every non-hidden `.js` entry from the ZIP and preserves its normalized archive path.
2. The Deno runtime detects a package containing more than one JavaScript file and calls `bundleLegacyApp()` before app construction.
3. `bundleLegacyApp()` uses esbuild and resolves relative JavaScript modules from the package file map.
4. The locally installed Rocket.Chat Apps Compiler also resolves relative modules before emitting a single bundle.

Important limitations for TARS:

- the current `build-tars.sh` uses `zip -j`, which strips directory paths;
- it includes only five root files and does not include `scanner2/` at all;
- adding the Scanner files while retaining `-j` would make `./scanner2/...` unresolvable;
- server-side legacy bundling varies with the installed Rocket.Chat/Apps Engine generation and transfers packaging failure into deployment/runtime;
- the exact production server Apps Engine version was not available in this local audit.

Therefore raw multi-file loading is technically supported by inspected Apps Engine implementations, but it is not sufficiently deterministic to recommend as the TARS production packaging contract.

Relevant upstream source:

- <https://github.com/RocketChat/Rocket.Chat.Apps-engine/blob/master/src/server/compiler/AppPackageParser.ts>
- <https://github.com/RocketChat/Rocket.Chat.Apps-engine/blob/master/src/server/runtime/deno/bundler.ts>
- <https://github.com/RocketChat/Rocket.Chat.Apps-engine/blob/master/src/server/runtime/deno/AppsEngineDenoRuntime.ts>

### 2. Existing local imports in `TarsReportApp.js`

There are no relative or local-file imports in the current file.

All remaining runtime `require()` calls point to `@rocket.chat/apps-engine/definition/*`. No Node.js built-in module is currently required by the production bundle.

### 3. Is `TarsReportApp.js` already bundled?

Yes.

Evidence in the file:

- esbuild-style `__commonJS` bootstrap at the top;
- bundled `jpeg-js` source with original module path comments;
- minified/renamed identifiers in the application section;
- one exported `TarsReportApp` class;
- no relative imports left for bundled dependencies.

The current ZIP contains only this single executable JavaScript file plus manifest, translations and icon.

### 4. Which tool produced it?

The output format is consistent with esbuild. The exact original command and exact version cannot be proven because the repository contains no source entry tree, `package.json`, lockfile, source map or historical bundler configuration.

Supporting local evidence:

- installed `rc-apps` CLI: `1.14.0`;
- installed `@rocket.chat/apps-compiler`: `0.7.0`;
- its resolved esbuild version: `0.12.29`;
- Apps Compiler bundles with `bundle: true`, `platform: "node"`, `target: "node20"` and leaves `@rocket.chat/apps-engine/*` external;
- the compiler output uses the same structural bundle markers found in `TarsReportApp.js`.

Conclusion: esbuild is the highly likely producer, but the original build provenance is incomplete and should be made reproducible before Stage 3B runtime integration.

## Option comparison

| Option | Deploy risk | Rocket.Chat runtime-error risk | Regression risk | Change `build-tars.sh` | Scanner 2.0 remains separately testable |
| --- | --- | --- | --- | --- | --- |
| A — add `scanner2/*.js` to ZIP and use relative `require` | Medium to high | Medium: depends on server legacy bundler and preserved ZIP paths | Low to medium | Yes: include nested paths and stop flattening those files | Yes |
| B — bundle `scanner2/shadow-*` into the emitted `TarsReportApp.js` locally | Low, after a packaging gate | Low: runtime receives the same one-file shape as 0.10.17 | Low to medium: whole output is rebuilt, so full regression tests are mandatory | Yes | Yes; source modules stay unchanged |
| C — copy recorder implementation directly into tracked `TarsReportApp.js` | Medium | Low for module resolution | High: duplicates tested source inside a generated 900+ KB file and invites drift | Not necessarily | Poorly; production copy can diverge from tested modules |
| D — ship raw modules and depend on server-side rebundling through another wrapper | Medium to high | Medium to high: combines wrapper and server-version dependencies | Medium | Yes | Yes |

## Local build proof without deploy

Two read-only/in-memory bundling checks and one temporary ZIP check were performed using the locally installed Rocket.Chat Apps Compiler bundler. No repository file was created or modified by these checks.

The closest proof to the proposed Stage 3B entry shape prepended imports of all three `shadow-*` modules to the current `TarsReportApp.js` content and bundled the result.

Results:

- Apps Compiler bundle: PASS;
- output syntax parse: PASS;
- output size in the direct-entry proof: 768,204 bytes;
- unresolved relative `require()` calls: zero;
- `TarsReportApp` export marker: present;
- Shadow Recorder, tokenizer and contract markers: present;
- remaining external modules: only `@rocket.chat/apps-engine/definition/*` and `crypto`.

`crypto` is explicitly listed as an allowed internal module by the installed Apps Compiler. This is required because `shadow-tokenizer.js` uses HMAC-SHA-256.

A temporary five-file ZIP was also generated outside the repository with the locally bundled class file:

- `app.json`;
- bundled `TarsReportApp.js`;
- `en.json`;
- `ru.json`;
- `icon.png`.

`node --check`, `unzip -t` and archive listing all passed. The temporary proof directory was removed. No deploy command or Rocket.Chat upload API was invoked.

This proves local module resolution, single-file emission, syntax and ZIP integrity. It does not prove application construction inside the exact production Rocket.Chat server; that requires a later non-production server smoke test or separately authorized canary deployment.

## Recommendation: Option B with a deterministic packaging gate

Use local build-time bundling and continue shipping exactly one executable `TarsReportApp.js` in the production ZIP.

The Stage 3B implementation should:

1. keep `scanner2/shadow-contract.js`, `scanner2/shadow-tokenizer.js`, `scanner2/shadow-recorder.js` and `scanner2/contracts.js` as separately tested source modules;
2. add minimal fail-open imports and capture calls to `TarsReportApp.js` only at previously audited capture points;
3. run a pinned local esbuild step before ZIP creation;
4. write the bundled class file to a temporary build directory, never over the tracked `TarsReportApp.js` source;
5. package only the temporary bundled class file plus the existing four support files;
6. fail the build if any relative `require()` remains or if an external module is not in the approved set;
7. run syntax, Scanner 2.0, 77 legacy and packaging tests before any commit or push;
8. keep the recorder OFF by default and do not compute Scanner 2.0 runtime decisions.

Why this is the minimum-risk choice:

- it preserves the established one-JavaScript-file ZIP contract;
- it does not depend on production server-side legacy rebundling;
- it avoids copying tested recorder logic into the generated TARS bundle;
- Scanner 2.0 remains independently testable;
- a packaging failure is detected before deploy;
- Stage 3A fail-open behavior remains intact.

## Exact files required for the future Stage 3B implementation

Existing files to change:

- `TarsReportApp.js` — minimal guarded imports and RECORD_ONLY capture calls; no Scanner 2.0 decision influence;
- `build-tars.sh` — create a temporary single-file bundle, validate it, then ZIP that artifact;
- `.github/workflows/deploy-rocketchat.yml` — install the pinned build dependency and call the canonical build script instead of duplicating the old five-file zip command.

New files to add:

- `package.json` — define the packaging script and pin the build dependency;
- `package-lock.json` — make the bundler version reproducible;
- `tests/scanner2-packaging.test.js` — verify bundle syntax, export, shadow inclusion, zero relative imports, approved externals and ZIP file list.

Files that should not be changed for the packaging mechanism itself:

- `app.json`;
- existing `scanner2/shadow-*` implementation;
- existing Stage 1, Stage 2 and Stage 3A tests.

Before implementing these files, Stage 3B should explicitly approve the pinned esbuild version and the exact three runtime capture points. No merge or deploy should occur as part of that implementation stage.

## Risks to carry forward

1. Rebundling the existing generated `TarsReportApp.js` changes the emitted bytes and can expose latent bundler compatibility issues; all 77 legacy tests plus an artifact-level smoke test are mandatory.
2. Local syntax and bundle checks do not emulate the exact production Apps Engine runtime version.
3. HMAC uses the allowed `crypto` internal module, but a non-production Rocket.Chat runtime smoke test is still required before rollout.
4. Build-tool reproducibility is currently absent and must be introduced with a pinned dependency and lockfile.
5. The CI workflow currently bypasses `build-tars.sh`; leaving both build paths would recreate packaging drift.
6. The production bundle is generated without retained source provenance. Future work should avoid manual duplication of Scanner 2.0 logic inside it.

## Next step

Implement a packaging-only Stage 3B-1 first: add the pinned bundler, canonical build path and packaging test while leaving runtime capture calls disabled. Only after that build artifact passes all Scanner 2.0 and legacy tests should a separate Stage 3B-2 add fail-open RECORD_ONLY capture hooks.

No production code, merge, build artifact in the repository or deploy was performed during this audit.
