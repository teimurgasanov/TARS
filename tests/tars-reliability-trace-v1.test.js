const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const helperStart = source.indexOf("function rightRotate(value, amount)");
const helperEnd = source.indexOf("function hexBytes(value)", helperStart);
assert(helperStart >= 0 && helperEnd > helperStart, "TARS_TRACE_V1 helpers missing");

const helpers = new Function(`${source.slice(helperStart, helperEnd)}\nreturn { createTarsTraceV1, tarsTraceIdentifierTokenV1, sanitizeTarsTraceEventV1, emitTarsTraceV1, TARS_TRACE_V1_STAGES };`)();
const trace = helpers.createTarsTraceV1();
const nextTrace = helpers.createTarsTraceV1();
assert.match(trace.traceId, /^trc_[a-f0-9]{32}$/);
assert.notStrictEqual(trace.traceId, nextTrace.traceId, "trace IDs must be unique within one runtime");

const raw = {
  message: "raw-message-id",
  origin_message: "raw-origin-message-id",
  upload: "raw-upload-id",
  room: "raw-room-id",
  sender: "raw-sender-id",
  case: "raw-case-id"
};
const event = helpers.sanitizeTarsTraceEventV1(trace, {
  component: "receipt_resolution",
  stage: "strict_receipt_decision",
  event: "decision",
  attempt: 999,
  duration_ms: 9999999,
  outcome: "accepted",
  reason_code: "STRICT_ACCEPT",
  error_class: "none",
  ids: raw,
  attrs: { source_type: "original", intent: "receipt", provider: "yandex_ocr", pass: "ocr", cache: "miss" },
  filename: "secret-receipt.jpg",
  url: "https://private.example/upload",
  ocr_text: "private OCR text",
  base64: "c2VjcmV0",
  receipt_identity: "private-receipt-identity",
  exact_hash: "private-exact-hash",
  provider_response: { private: true },
  api_key: "private-api-key"
});

assert.deepStrictEqual(Object.keys(event), [
  "schema_version", "trace_id", "ts_ms", "component", "stage", "event", "attempt",
  "duration_ms", "outcome", "reason_code", "error_class", "ids", "attrs"
]);
assert.deepStrictEqual(Object.keys(event.ids), ["message", "origin_message", "upload", "room", "sender", "case"]);
assert.deepStrictEqual(Object.keys(event.attrs), ["source_type", "intent", "provider", "pass", "cache", "from_state", "to_state"]);
assert.strictEqual(event.attempt, 20, "attempt must be bounded");
assert.strictEqual(event.duration_ms, 600000, "duration must be bounded");
assert.strictEqual(event.reason_code, "STRICT_ACCEPT", "known Phase 1A reason code must remain observable");
assert.match(event.ids.message, /^msg_[a-f0-9]{16}$/);
assert.match(event.ids.upload, /^upl_[a-f0-9]{16}$/);
assert.notStrictEqual(event.ids.message, raw.message);
assert.strictEqual(helpers.tarsTraceIdentifierTokenV1(trace, "unknown", "value"), null);

const serialized = JSON.stringify(event);
for (const forbidden of [...Object.values(raw), "secret-receipt.jpg", "private.example", "private OCR text", "c2VjcmV0", "private-receipt-identity", "private-exact-hash", "private-api-key"]) {
  assert(!serialized.includes(forbidden), `privacy leak in TARS_TRACE_V1: ${forbidden}`);
}
assert(serialized.length <= 2048, "TARS_TRACE_V1 event must remain bounded");

for (const forbiddenReason of ["RAW_SECRET_ABC123", "MESSAGEIDABC123"]) {
  const rejected = helpers.sanitizeTarsTraceEventV1(trace, {
    reason_code: forbiddenReason,
    ids: { message: forbiddenReason, upload: forbiddenReason, room: forbiddenReason, sender: forbiddenReason },
    attrs: {
      source_type: forbiddenReason,
      intent: forbiddenReason,
      provider: forbiddenReason,
      pass: forbiddenReason,
      cache: forbiddenReason,
      ocr_text: forbiddenReason,
      filename: forbiddenReason,
      url: forbiddenReason,
      base64: forbiddenReason,
      exact_hash: forbiddenReason,
      receipt_identity: forbiddenReason,
      provider_response: forbiddenReason,
      api_key: forbiddenReason
    }
  });
  const rejectedSerialized = JSON.stringify(rejected);
  assert.strictEqual(rejected.reason_code, "UNSPECIFIED", "reason_code must use a strict allowlist");
  assert(!rejectedSerialized.includes(forbiddenReason), `uppercase privacy value leaked: ${forbiddenReason}`);
}

const logs = [];
assert.strictEqual(helpers.emitTarsTraceV1({ info(value) { logs.push(value); } }, trace, event), true);
assert.strictEqual(logs.length, 1);
assert.match(logs[0], /^TARS_TRACE_V1 /);
assert.strictEqual(helpers.emitTarsTraceV1({ info() { throw new Error("logger unavailable"); } }, trace, event), false, "telemetry must fail open");
assert.strictEqual(helpers.emitTarsTraceV1(null, trace, event), false);

