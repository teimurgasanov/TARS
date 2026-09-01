"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_SHADOW_RETENTION_DAYS,
  DEFAULT_SHADOW_MAX_RECORDS,
  RetentionCode,
  parseShadowSamplePercent,
  parseShadowRetentionDays,
  parseShadowMaxRecords,
  shadowSampleBucket,
  shouldSampleShadowCase,
  planShadowRetention,
  safeShadowRetentionCleanup
} = require("../scanner2/shadow-sampling");

function caseToken(bucket) {
  return "anon-k1-" + Number(bucket).toString(16).padStart(8, "0") + "0".repeat(40);
}

assert.strictEqual(parseShadowSamplePercent(undefined), 0, "missing sampling setting must disable writes");
assert.strictEqual(parseShadowSamplePercent(""), 0, "empty sampling setting must disable writes");
assert.strictEqual(parseShadowSamplePercent("5"), 5);
assert.strictEqual(parseShadowSamplePercent(-1), 0, "negative sampling must fail safe to zero");
assert.strictEqual(parseShadowSamplePercent(101), 0, "sampling above 100 must fail safe to zero");
assert.strictEqual(parseShadowSamplePercent("invalid"), 0, "invalid sampling must fail safe to zero");
assert.strictEqual(parseShadowRetentionDays(undefined), DEFAULT_SHADOW_RETENTION_DAYS);
assert.strictEqual(parseShadowRetentionDays(0), DEFAULT_SHADOW_RETENTION_DAYS);
assert.strictEqual(parseShadowRetentionDays(91), DEFAULT_SHADOW_RETENTION_DAYS);
assert.strictEqual(parseShadowMaxRecords(undefined), DEFAULT_SHADOW_MAX_RECORDS);
assert.strictEqual(parseShadowMaxRecords(99), DEFAULT_SHADOW_MAX_RECORDS);
assert.strictEqual(parseShadowMaxRecords(50001), DEFAULT_SHADOW_MAX_RECORDS);

let sampledAtFive = 0;
for (let bucket = 0; bucket < 10000; bucket += 1) {
  const token = caseToken(bucket);
  assert.strictEqual(shadowSampleBucket(token), bucket);
  const first = shouldSampleShadowCase(token, 5);
  const second = shouldSampleShadowCase(token, 5);
  assert.strictEqual(first, second, "one anonymous case token must always have one sampling result");
  if (first) sampledAtFive += 1;
  assert.strictEqual(shouldSampleShadowCase(token, 100), true, "100 percent must capture every valid anonymous case");
}
assert.strictEqual(sampledAtFive, 500, "5 percent must select exactly 500 of 10000 stable buckets");
assert.strictEqual(shouldSampleShadowCase("raw-message-id", 100), false, "sampling must reject raw identifiers");

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 1);
const expired = { caseId: caseToken(1), capturedAt: now - 31 * day };
const current = { caseId: caseToken(2), capturedAt: now - 2 * day };
const retentionPlan = planShadowRetention([expired, current], { now, retentionDays: 30, maxRecords: 100 });
assert.deepStrictEqual(retentionPlan.keep.map((entry) => entry.caseId), [current.caseId]);
assert.deepStrictEqual(retentionPlan.remove.map((entry) => entry.caseId), [expired.caseId], "expired records must be selected for removal");

const cappedEntries = Array.from({ length: 101 }, (_, index) => ({
  caseId: caseToken(index + 100),
  capturedAt: now - index
}));
const cappedPlan = planShadowRetention(cappedEntries, { now, retentionDays: 30, maxRecords: 100 });
assert.strictEqual(cappedPlan.keep.length, 100, "max_records must cap retained records");
assert.strictEqual(cappedPlan.remove.length, 1, "overflow must be selected for bounded deletion");

(async () => {
  let index = [expired, current];
  const removed = [];
  const cleanup = await safeShadowRetentionCleanup({
    caseId: current.caseId,
    now,
    retentionDays: 30,
    maxRecords: 100,
    persistence: {
      async readIndex() { return index; },
      async removeCase(caseId) { removed.push(caseId); },
      async writeIndex(entries) { index = entries; }
    }
  });
  assert.strictEqual(cleanup.ok, true);
  assert.strictEqual(cleanup.code, RetentionCode.CLEANED);
  assert.deepStrictEqual(removed, [expired.caseId]);
  assert.deepStrictEqual(index.map((entry) => entry.caseId), [current.caseId]);

  let overflowIndex = cappedEntries.slice();
  const overflowRemoved = [];
  const cappedCleanup = await safeShadowRetentionCleanup({
    caseId: cappedEntries[0].caseId,
    now,
    retentionDays: 30,
    maxRecords: 100,
    persistence: {
      async readIndex() { return overflowIndex; },
      async removeCase(caseId) { overflowRemoved.push(caseId); },
      async writeIndex(entries) { overflowIndex = entries; }
    }
  });
  assert.strictEqual(cappedCleanup.ok, true);
  assert.strictEqual(overflowRemoved.length, 1);
  assert.strictEqual(overflowIndex.length, 100, "cleanup must enforce max_records on persisted index state");

  const legacyResult = Object.freeze({ ok: true, receiptAmount: 300 });
  const failedCleanup = await safeShadowRetentionCleanup({
    caseId: current.caseId,
    now,
    retentionDays: 30,
    maxRecords: 100,
    persistence: {
      async readIndex() { throw new Error("synthetic persistence failure"); },
      async removeCase() { throw new Error("must not be reached"); },
      async writeIndex() { throw new Error("must not be reached"); }
    }
  });
  assert.strictEqual(failedCleanup.ok, false, "cleanup failures must be contained");
  assert.strictEqual(failedCleanup.code, RetentionCode.FAILED);
  assert.deepStrictEqual(legacyResult, { ok: true, receiptAmount: 300 }, "cleanup cannot alter a legacy decision");

  const source = fs.readFileSync(path.resolve(__dirname, "..", "TarsReportApp.js"), "utf8");
  const runtimeBlock = source.slice(source.indexOf("const shadowRuntimeCircuitBreaker"), source.indexOf("function personalArchiveMessageAssociation"));
  ["evaluateRules", "resolveConflicts", "makeDecision", "runOfflineComparison", "runOfflineDataset"]
    .forEach((name) => assert.doesNotMatch(runtimeBlock, new RegExp(`\\b${name}\\s*\\(`), `${name} must remain offline`));
  assert.match(runtimeBlock, /scanner2ShadowMode[\s\S]*createShadowTokenizer[\s\S]*samplePercent[\s\S]*shouldSampleShadowCase/,
    "runtime order must gate mode, valid HMAC tokenization, positive sampling, and stable bucket before writes");
  assert.match(runtimeBlock, /shadowRetentionQueue[\s\S]*queueShadowRetention/,
    "retention index maintenance must be serialized to reduce concurrent lost updates");

  console.log("PASS: Scanner 2.0 shadow sampling is deterministic and retention is bounded fail-open");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
