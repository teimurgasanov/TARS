"use strict";

const assert = require("assert");
const { DocumentType, OperationStatus, DuplicateState, Decision } = require("../scanner2/contracts");
const { SHADOW_SCHEMA_VERSION, SHADOW_PROVENANCE } = require("../scanner2/shadow-contract");
const { createShadowTokenizer } = require("../scanner2/shadow-tokenizer");
const {
  RecorderCode,
  createCircuitBreaker,
  isOfflineReady,
  safeShadowRecord
} = require("../scanner2/shadow-recorder");

const tokenizer = createShadowTokenizer({ secret: "recorder-test-secret-that-is-at-least-32-bytes", tokenKeyVersion: "k1" });
const amount = { minorUnits: 80000, currency: "RUB" };

function snapshot(final, caseSource = "recorder-case") {
  return {
    schemaVersion: SHADOW_SCHEMA_VERSION,
    caseId: tokenizer.tokenizeCase(caseSource),
    provenance: SHADOW_PROVENANCE,
    captureBucket: "2026-W36",
    acceptedDates: ["2026-09-01"],
    legacyOcrResults: [{
      passType: "page",
      date: "2026-09-01",
      amount,
      documentType: DocumentType.OTHER_FINANCIAL_DOCUMENT,
      status: OperationStatus.SUCCESS,
      qualitySignal: 1
    }],
    legacyVisionResults: [],
    duplicateEvidence: {
      state: DuplicateState.NONE,
      matchType: "NONE",
      referenceToken: null,
      exactToken: tokenizer.tokenizeExact(caseSource + "-exact"),
      visualToken: null
    },
    legacyDecision: final ? {
      decision: Decision.ACCEPT,
      reasonCode: "LEGACY_ACCEPTED",
      date: "2026-09-01",
      amount,
      documentType: DocumentType.BANK_RECEIPT,
      duplicateState: DuplicateState.NONE,
      strongIdentityEvidence: null
    } : null,
    tokenKeyVersion: "k1"
  };
}

function memoryPersistence() {
  const rows = new Map();
  let calls = 0;
  return {
    rows,
    get calls() { return calls; },
    async upsert(incoming, merge) {
      calls += 1;
      const existing = rows.get(incoming.caseId);
      const selected = merge(existing, incoming);
      if (selected === existing) return "UNCHANGED";
      rows.set(incoming.caseId, selected);
      return existing ? "UPDATED" : "CREATED";
    }
  };
}

(async () => {
  const persistence = memoryPersistence();
  const draft = snapshot(false);
  const before = JSON.stringify(draft);
  const draftResult = await safeShadowRecord(draft, { enabled: true, tokenizer, persistence });
  assert.strictEqual(draftResult.code, RecorderCode.RECORDED);
  assert.strictEqual(JSON.stringify(draft), before, "recorder must not mutate its input");
  assert.strictEqual(persistence.rows.size, 1);
  assert.strictEqual(isOfflineReady(persistence.rows.get(draft.caseId)), false, "DRAFT must not be offline-ready");

  const final = snapshot(true);
  const finalResult = await safeShadowRecord(final, { enabled: true, tokenizer, persistence });
  assert.strictEqual(finalResult.state, "FINAL");
  assert.strictEqual(isOfflineReady(persistence.rows.get(final.caseId)), true, "FINAL must replace DRAFT");
  assert.notStrictEqual(persistence.rows.get(final.caseId).snapshot.acceptedDates[0], "2026-09-01", "persisted dates must be shifted");

  const duplicateFinal = await safeShadowRecord(final, { enabled: true, tokenizer, persistence });
  assert.strictEqual(duplicateFinal.code, RecorderCode.UNCHANGED);
  assert.strictEqual(persistence.rows.size, 1, "duplicate FINAL must remain one logical record");

  const lateDraft = await safeShadowRecord(draft, { enabled: true, tokenizer, persistence });
  assert.strictEqual(lateDraft.code, RecorderCode.UNCHANGED);
  assert.strictEqual(isOfflineReady(persistence.rows.get(final.caseId)), true, "DRAFT must not replace FINAL");

  let continued = false;
  const failed = await safeShadowRecord(snapshot(true, "failure-case"), {
    enabled: true,
    tokenizer,
    persistence: { async upsert() { throw new Error("synthetic persistence failure"); } }
  });
  continued = true;
  assert.strictEqual(continued, true, "caller must continue after persistence failure");
  assert.strictEqual(failed.code, RecorderCode.WRITE_FAILED);

  const synchronousFailure = await safeShadowRecord(snapshot(true, "sync-failure-case"), {
    enabled: true,
    tokenizer,
    persistence: { upsert() { throw new Error("synthetic synchronous failure"); } }
  });
  assert.strictEqual(synchronousFailure.code, RecorderCode.WRITE_FAILED);

  const timedOut = await safeShadowRecord(snapshot(true, "timeout-case"), {
    enabled: true,
    tokenizer,
    persistence: { upsert() { return new Promise(() => {}); } },
    writeTimeoutMs: 5
  });
  assert.strictEqual(timedOut.code, RecorderCode.WRITE_TIMEOUT);

  let calls = 0;
  const breaker = createCircuitBreaker({ failureThreshold: 1, cooldownMs: 60000 });
  const failingPersistence = { async upsert() { calls += 1; throw new Error("fail"); } };
  await safeShadowRecord(snapshot(true, "breaker-one"), { enabled: true, tokenizer, persistence: failingPersistence, circuitBreaker: breaker });
  const openResult = await safeShadowRecord(snapshot(true, "breaker-two"), { enabled: true, tokenizer, persistence: failingPersistence, circuitBreaker: breaker });
  assert.strictEqual(openResult.code, RecorderCode.CIRCUIT_OPEN);
  assert.strictEqual(calls, 1, "open circuit must not call persistence");

  const disabled = await safeShadowRecord(snapshot(true, "disabled"), { enabled: false, tokenizer, persistence });
  assert.strictEqual(disabled.code, RecorderCode.OFF);
  const badSecret = await safeShadowRecord(snapshot(true, "bad-secret"), { enabled: true, tokenizer: null, persistence });
  assert.strictEqual(badSecret.code, RecorderCode.OFF);
  const missingPersistence = await safeShadowRecord(snapshot(true, "missing-persistence"), { enabled: true, tokenizer });
  assert.strictEqual(missingPersistence.code, RecorderCode.PERSISTENCE_UNAVAILABLE);

  const malformed = snapshot(true, "malformed");
  malformed.legacyOcrResults[0].amount.minorUnits = NaN;
  const malformedResult = await safeShadowRecord(malformed, { enabled: true, tokenizer, persistence });
  assert.strictEqual(malformedResult.code, RecorderCode.PRIVACY_REJECTED);

  const oversized = snapshot(true, "oversized");
  oversized.acceptedDates = Array.from({ length: 900 }, (_, index) => {
    const date = new Date(Date.UTC(2020, 0, 1 + index));
    return date.toISOString().slice(0, 10);
  });
  const oversizedResult = await safeShadowRecord(oversized, { enabled: true, tokenizer, persistence });
  assert.strictEqual(oversizedResult.code, RecorderCode.PRIVACY_REJECTED);

  console.log("PASS: Stage 3A safe recorder is idempotent, bounded, fail-open, and circuit-breaker protected");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
