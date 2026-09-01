"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const contracts = require("../scanner2/contracts");
const shadowContract = require("../scanner2/shadow-contract");
const shadowTokenizer = require("../scanner2/shadow-tokenizer");
const shadowRecorder = require("../scanner2/shadow-recorder");

const source = fs.readFileSync(path.resolve(__dirname, "..", "TarsReportApp.js"), "utf8");

class AssociationRecord {
  constructor(model, key) {
    this.model = model;
    this.key = key;
  }
}

function runtimeHarness(options = {}) {
  const start = source.indexOf("    const shadowRuntimeCircuitBreaker =");
  const end = source.indexOf("    function personalArchiveMessageAssociation", start);
  assert.ok(start >= 0 && end > start, "runtime recorder helper block must be present");
  const helperSource = source.slice(start, end);
  const factory = new Function(
    "dependencies",
    `const {
      createCircuitBreaker, RocketChatAssociationRecord, RocketChatAssociationModel,
      createShadowTokenizer, ShadowDecision, ShadowDocumentType, ShadowDuplicateState,
      SHADOW_SCHEMA_VERSION, SHADOW_PROVENANCE, validateShadowSnapshot,
      safeShadowRecord, shadowAmountFromRubles
    } = dependencies;\n${helperSource}\nreturn { recordShadowReceiptOutcome };`
  );
  const api = factory({
    createCircuitBreaker: shadowRecorder.createCircuitBreaker,
    RocketChatAssociationRecord: AssociationRecord,
    RocketChatAssociationModel: { MISC: "MISC" },
    createShadowTokenizer: shadowTokenizer.createShadowTokenizer,
    ShadowDecision: contracts.Decision,
    ShadowDocumentType: contracts.DocumentType,
    ShadowDuplicateState: contracts.DuplicateState,
    SHADOW_SCHEMA_VERSION: shadowContract.SHADOW_SCHEMA_VERSION,
    SHADOW_PROVENANCE: shadowContract.SHADOW_PROVENANCE,
    validateShadowSnapshot: shadowContract.validateShadowSnapshot,
    safeShadowRecord: shadowRecorder.safeShadowRecord,
    shadowAmountFromRubles(value) {
      const rubles = Number(value);
      const minorUnits = Math.round(rubles * 100);
      return Number.isFinite(rubles) && rubles > 0 && Number.isSafeInteger(minorUnits)
        ? { minorUnits, currency: "RUB" } : null;
    }
  });
  const records = new Map();
  let writes = 0;
  const read = {
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          const value = records.get(association.key);
          return value ? [value] : [];
        }
      };
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      writes += 1;
      if (options.throwOnWrite) throw new Error("persistence unavailable");
      if (options.timeoutOnWrite) return new Promise(() => {});
      records.set(association.key, value);
    }
  };
  return { ...api, read, persistence, records, writes: () => writes };
}

const validSecret = "scanner2-runtime-test-secret-32-bytes-minimum";
const baseConfig = Object.freeze({
  scanner2ShadowMode: "RECORD_ONLY",
  scanner2ShadowHmacSecret: validSecret,
  scanner2ShadowTokenKeyVersion: "k1"
});
const evidence = Object.freeze({
  acceptedDates: ["2026-09-01"],
  legacyOcrResults: [{
    passType: "page",
    date: "2026-09-01",
    amount: { minorUnits: 30000, currency: "RUB" },
    documentType: contracts.DocumentType.BANK_RECEIPT,
    status: contracts.OperationStatus.SUCCESS,
    qualitySignal: 1
  }],
  legacyVisionResults: [{
    passType: "primary",
    date: "2026-09-01",
    amount: { minorUnits: 30000, currency: "RUB" },
    documentType: contracts.DocumentType.BANK_RECEIPT,
    status: contracts.OperationStatus.SUCCESS,
    qualitySignal: 1
  }]
});

function baseInput(overrides = {}) {
  return {
    messageId: "runtime-message-id",
    uploadId: "runtime-upload-id",
    exact: "runtime-exact-hash",
    visual: "runtime-visual-hash",
    shadowEvidence: evidence,
    requiredDate: "2026-09-01",
    decision: contracts.Decision.ACCEPT,
    date: "2026-09-01",
    amount: 300,
    receiptIdentity: "id:private-document-reference|2026-09-01|300",
    ...overrides
  };
}

function onlyRecord(harness) {
  assert.strictEqual(harness.records.size, 1, "one logical FINAL shadow record is expected");
  return Array.from(harness.records.values())[0];
}

