"use strict";

const assert = require("assert");
const { loadReceiptCaseHelpers, createStore } = require("./receipt-case-v1-harness");

(async () => {
  const helpers = loadReceiptCaseHelpers();
  helpers.resetReceiptCaseV1ForTests();
  const store = createStore();
  const logs = [];
  const logger = { info(value) { logs.push(String(value)); }, warn(value) { logs.push(String(value)); } };
  const trace = helpers.createTarsTraceV1();
  const privateValues = {
    sourceMessageId: "raw-message-id-private",
    sourceOriginMessageId: "raw-origin-id-private",
    sourceUploadId: "raw-upload-id-private",
    masterId: "raw-master-id-private",
    filename: "private-receipt.jpg",
    url: "https://private.invalid/upload",
    ocrText: "OCR 1900 RUB account 408178100000",
    base64: "cHJpdmF0ZS1pbWFnZQ==",
    exactHash: "private-exact-hash",
    visualHash: "private-visual-hash",
    receiptIdentity: "private-receipt-identity",
    providerResponse: "private-provider-response",
    apiKey: "private-api-key"
  };

  const created = await helpers.findOrCreateReceiptCaseV1({ ...privateValues, sourceType: "original" }, store.read, store.persistence, {}, logger, trace);
  assert(created);
  await helpers.transitionReceiptCaseV1(created.caseId, {
    state: "PROCESSING",
    strictDecision: "unknown"
  }, store.read, store.persistence, {}, logger, trace);
  const accepted = await helpers.transitionReceiptCaseV1(created.caseId, {
    ...privateValues,
    state: "ACCEPTED",
    strictDecision: "accept",
    normalizedAmount: 1900,
    normalizedDate: "2026-09-05"
  }, store.read, store.persistence, {}, logger, trace);
  assert(accepted);

  assert.deepStrictEqual(Object.keys(accepted), [
    "schemaVersion", "caseId", "sourceMessageCorrelation", "sourceUploadCorrelation",
    "masterCorrelation", "state", "strictDecision", "controlReason",
    "normalizedAmount", "normalizedDate", "createdAt", "updatedAt", "revision"
  ]);
  const serializedPersistence = JSON.stringify(Array.from(store.records.entries()));
  const serializedLogs = JSON.stringify(logs);
  for (const value of Object.values(privateValues)) {
    assert(!serializedPersistence.includes(String(value)), `private value persisted: ${value}`);
    assert(!serializedLogs.includes(String(value)), `private value logged: ${value}`);
  }
  assert(!serializedLogs.includes(created.caseId), "raw caseId must not be logged");
  assert(logs.some((line) => line.startsWith("TARS_TRACE_V1 ")), "case lifecycle must emit TARS_TRACE_V1");
  const traceEvents = logs.filter((line) => line.startsWith("TARS_TRACE_V1 ")).map((line) => JSON.parse(line.slice("TARS_TRACE_V1 ".length)));
  assert(traceEvents.every((event) => event.stage === "receipt_case"));
  assert(traceEvents.every((event) => /^rcc_[a-f0-9]{16}$/.test(String(event.ids.case || ""))));
  assert(traceEvents.some((event) => event.attrs.to_state === "RECEIVED"));
  assert(traceEvents.some((event) => event.attrs.to_state === "ACCEPTED"));

  const sanitized = helpers.sanitizeReceiptCaseV1({
    ...privateValues,
    caseId: created.caseId,
    sourceMessageCorrelation: created.sourceMessageCorrelation,
    sourceUploadCorrelation: created.sourceUploadCorrelation,
    masterCorrelation: created.masterCorrelation,
    state: "CONTROL",
    strictDecision: "control",
    controlReason: "arbitrary private reason"
  });
  assert.strictEqual(sanitized.controlReason, "unresolved", "control reason must use a strict allowlist");
  assert(JSON.stringify(sanitized).length <= 2048, "ReceiptCaseV1 records must remain bounded");

  console.log("PASS: ReceiptCaseV1 persistence and trace use strict privacy allowlists");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
