"use strict";

const assert = require("assert");
const fs = require("fs");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const helperStart = source.indexOf("function rightRotate(value, amount)");
const helperEnd = source.indexOf("function hexBytes(value)", helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, "TARS Memory V1 helpers missing");

class Association {
  constructor(model, key) {
    this.model = model;
    this.key = key;
  }
}

const helpers = new Function("RocketChatAssociationRecord", "RocketChatAssociationModel", `${source.slice(helperStart, helperEnd)}\nreturn {
  createTarsTraceV1, emitTarsTraceV1, tarsMemoryCaseTokenV1,
  sanitizeTarsMemoryEvidenceV1, sanitizeTarsMemoryCaseV1,
  captureTarsMemoryReceiptEvidenceV1, tarsMemoryCaseFromTraceV1, retrieveTarsMemoryV1, writeTarsMemoryCaseV1,
  scheduleTarsMemoryCaseV1, scheduleTarsMemoryFromTraceV1,
  scheduleTarsMemoryHumanReceiptConfirmationV1,
  analyzeTarsMemoryCasesV1, runTarsMemoryBackgroundAnalysisV1,
  tarsMemoryGoldenDatasetV1, evaluateTarsMemoryGoldenDatasetV1,
  resetTarsMemoryV1ForTests
};`)(Association, { MISC: "misc" });

function createStore(initial = {}) {
  const records = new Map(Object.entries(initial));
  const calls = { reads: 0, updates: 0, removes: 0 };
  const read = {
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          calls.reads += 1;
          const value = records.get(association.key);
          if (value instanceof Error) throw value;
          return value ? [JSON.parse(JSON.stringify(value))] : [];
        }
      };
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      calls.updates += 1;
      records.set(association.key, JSON.parse(JSON.stringify(value)));
    },
    async removeByAssociation(association) {
      calls.removes += 1;
      records.delete(association.key);
    }
  };
  return { read, persistence, records, calls };
}

function memoryCase(overrides = {}) {
  return {
    caseToken: helpers.tarsMemoryCaseTokenV1(overrides.seed || "synthetic-case"),
    caseType: "receipt",
    classification: "receipt",
    outcome: "control",
    reasonCode: "provider_disagreement",
    providerOutcome: "success",
    agreement: "disagree",
    amount: 1300,
    date: "2026-09-05",
    status: "success",
    confirmationState: "observed",
    ...overrides
  };
}

async function flushQueue() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

