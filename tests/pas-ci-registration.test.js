"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const expectedPasTestCount = 4;
const workflowNames = [
  "deploy-rocketchat.yml",
  "scanner2-packaging-ci.yml"
];

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `workflow step is missing: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next >= 0 ? next : workflow.length);
}

const pasTests = fs.readdirSync(path.join(root, "tests"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^pas-.*\.test\.js$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

assert.strictEqual(
  pasTests.length,
  expectedPasTestCount,
  `top-level PAS test count changed: ${pasTests.join(", ")}`
);

for (const workflowName of workflowNames) {
  const workflow = fs.readFileSync(
    path.join(root, ".github", "workflows", workflowName),
    "utf8"
  );
  const legacyStep = workflowStep(workflow, "Run 83 legacy TARS tests");
  const pasStep = workflowStep(workflow, "Run PAS financial-core tests");
  assert.match(pasStep, /npm ci --prefix pas\/authority/, "isolated SQLite dependency must be installed before PAS tests");

  assert.match(
    legacyStep,
    /! -name 'pas-\*\.test\.js'/,
    `${workflowName} must exclude PAS tests from legacy classification`
  );
  assert.match(legacyStep, /test "\$legacy_count" -eq 83/);
  assert.match(legacyStep, /LEGACY_TEST_COUNT=\$legacy_count/);

  assert.match(
    pasStep,
    /find tests -maxdepth 1 -type f -name 'pas-\*\.test\.js' \| sort/,
    `${workflowName} must run every top-level PAS test in sorted order`
  );
  assert.match(pasStep, new RegExp(`test "\\$pas_count" -eq ${expectedPasTestCount}`));
  assert.match(pasStep, /PAS_TEST_COUNT=\$pas_count/);
}

const guardedReview = fs.readFileSync(
  path.join(root, ".github", "workflows", "tars-guarded-review-build.yml"),
  "utf8"
);
assert.match(guardedReview, /npm ci --prefix pas\/authority/, "all-tests CI must install the isolated PAS dependency");
assert.match(
  guardedReview,
  /for test_file in tests\/\*\.test\.js; do/,
  "guarded review must continue discovering PAS tests through its all-tests loop"
);

console.log(`PASS: ${expectedPasTestCount} PAS tests are first-class CI tests and legacy remains fixed at 83`);