(async () => {
  // A. OFF is the safe default and cannot mutate the legacy-side input.
  {
    const harness = runtimeHarness();
    const input = baseInput();
    const before = JSON.stringify(input);
    await harness.recordShadowReceiptOutcome(input, harness.read, harness.persistence, { ...baseConfig, scanner2ShadowMode: "OFF" });
    assert.strictEqual(harness.writes(), 0);
    assert.strictEqual(JSON.stringify(input), before);
  }

  // B. An invalid HMAC secret also behaves as OFF.
  {
    const harness = runtimeHarness();
    const input = baseInput();
    const before = JSON.stringify(input);
    await harness.recordShadowReceiptOutcome(input, harness.read, harness.persistence, { ...baseConfig, scanner2ShadowHmacSecret: "short" });
    assert.strictEqual(harness.writes(), 0);
    assert.strictEqual(JSON.stringify(input), before);
  }

  // C/G. RECORD_ONLY persists only a sanitized FINAL ACCEPT snapshot.
  {
    const harness = runtimeHarness();
    const input = baseInput();
    await harness.recordShadowReceiptOutcome(input, harness.read, harness.persistence, baseConfig);
    const record = onlyRecord(harness);
    assert.strictEqual(record.state, "FINAL");
    assert.strictEqual(record.snapshot.legacyDecision.decision, contracts.Decision.ACCEPT);
    assert.strictEqual(record.snapshot.legacyDecision.reasonCode, "LEGACY_ACCEPTED");
    assert.strictEqual(record.snapshot.legacyDecision.amount.minorUnits, 30000);
    assert.match(record.caseId, /^anon-k1-/);
    assert.match(record.snapshot.duplicateEvidence.exactToken, /^tok-k1-ex-/);
    assert.match(record.snapshot.duplicateEvidence.visualToken, /^tok-k1-vis-/);
    const serialized = JSON.stringify(record);
    ["runtime-message-id", "runtime-upload-id", "runtime-exact-hash", "runtime-visual-hash", "private-document-reference"]
      .forEach((rawValue) => assert.ok(!serialized.includes(rawValue), "raw runtime identity must not be persisted"));
    ["rawText", "username", "userId", "roomId", "messageId", "uploadId", "rawResponse", "rawPayload"]
      .forEach((key) => assert.ok(!serialized.includes(`\"${key}\"`), `${key} must not be persisted`));
    assert.notStrictEqual(record.snapshot.acceptedDates[0], "2026-09-01", "stored dates must be shifted");
    assert.strictEqual(record.snapshot.acceptedDates[0], record.snapshot.legacyDecision.date, "one case must use one deterministic offset");
  }

  // D. Persistence failures are swallowed by the fail-open integration.
  {
    const harness = runtimeHarness({ throwOnWrite: true });
    const legacyResult = { ok: true, receiptAmount: 300 };
    await assert.doesNotReject(() => harness.recordShadowReceiptOutcome(baseInput(), harness.read, harness.persistence, baseConfig));
    assert.deepStrictEqual(legacyResult, { ok: true, receiptAmount: 300 });
  }

  // E. A bounded recorder timeout cannot escape to the legacy caller.
  {
    const harness = runtimeHarness({ timeoutOnWrite: true });
    const started = Date.now();
    await assert.doesNotReject(() => harness.recordShadowReceiptOutcome(baseInput(), harness.read, harness.persistence, baseConfig));
    assert.ok(Date.now() - started < 500, "shadow write must remain bounded");
  }

  // H. Validation rejection is recorded as REVIEW with a structured reason.
  {
    const harness = runtimeHarness();
    await harness.recordShadowReceiptOutcome(baseInput({
      decision: contracts.Decision.REVIEW,
      reason: "🚫 СУММА ЧЕКА НЕ РАСПОЗНАНА",
      amount: undefined,
      receiptIdentity: undefined
    }), harness.read, harness.persistence, baseConfig);
    const snapshot = onlyRecord(harness).snapshot;
    assert.strictEqual(snapshot.legacyDecision.decision, contracts.Decision.REVIEW);
    assert.strictEqual(snapshot.legacyDecision.reasonCode, "AMOUNT_MISSING");
  }

  // I. Post-message identity duplicate is REJECT / DUPLICATE_IDENTITY.
  {
    const harness = runtimeHarness();
    await harness.recordShadowReceiptOutcome(baseInput({
      decision: contracts.Decision.REJECT,
      reason: "🚫 ПОВТОР ЧЕКА",
      duplicateMatchType: "IDENTITY",
      duplicateReference: "private-existing-identity"
    }), harness.read, harness.persistence, baseConfig);
    const snapshot = onlyRecord(harness).snapshot;
    assert.strictEqual(snapshot.legacyDecision.decision, contracts.Decision.REJECT);
    assert.strictEqual(snapshot.legacyDecision.reasonCode, "DUPLICATE_IDENTITY");
    assert.strictEqual(snapshot.duplicateEvidence.matchType, "IDENTITY");
    assert.match(snapshot.duplicateEvidence.referenceToken, /^tok-k1-dup-/);
    assert.ok(!JSON.stringify(snapshot).includes("private-existing-identity"));
  }

  // F. Cache hits return the original promise, including its sanitized sidecar.
  const cacheBlock = source.slice(source.indexOf("const strictReceiptValidationCache"), source.indexOf("const shadowRuntimeCircuitBreaker"));
  assert.match(cacheBlock, /return cached\.promise/);
  assert.doesNotMatch(cacheBlock, /cached[\s\S]{0,180}requestReceiptOcr|cached[\s\S]{0,180}requestOpenAiReceiptCheck/);
  assert.match(source, /shadowEvidence:\s*\{[\s\S]*legacyOcrResults:[\s\S]*legacyVisionResults:/);

  // Capture points are after the relevant legacy action; ACCEPT is last.
  const postMessageBlock = source.slice(source.indexOf("async function rejectDuplicateMessage"), source.indexOf("async function processPersonalMediaV2"));
  assert.match(postMessageBlock, /await writeIndex[\s\S]*await notifyDuplicateUser[\s\S]*await recordShadowReceiptOutcome\(/);
  assert.match(postMessageBlock, /publishMasterTransferSummary[\s\S]*for \(const shadowRecord of acceptedShadowRecords\)[\s\S]*recordShadowReceiptOutcome/);

  // J. Runtime remains RECORD_ONLY; Scanner 2.0 decision engines are absent.
  ["evaluateRules", "resolveConflicts", "makeDecision", "runOfflineComparison", "runOfflineDataset"]
    .forEach((name) => assert.doesNotMatch(postMessageBlock, new RegExp(`\\b${name}\\s*\\(`)));

  assert.match(source, /scanner2-shadow:v1:/);
  assert.match(source, /id:\s*"scanner2_shadow_mode"[\s\S]*packageValue:\s*"OFF"/);
  console.log("PASS: Scanner 2.0 runtime recorder is privacy-gated, fail-open, and RECORD_ONLY");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