(async () => {
  assert.match(helpers.tarsMemoryCaseTokenV1("same"), /^mem_[a-f0-9]{32}$/);
  assert.strictEqual(helpers.tarsMemoryCaseTokenV1("same"), helpers.tarsMemoryCaseTokenV1("same"), "case tokens must be stable");
  assert.notStrictEqual(helpers.tarsMemoryCaseTokenV1("same"), helpers.tarsMemoryCaseTokenV1("other"));

  const rawSecrets = {
    messageId: "raw-message-id", uploadId: "raw-upload-id", roomId: "raw-room-id", senderId: "raw-sender-id",
    filename: "receipt-secret.jpg", url: "https://private.invalid/upload", ocrText: "raw OCR 4111111111111111",
    base64: "cHJpdmF0ZQ==", receiptIdentity: "raw-receipt-identity", exactHash: "raw-exact-hash",
    visualHash: "raw-visual-hash", providerResponse: "raw-provider-response", apiKey: "secret-api-key",
    cardNumber: "4111111111111111", accountNumber: "40817810000000000000", phone: "+79990000000"
  };
  const safe = helpers.sanitizeTarsMemoryCaseV1({ ...memoryCase(), ...rawSecrets });
  assert(safe, "valid memory case must sanitize");
  assert.deepStrictEqual(Object.keys(safe), [
    "schema_version", "decision_version", "app_version", "case_token", "case_type",
    "normalized_classification", "production_outcome", "reason_code", "provider_outcome", "agreement",
    "normalized_amount", "normalized_date", "normalized_status", "confirmation_state", "trusted",
    "correction_kind", "source_trace_token", "created_at_ms", "updated_at_ms", "occurrence_count", "memory_evidence"
  ]);
  const safeSerialized = JSON.stringify(safe);
  for (const forbidden of Object.values(rawSecrets)) {
    assert(!safeSerialized.includes(String(forbidden)), `private value persisted: ${forbidden}`);
  }
  assert(safeSerialized.length <= 2048, "memory record must be bounded");
  assert.strictEqual(safe.schema_version, "tars-memory-v1");
  assert.strictEqual(safe.decision_version, 1);
  assert.strictEqual(safe.app_version, "0.10.35");

  for (const confirmationState of ["observed", "production_confirmed"]) {
    assert.strictEqual(helpers.sanitizeTarsMemoryCaseV1(memoryCase({ confirmationState })).trusted, false, `${confirmationState} must not be trusted truth`);
  }
  for (const confirmationState of ["human_confirmed", "golden"]) {
    assert.strictEqual(helpers.sanitizeTarsMemoryCaseV1(memoryCase({ confirmationState, correctionKind: "amount" })).trusted, true, `${confirmationState} must be trusted`);
  }
  assert.strictEqual(helpers.sanitizeTarsMemoryCaseV1(memoryCase({ caseToken: "raw-id" })), undefined, "raw IDs must not be accepted as case tokens");

  const trace = helpers.createTarsTraceV1();
  helpers.emitTarsTraceV1(null, trace, {
    component: "receipt_resolution", stage: "strict_receipt_decision", event: "decision", outcome: "control",
    reason_code: "STRICT_REJECT", ids: { upload: "raw-upload-id" }
  });
  trace.memoryReceiptEvidence.push({ amount: 1300, date: "2026-09-05", status: "success", provider_outcome: "success", agreement: "disagree", outcome: "control" });
  const traced = helpers.tarsMemoryCaseFromTraceV1(trace);
  assert(traced);
  assert.strictEqual(traced.confirmation_state, "observed");
  assert.strictEqual(traced.trusted, false);
  assert(!JSON.stringify(traced).includes("raw-upload-id"));
  const providerTrace = helpers.createTarsTraceV1();
  assert.strictEqual(helpers.captureTarsMemoryReceiptEvidenceV1(providerTrace, { ok: true, receiptAmount: 900, receiptDate: "2026-09-05" }, { receipt_openai_transport: "2xx", yandex_layout_result: "error" }), true);
  assert.strictEqual(providerTrace.memoryReceiptEvidence[0].provider_outcome, "success");

  const disabledStore = createStore();
  assert.strictEqual(await helpers.writeTarsMemoryCaseV1(memoryCase(), disabledStore.read, null, {}), false);
  assert.strictEqual(helpers.scheduleTarsMemoryCaseV1(memoryCase(), disabledStore.read, disabledStore.persistence, { writeEnabled: false }), false);
  assert.deepStrictEqual(disabledStore.calls, { reads: 0, updates: 0, removes: 0 }, "Memory OFF must perform no writes");

  const noMatch = await helpers.retrieveTarsMemoryV1(disabledStore.read, memoryCase(), { enabled: true });
  assert.deepStrictEqual(noMatch, {
    match_count: 0, similarity_bucket: "none", historical_outcome: "unknown",
    historical_error_pattern: "none", memory_confidence: 0
  });
  assert(!Object.prototype.hasOwnProperty.call(noMatch, "authority"));
  assert(!Object.prototype.hasOwnProperty.call(noMatch, "decision"));

  const idempotentStore = createStore();
  const confirmed = memoryCase({ confirmationState: "human_confirmed", correctionKind: "amount", outcome: "accepted", reasonCode: "manual_correction", amount: 1900 });
  assert.strictEqual(await helpers.writeTarsMemoryCaseV1(confirmed, idempotentStore.read, idempotentStore.persistence), true);
  assert.strictEqual(await helpers.writeTarsMemoryCaseV1(memoryCase({ amount: 2600 }), idempotentStore.read, idempotentStore.persistence), true);
  const stored = idempotentStore.records.get(`tars-memory-v1:case:${confirmed.caseToken}`);
  assert.strictEqual(stored.occurrence_count, 2, "retry must update one idempotent case");
  assert.strictEqual(stored.trusted, true, "an observation must not demote confirmed memory");
  assert.strictEqual(stored.normalized_amount, 1900, "an observation must not overwrite a confirmed correction");
  assert.strictEqual(stored.production_outcome, "accepted");
  assert.strictEqual(idempotentStore.records.size, 2, "one case plus one index record expected");

  const evidence = await helpers.retrieveTarsMemoryV1(idempotentStore.read, confirmed, { enabled: true });
  assert.strictEqual(evidence.match_count, 1);
  assert(evidence.memory_confidence <= 0.89, "memory confidence must remain below strict authority");
  assert(!Object.prototype.hasOwnProperty.call(evidence, "amount"));
  assert(!Object.prototype.hasOwnProperty.call(evidence, "date"));

  const brokenRead = { getPersistenceReader() { return { async readByAssociation() { throw new Error("read failed"); } }; } };
  const brokenPersistence = { async updateByAssociation() { throw new Error("write failed"); }, async removeByAssociation() { throw new Error("remove failed"); } };
  assert.deepStrictEqual(await helpers.retrieveTarsMemoryV1(brokenRead, memoryCase(), { enabled: true }), noMatch, "retrieval failure must fail open");
  assert.strictEqual(await helpers.writeTarsMemoryCaseV1(memoryCase(), brokenRead, brokenPersistence), false, "persistence failure must fail open");
  assert.strictEqual(await helpers.runTarsMemoryBackgroundAnalysisV1(brokenRead, brokenPersistence, { enabled: true }), false, "background failure must fail open");

  const boundedEntries = [];
  const boundedNow = Date.now();
  for (let index = 0; index < 500; index += 1) {
    boundedEntries.push(helpers.sanitizeTarsMemoryCaseV1(memoryCase({ seed: `bounded-${index}`, updatedAt: boundedNow - index, confirmationState: "human_confirmed", correctionKind: "amount" })));
  }
  const boundedStore = createStore({ "tars-memory-v1:index": { schema_version: "tars-memory-v1", updated_at_ms: 1, entries: boundedEntries } });
  assert.strictEqual(await helpers.writeTarsMemoryCaseV1(memoryCase({ seed: "bounded-new", updatedAt: Date.now() }), boundedStore.read, boundedStore.persistence), true);
  assert.strictEqual(boundedStore.records.get("tars-memory-v1:index").entries.length, 500, "case persistence must remain bounded");

  const lookupEntries = [];
  for (let index = 0; index < 50; index += 1) lookupEntries.push(helpers.sanitizeTarsMemoryCaseV1(memoryCase({ seed: `lookup-${index}`, caseType: "work_photo", confirmationState: "human_confirmed", correctionKind: "classification" })));
  lookupEntries.push(helpers.sanitizeTarsMemoryCaseV1(memoryCase({ seed: "lookup-hidden", confirmationState: "human_confirmed", correctionKind: "amount" })));
  const lookupStore = createStore({ "tars-memory-v1:index": { entries: lookupEntries, updated_at_ms: Date.now() } });
  assert.strictEqual((await helpers.retrieveTarsMemoryV1(lookupStore.read, memoryCase(), { enabled: true })).match_count, 0, "lookup must inspect at most 50 cases");

  helpers.resetTarsMemoryV1ForTests();
  let releaseFirst;
  const blockedPersistence = {
    updateByAssociation() { return new Promise((resolve) => { if (!releaseFirst) releaseFirst = resolve; else resolve(); }); },
    async removeByAssociation() {}
  };
  const queueRead = createStore().read;
  const scheduled = [];
  for (let index = 0; index < 26; index += 1) scheduled.push(helpers.scheduleTarsMemoryCaseV1(memoryCase({ seed: `queue-${index}` }), queueRead, blockedPersistence, { writeEnabled: true }));
  assert.strictEqual(scheduled.filter(Boolean).length, 25, "memory queue must be bounded at 25");
  await flushQueue();
  if (releaseFirst) releaseFirst();
  await flushQueue();
  helpers.resetTarsMemoryV1ForTests();

  const productionControl = Object.freeze({ ok: false, outcome: "control", amount: undefined, date: "2026-09-05" });
  const productionDuplicate = Object.freeze({ ok: false, outcome: "duplicate", duplicate: true });
  const financialState = { total: 12345, payroll: 6789, reports: 4 };
  const beforeControl = JSON.stringify(productionControl);
  const beforeDuplicate = JSON.stringify(productionDuplicate);
  const beforeFinancial = JSON.stringify(financialState);
  const parityStore = createStore();
  helpers.scheduleTarsMemoryCaseV1(memoryCase({ seed: "parity-off" }), parityStore.read, parityStore.persistence, { writeEnabled: false });
  helpers.scheduleTarsMemoryCaseV1(memoryCase({ seed: "parity-on" }), parityStore.read, parityStore.persistence, { writeEnabled: true, retrievalEnabled: true });
  await flushQueue();
  assert.strictEqual(JSON.stringify(productionControl), beforeControl, "Memory cannot ACCEPT or rewrite strict CONTROL");
  assert.strictEqual(JSON.stringify(productionDuplicate), beforeDuplicate, "Memory cannot override duplicate");
  assert.strictEqual(JSON.stringify(financialState), beforeFinancial, "Memory cannot change totals, payroll or reports");

  const recommendations = helpers.analyzeTarsMemoryCasesV1([
    memoryCase({ seed: "r1", reasonCode: "provider_disagreement" }),
    memoryCase({ seed: "r2", reasonCode: "provider_disagreement" }),
    memoryCase({ seed: "r3", reasonCode: "exact_duplicate", outcome: "duplicate" }),
    memoryCase({ seed: "r4", reasonCode: "exact_duplicate", outcome: "duplicate" })
  ]);
  assert.deepStrictEqual(recommendations.map((entry) => entry.severity).sort(), ["p0", "p0"]);
  assert(!JSON.stringify(recommendations).includes("raw"));
  const backgroundStore = createStore({ "tars-memory-v1:index": { entries: [stored, { ...stored, case_token: helpers.tarsMemoryCaseTokenV1("background-2") }], updated_at_ms: Date.now() } });
  assert.strictEqual(await helpers.runTarsMemoryBackgroundAnalysisV1(backgroundStore.read, backgroundStore.persistence, { enabled: false }), false);
  assert.strictEqual(await helpers.runTarsMemoryBackgroundAnalysisV1(backgroundStore.read, backgroundStore.persistence, { enabled: true }), true);
  const persistedRecommendations = backgroundStore.records.get("tars-memory-v1:recommendations");
  assert(persistedRecommendations && Array.isArray(persistedRecommendations.recommendations));
  assert.deepStrictEqual(Object.keys(persistedRecommendations), ["schema_version", "decision_version", "generated_at_ms", "recommendations"]);

  const golden = helpers.tarsMemoryGoldenDatasetV1();
  assert.deepStrictEqual(golden.map((entry) => entry.category), [
    "receipt_amount", "receipt_date", "receipt_photo_classification", "duplicate",
    "media_settle", "routing", "control", "provider_disagreement"
  ]);
  assert.strictEqual(golden[0].golden_case, "amount_currency_suffix_1900");
  assert.strictEqual(golden[0].expected_normalized_amount, 1900);
  assert.strictEqual(golden.find((entry) => entry.category === "duplicate").expected_safety, "duplicate");
  assert.deepStrictEqual(helpers.evaluateTarsMemoryGoldenDatasetV1((entry) => entry.expected_safety), { pass: true, total: 8, failed: 0 });
  assert.strictEqual(helpers.evaluateTarsMemoryGoldenDatasetV1(() => "unsafe").pass, false, "golden regression must block the gate");

  const started = Date.now();
  for (let index = 0; index < 2000; index += 1) helpers.sanitizeTarsMemoryCaseV1(memoryCase({ seed: `perf-${index}` }));
  assert(Date.now() - started < 1000, "memory sanitizer exceeded its local performance budget");

  const memoryBlock = source.slice(source.indexOf("const TARS_MEMORY_V1_SCHEMA_VERSION"), source.indexOf("function hexBytes(value)"));
  assert(!/https?:|\.post\(|\.get\(|requestOpenAi|requestYandex|publishAccepted|publishRejected|modify|getCreator|getNotifier/i.test(memoryBlock), "Memory helpers must not call providers, publishers or modifiers");
  assert(!/await\s+(?:G\.)?scheduleTarsMemory/.test(source), "Memory scheduling must never add a required production await");
  assert.match(source, /id: "tars_memory_v1_write_enabled",[\s\S]*?packageValue: false/);
  assert.match(source, /id: "tars_memory_v1_retrieval_advisory_enabled",[\s\S]*?packageValue: false/);
  assert.match(source, /id: "tars_memory_v1_background_enabled",[\s\S]*?packageValue: false/);

  const postStart = source.indexOf("async executePostMessageSent(e, n, t, s, r)");
  const postEnd = source.indexOf("async receiptOcrConfig(e)", postStart);
  const postSource = source.slice(postStart, postEnd);
  assert(postSource.includes("G.scheduleTarsMemoryFromTraceV1(trace, n, s, traceLogger);"));
  assert(postSource.indexOf("G.scheduleTarsMemoryFromTraceV1") > postSource.indexOf('stage: "terminal_outcome"'), "case memory must run after the production terminal event");

  const approvalCommand = source.slice(source.indexOf("async handleApproveReceiptCommand"), source.indexOf("async handleApproveReceiptButton"));
  const approvalButton = source.slice(source.indexOf("async handleApproveReceiptButton"), source.indexOf("photoReportIntentAssociation"));
  for (const approval of [approvalCommand, approvalButton]) {
    assert(approval.includes("G.scheduleTarsMemoryHumanReceiptConfirmationV1("));
    assert(!/await\s+G\.scheduleTarsMemoryHumanReceiptConfirmationV1/.test(approval), "human-confirmed memory write must remain asynchronous");
  }

  const confirmationSource = source.slice(source.indexOf("function scheduleTarsMemoryHumanReceiptConfirmationV1"), source.indexOf("function tarsMemoryRecommendationForGroupV1"));
  assert(confirmationSource.includes('confirmationState: "human_confirmed"'));
  assert(confirmationSource.includes('reasonCode: "manual_correction"'));

  console.log("PASS: TARS Memory V1 is privacy-safe, bounded, idempotent, advisory-only and fail-open");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