const originalStringify = JSON.stringify;
const oversizeLogs = [];
try {
  JSON.stringify = () => "X".repeat(2049);
  assert.strictEqual(helpers.emitTarsTraceV1({ info(value) { oversizeLogs.push(value); } }, trace, event), false, "oversize telemetry must be dropped");
} finally {
  JSON.stringify = originalStringify;
}
assert.strictEqual(oversizeLogs.length, 0, "oversize telemetry must not reach the logger");

const throwingValue = new Proxy({}, { get() { throw new Error("tokenization failed"); } });
assert.strictEqual(helpers.emitTarsTraceV1({ info() {} }, trace, { ids: { message: throwingValue } }), false, "tokenization failure must be fail-open");
const throwingInput = new Proxy({}, { get() { throw new Error("sanitize failed"); } });
assert.strictEqual(helpers.emitTarsTraceV1({ info() {} }, trace, throwingInput), false, "sanitize failure must be fail-open");

assert.deepStrictEqual(helpers.TARS_TRACE_V1_STAGES, [
  "inbound_received", "media_resolution", "intent_gate", "primary_classification",
  "personal_media", "upload_read", "receipt_vision", "receipt_ocr",
  "strict_receipt_decision", "duplicate_exact", "duplicate_identity",
  "routing_decision", "result_publish", "receipt_case", "claim_complete", "terminal_outcome"
]);

const emitterStart = source.indexOf("function emitTarsTraceV1");
const emitterEnd = source.indexOf("const RECEIPT_CASE_V1_SCHEMA_VERSION", emitterStart);
const emitterSource = source.slice(emitterStart, emitterEnd);
assert(!/\bawait\b/.test(emitterSource), "trace emitter must remain synchronous");
assert(!/https?:|persistence|createWithAssociation|updateByAssociation/i.test(emitterSource), "trace emitter must not use network or persistence");
assert(!/await\s+(?:G\.)?emitTarsTraceV1/.test(source), "trace calls must never enter the production await chain");

