"use strict";

const fs = require("fs");
const assert = require("assert");
const { runOfflineComparison, runOfflineDataset } = require("../scanner2/offline-runner");

const dataset = JSON.parse(fs.readFileSync("tests/fixtures/scanner2/offline-shadow-cases.json", "utf8"));
const snapshot = JSON.stringify(dataset);
const result = runOfflineDataset(dataset);
assert.strictEqual(JSON.stringify(dataset), snapshot, "offline runner must not mutate dataset");
assert.strictEqual(result.comparisons.length, dataset.cases.length);

const expectedPrimary = {
  "case-match-accept": "MATCH",
  "case-accept-review": "LEGACY_ACCEPT_SCANNER_REVIEW",
  "case-accept-reject": "LEGACY_ACCEPT_SCANNER_REJECT",
  "case-reject-accept": "LEGACY_REJECT_SCANNER_ACCEPT",
  "case-review-accept": "LEGACY_REVIEW_SCANNER_ACCEPT",
  "case-duplicate-difference": "DUPLICATE_DIFFERENCE"
};
result.comparisons.forEach((item) => {
  assert.strictEqual(item.difference.primaryDifference, expectedPrimary[item.caseId], item.caseId);
});

const identityComparison = result.comparisons.find((item) => item.caseId === "case-reject-accept");
assert.strictEqual(identityComparison.comparisons.identity, "MATCH");
assert.ok(identityComparison.scanner2Decision.identity);

const original = dataset.cases[0];
const alteredGroundTruth = JSON.parse(JSON.stringify(original));
alteredGroundTruth.groundTruth = {
  decision: "REJECT",
  date: null,
  amount: null,
  documentType: "UNKNOWN",
  duplicateState: "CONFIRMED"
};
const originalRun = runOfflineComparison(original);
const alteredRun = runOfflineComparison(alteredGroundTruth);
assert.deepStrictEqual(alteredRun.scanner2Decision, originalRun.scanner2Decision, "groundTruth must not influence Scanner 2.0");
assert.deepStrictEqual(alteredRun.comparisons, originalRun.comparisons, "groundTruth must not influence comparison");
assert.notDeepStrictEqual(alteredRun.groundTruth, originalRun.groundTruth, "groundTruth is retained only for future evaluation");

console.log("PASS: Scanner2OfflineRunner compares legacy and Scanner 2.0 without using ground truth");
