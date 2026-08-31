"use strict";

const fs = require("fs");
const assert = require("assert");
const { runOfflineDataset } = require("../scanner2/offline-runner");
const { aggregateOfflineMetrics } = require("../scanner2/offline-metrics");

const dataset = JSON.parse(fs.readFileSync("tests/fixtures/scanner2/offline-shadow-cases.json", "utf8"));
const { metrics } = runOfflineDataset(dataset);

assert.strictEqual(metrics.totalCases, 6);
assert.deepStrictEqual(metrics.decisionAgreement, { count: 2, denominator: 6, rate: 2 / 6 });
assert.deepStrictEqual(metrics.exactMatch, { count: 1, denominator: 6, rate: 1 / 6 });
assert.deepStrictEqual(metrics.acceptAgreement, { count: 1, denominator: 3, rate: 1 / 3 });
assert.deepStrictEqual(metrics.rejectAgreement, { count: 0, denominator: 1, rate: 0 });
assert.deepStrictEqual(metrics.scannerReviewRate, { count: 2, denominator: 6, rate: 2 / 6 });
assert.deepStrictEqual(metrics.amountDisagreement, { count: 0, denominator: 6, rate: 0 });
assert.deepStrictEqual(metrics.dateDisagreement, { count: 0, denominator: 6, rate: 0 });
assert.deepStrictEqual(metrics.duplicateDisagreement, { count: 1, denominator: 6, rate: 1 / 6 });
assert.deepStrictEqual(metrics.dangerousDisagreements, {
  total: 2,
  legacyRejectScannerAccept: 1,
  legacyAcceptScannerReject: 1,
  caseIds: ["case-accept-reject", "case-reject-accept"]
});
assert.strictEqual(metrics.decisionMatrix["ACCEPT->ACCEPT"], 1);
assert.strictEqual(metrics.decisionMatrix["ACCEPT->REVIEW"], 1);
assert.strictEqual(metrics.decisionMatrix["ACCEPT->REJECT"], 1);
assert.strictEqual(metrics.decisionMatrix["REJECT->ACCEPT"], 1);
assert.strictEqual(metrics.decisionMatrix["REVIEW->ACCEPT"], 1);
assert.strictEqual(metrics.decisionMatrix["REVIEW->REVIEW"], 1);

const empty = aggregateOfflineMetrics([]);
assert.strictEqual(empty.decisionAgreement.rate, null);
assert.strictEqual(empty.exactMatch.rate, null);
assert.strictEqual(empty.acceptAgreement.rate, null);
assert.strictEqual(empty.rejectAgreement.rate, null);
assert.strictEqual(empty.scannerReviewRate.rate, null);
assert.strictEqual(empty.amountDisagreement.rate, null);
assert.strictEqual(empty.dateDisagreement.rate, null);
assert.strictEqual(empty.duplicateDisagreement.rate, null);

const metricsSource = fs.readFileSync("scanner2/offline-metrics.js", "utf8");
assert.doesNotMatch(metricsSource, /accuracy/i, "legacy comparison metrics must be named agreement, not accuracy");

console.log("PASS: Scanner 2.0 offline metrics use explicit denominators and agreement terminology");