const handlerStart = source.indexOf("async executePostMessageSent(e, n, t, s, r)");
const handlerEnd = source.indexOf("async receiptOcrConfig(e)", handlerStart);
const handler = source.slice(handlerStart, handlerEnd);
assert(handler.indexOf("G.createTarsTraceV1()") < handler.indexOf("await "), "trace must be created before the first post-message await");
assert(/try \{\s*traceLogger = this\.getLogger\(\);\s*trace = G\.createTarsTraceV1\(\);\s*\} catch/.test(handler), "logger and trace creation must share one fail-open boundary");
assert(!/G\.emitTarsTraceV1\(this\.getLogger\(\)/.test(handler), "trace logger acquisition must not happen outside the fail-open boundary");
assert(handler.includes("resolvePersonalImageMessageV2(e, n, this.getLogger(), hasInitialMediaSignal ? 16 : 6, hasInitialMediaSignal ? 750 : 400, hasInitialMediaSignal, trace)"));
assert(handler.includes("selectedPrimaryDecision = await G.primaryVisionDecisionForPersonalMessage(e, n, t, i, this.getLogger(), primaryRoutingDiagnostic);"));
assert(!handler.includes("primaryVisionDecisionForPersonalMessage(e, n, t, i, this.getLogger(), primaryRoutingDiagnostic, trace)"), "primary Vision Promise boundary must match base");
assert(handler.includes("allowYandexSafetyFallback: explicitPhotoIntent,\n          trace"));
assert(handler.includes("completePostMessageClaim(e, postMessageClaimToken, s, this.getLogger(), trace)"));

const primaryStart = source.indexOf("async function primaryVisionDecisionForPersonalMessage");
const primaryEnd = source.indexOf("async function personalImageIsReceiptForPreUpload", primaryStart);
const primarySource = source.slice(primaryStart, primaryEnd);
assert(!primarySource.includes("emitTarsTraceV1"), "primary Vision helper must keep the base Promise structure");
assert(!primarySource.includes("resultPromise"), "primary Vision helper must not wrap the provider Promise");
assert(primarySource.includes("return primaryVisionDecisionForImage(bestCandidate.file, bestCandidate.content, http, config, logger, diagnostic);"));

const functionSection = (name, nextName) => {
  const start = source.indexOf(name);
  const end = source.indexOf(nextName, start);
  assert(start >= 0 && end > start, `function section missing: ${name}`);
  return source.slice(start, end);
};
const structuralExpectations = [
  ["async function completePostMessageClaim", "const receiptProcessingStatusPromises", 1, 1, 0],
  ["async function resolvePersonalImageMessageV2", "function messageDescriptorText", 3, 24, 0],
  ["function receiptStageContext", "function rememberPrimaryReceiptEvidence", 0, 1, 0],
  ["async function primaryVisionDecisionForPersonalMessage", "async function personalImageIsReceiptForPreUpload", 1, 3, 0],
  ["async function requestOpenAiReceiptVisionEngineV1", "function normalizeOpenAiStatus", 3, 14, 0],
  ["async function validateReceiptDateCore", "async function validateReceiptDate(", 9, 60, 1],
  ["async function validateReceiptStrict", "const shadowRuntimeCircuitBreaker", 6, 6, 1],
  ["async function rejectDuplicateMessage", "async function processPersonalMediaV2", 53, 21, 2],
  ["async function processPersonalMediaV2", "function isTodayTransferSumRequest", 4, 5, 0],
  ["async executePostMessageSent", "async receiptOcrConfig", 38, 14, 0]
];
for (const [name, nextName, awaitCount, returnCount, throwCount] of structuralExpectations) {
  const section = functionSection(name, nextName);
  assert.strictEqual((section.match(/\bawait\b/g) || []).length, awaitCount, `${name} await structure changed`);
  assert.strictEqual((section.match(/\breturn\b/g) || []).length, returnCount, `${name} return structure changed`);
  assert.strictEqual((section.match(/\bthrow\b/g) || []).length, throwCount, `${name} throw structure changed`);
}

for (const [needle, expectedCount] of [
  ["requestOpenAiReceiptVisionEngineV1(", 5],
  ["requestReceiptOcr(", 8],
  ["validateReceiptStrict(", 6],
  ["findExactDuplicate(", 6],
  ["findReceiptIdentityDuplicate(", 4],
  ["publishAcceptedReceipt(", 3],
  ["publishRejectedReceiptReview(", 8],
  ["claimPostMessage(", 3],
  ["completePostMessageClaim(", 3],
  ["queuedReceiptOcrPost(", 2]
]) {
  assert.strictEqual(source.split(needle).length - 1, expectedCount, `production call count changed: ${needle}`);
}

const traceBootstrapEnd = handler.indexOf("G.emitTarsTraceV1(traceLogger");
const traceBootstrapBody = handler.slice(handler.indexOf("{") + 1, traceBootstrapEnd);
const traceBootstrap = new Function("G", `return function () {${traceBootstrapBody}\nreturn "production-continued";};`);
assert.strictEqual(traceBootstrap({
  createTarsTraceV1() { throw new Error("create failed"); },
  emitTarsTraceV1() { return false; }
}).call({ getLogger() { return { info() {} }; } }), "production-continued", "createTrace failure must be fail-open");
assert.strictEqual(traceBootstrap({
  createTarsTraceV1() { return trace; },
  emitTarsTraceV1() { return false; }
}).call({ getLogger() { throw new Error("logger acquisition failed"); } }), "production-continued", "logger acquisition failure must be fail-open");

for (const [name, outcome, reason] of [
  ["ACCEPT", { ok: true }, "STRICT_ACCEPT"],
  ["REJECT", { ok: false, reason: "rejected" }, "STRICT_REJECT"],
  ["CONTROL", { ok: false, reason: "control" }, "CONTROL_RESULT_PUBLISHED"],
  ["DUPLICATE", true, "DUPLICATE_RESULT_PUBLISHED"],
  ["MEDIA_NOT_SETTLED", { handled: false, status: "media-not-settled" }, "MEDIA_UNSETTLED"],
  ["UNHANDLED_EXCEPTION", new Error("production failure"), "UNHANDLED_EXCEPTION"]
]) {
  const productionPath = () => {
    helpers.emitTarsTraceV1({ info() { throw new Error("telemetry failed"); } }, trace, {
      stage: name === "MEDIA_NOT_SETTLED" ? "media_resolution" : "terminal_outcome",
      outcome: name === "ACCEPT" ? "accepted" : name === "REJECT" ? "rejected" : name === "CONTROL" ? "control" : name === "DUPLICATE" ? "duplicate" : "failed",
      reason_code: reason
    });
    return outcome;
  };
  assert.strictEqual(productionPath(), outcome, `${name} production outcome must remain identical after telemetry failure`);
}

const shadowStart = handler.indexOf("G.scheduleImageClassificationV1Shadow({");
const shadowEnd = handler.indexOf("});", shadowStart);
assert(shadowStart >= 0 && shadowEnd > shadowStart);
assert(!handler.slice(shadowStart, shadowEnd).includes("trace"), "Phase 1A must not propagate trace into shadow queue");
assert(!/refreshPreliminaryReportAnalysis\([^;]*trace/.test(handler), "Phase 1A must not propagate trace into report refresh");

const productionOrder = [
  "resolvePersonalImageMessageV2(",
  "await this.receiptOcrConfig(n)",
  "primaryVisionDecisionForPersonalMessage(",
  "processPersonalMediaV2("
].map((needle) => handler.indexOf(needle));
assert(productionOrder.every((index) => index >= 0));
assert(productionOrder.every((index, position) => position === 0 || index > productionOrder[position - 1]), "trace must not reorder production calls");

console.log("PASS: TARS Reliability V1A trace is privacy-safe, bounded, fail-open and outside production decisions");
