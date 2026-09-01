"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workflowPath = path.resolve(__dirname, "..", ".github", "workflows", "deploy-rocketchat.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function step(name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `workflow step is missing: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next >= 0 ? next : workflow.length);
}

const manualGate = "if: github.event_name == 'workflow_dispatch' && inputs.action == 'DEPLOY' && inputs.confirm == 'DEPLOY'";

assert.match(workflow, /push:\s*\n\s*branches: \[develop\]/, "develop pushes must run validation");
assert.match(workflow, /workflow_dispatch:[\s\S]*action:[\s\S]*type: choice[\s\S]*- DEPLOY[\s\S]*- SESSION_CLEANUP/);
assert.match(workflow, /commit_sha:[\s\S]*required: false[\s\S]*confirm:[\s\S]*required: true/);
assert.match(workflow, /uses: actions\/setup-node@v4[\s\S]*node-version: "20"/);
assert.match(workflow, /sudo apt-get install --yes --no-install-recommends zsh/);
assert.match(workflow, /npm ci/);
assert.match(workflow, /test "\$ESBUILD_VERSION" = "0\.12\.29"/);

assert.strictEqual((workflow.match(/\.\/build-tars\.sh/g) || []).length, 1, "canonical build command must be unique");
assert.doesNotMatch(workflow, /(?:^|\n)\s*zip\s+[^\n]*(?:-j|TarsReportApp\.js)/, "tracked source must never be zipped directly");
assert.match(workflow, /unzip -t "\$ZIP_PATH"/);
assert.match(workflow, /EXPECTED_CONTENTS=.*app\.json TarsReportApp\.js en\.json ru\.json icon\.png/);
assert.match(workflow, /node --check "\$BUNDLE_PATH"/);
assert.match(workflow, /node tools\/verify-tars-bundle\.js "\$BUNDLE_PATH"/);
assert.match(workflow, /scanner2-shadow-recorder-v1/);
assert.match(workflow, /WRITE_TIMEOUT/);
assert.match(workflow, /scanner2-shadow:v1:/);
assert.match(workflow, /evaluateRules\|resolveConflicts\|makeDecision\|runOfflineComparison\|runOfflineDataset/);

assert.match(workflow, /for test_file in tests\/scanner2-\*\.test\.js/);
assert.match(workflow, /test "\$scanner_count" -eq 21/);
assert.match(workflow, /test "\$legacy_count" -eq 77/);
assert.match(workflow, /node --check tests\/scanner2-packaging\.test\.js/);
assert.match(workflow, /git diff --check/);
assert.match(workflow, /zsh -n build-tars\.sh/);

const resolve = step("Resolve reviewed target");
assert.match(resolve, /inputs\.action.*!= "DEPLOY"/);
assert.match(resolve, /inputs\.confirm.*!= "DEPLOY"/);
assert.match(resolve, /\^\[0-9a-fA-F\]\{40\}\$/);
const verifyCommit = step("Verify exact develop commit");
assert.match(verifyCommit, /TARGET_SHA.*REQUESTED_SHA/);
assert.match(verifyCommit, /git merge-base --is-ancestor "\$TARGET_SHA" origin\/develop/);

[
  "Validate Rocket.Chat deployment secrets",
  "Authenticate, revoke previous sessions, update app, and logout"
].forEach((name) => {
  assert.ok(step(name).includes(manualGate), `${name} must have the manual DEPLOY gate`);
});

const firstSecret = workflow.indexOf("secrets.ROCKETCHAT_URL");
assert.ok(firstSecret > workflow.indexOf("Validate Rocket.Chat deployment secrets"));
const beforeSecretGate = workflow.slice(0, workflow.indexOf("      - name: Validate Rocket.Chat deployment secrets"));
assert.doesNotMatch(beforeSecretGate, /secrets\.ROCKETCHAT_|\/api\/v1\/login|\/api\/apps\/update/,
  "validation-only path must not inspect secrets or call Rocket.Chat");
assert.match(step("Authenticate, revoke previous sessions, update app, and logout"), /\/api\/apps\/update/);
assert.match(workflow, /session_cleanup:[\s\S]*if: github\.event_name == 'workflow_dispatch' && inputs\.action == 'SESSION_CLEANUP'/);
assert.match(step("Validate guarded session cleanup request"), /inputs\.confirm.*CLEANUP/);

assert.match(workflow, /uses: actions\/upload-artifact@v4[\s\S]*path: \$\{\{ env\.ZIP_PATH \}\}[\s\S]*retention-days: 2/);
assert.match(step("Validation summary"), /Validation-only develop push completed\. No Rocket\.Chat deployment was attempted\./);

console.log("PASS: production workflow builds canonically and cannot deploy on develop push");
