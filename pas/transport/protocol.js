"use strict";

const { createHash } = require("node:crypto");
const { assertConfirmPaymentCommand, assertPaymentAuthorityResult } = require("../contracts");
const PROTOCOL = "PAS_HTTP_V1";
const MAX_BODY = 65536;
const OPERATIONS = Object.freeze({ ConfirmPayment: "command", GetCommandCompletion: "command",
  ReadFinancialEffects: "consumer", AcknowledgeFinancialEffect: "consumer" });

function keys(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== names.slice().sort().join(",")) throw new TypeError("Invalid object fields");
}
function id(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new TypeError("Invalid identifier");
}
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
function hash(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function digest(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError("Invalid digest");
}
function assertResult(value) {
  keys(value, ["status", "canonicalPaymentId", "reasonCode"]);
  assertPaymentAuthorityResult(value);
  if (["CONFIRMED", "ALREADY_CONFIRMED"].includes(value.status)) id(value.canonicalPaymentId);
}
function assertCommand(value) {
  assertConfirmPaymentCommand(value);
  keys(value, ["type", "version", "commandId", "mode", "actor", "observation", "receiptEvidence", "payment"]);
  id(value.commandId);
  keys(value.actor, ["kind", "reference"]);
  keys(value.observation, ["messageId", "uploadId"]);
  keys(value.receiptEvidence, ["receiptCaseId", "exactHash", "visualHash"]);
  keys(value.payment, ["amount", "date"]);
  keys(value.payment.amount.value, ["minorUnits", "currency"]);
  for (const field of [value.payment.amount, value.payment.date]) {
    keys(field, ["value", "provenance"]);
    keys(field.provenance, ["source", "supersedesSource"]);
  }
}
function assertPayload(operation, value) {
  switch (operation) {
    case "ConfirmPayment": assertCommand(value); break;
    case "GetCommandCompletion": keys(value, ["commandId"]); id(value.commandId); break;
    case "ReadFinancialEffects":
      keys(value, ["after", "limit", "includeCompleted"]);
      if (!Number.isSafeInteger(value.after) || value.after < 0 || !Number.isSafeInteger(value.limit)
        || value.limit < 1 || value.limit > 100 || typeof value.includeCompleted !== "boolean") throw new TypeError("Invalid page");
      break;
    case "AcknowledgeFinancialEffect":
      keys(value, ["effectId", "payloadDigest"]); id(value.effectId); digest(value.payloadDigest); break;
    default: throw new TypeError("Unsupported operation");
  }
}
function assertEnvelope(value) {
  keys(value, ["protocol", "requestId", "operation", "payload"]);
  id(value.requestId); id(value.operation);
}
function assertEffect(effect) {
  keys(effect, ["effectId", "kind", "payload", "payloadDigest", "state"]);
  id(effect.effectId); digest(effect.payloadDigest);
  if (!["PENDING", "COMPLETED"].includes(effect.state)) throw new TypeError("Invalid effect state");
  const p = effect.payload;
  if (effect.kind === "WRITE_CONFIRMED_PROJECTION") {
    keys(p, ["canonicalPaymentId", "amount", "date"]); keys(p.amount, ["minorUnits", "currency"]);
    if (!Number.isSafeInteger(p.amount.minorUnits) || p.amount.minorUnits <= 0
      || typeof p.amount.currency !== "string" || p.amount.currency.length !== 3
      || typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)
      || new Date(p.date + "T00:00:00Z").toISOString().slice(0, 10) !== p.date) throw new TypeError("Invalid payment effect");
  } else if (effect.kind === "ASSOCIATE_OBSERVATION") {
    keys(p, ["canonicalPaymentId", "observation"]); keys(p.observation, ["messageId", "uploadId"]);
    for (const ref of Object.values(p.observation)) if (ref !== null && (typeof ref !== "string" || !ref.trim())) throw new TypeError("Invalid observation");
    if (Object.values(p.observation).every(ref => ref === null)) throw new TypeError("Missing observation");
  } else throw new TypeError("Unknown effect kind");
  id(p.canonicalPaymentId);
  if (hash(p) !== effect.payloadDigest) throw new TypeError("Effect digest mismatch");
}
function assertData(operation, data, payload) {
  if (operation === "ConfirmPayment") return assertResult(data);
  if (operation === "GetCommandCompletion") {
    if (data === null) return;
    keys(data, ["result", "effects", "completion"]); assertResult(data.result);
    if (!Array.isArray(data.effects)) throw new TypeError("Invalid completion effects");
    for (const e of data.effects) {
      keys(e, ["effectId", "kind", "state", "attempts"]); id(e.effectId);
      if (!["WRITE_CONFIRMED_PROJECTION", "ASSOCIATE_OBSERVATION"].includes(e.kind)
        || !["PENDING", "COMPLETED"].includes(e.state) || !Number.isSafeInteger(e.attempts) || e.attempts < 0) throw new TypeError("Invalid completion");
    }
    const success = ["CONFIRMED", "ALREADY_CONFIRMED"].includes(data.result.status);
    if (success && (data.effects.length !== 2 || new Set(data.effects.map(e => e.kind)).size !== 2
      || new Set(data.effects.map(e => e.effectId)).size !== 2)) throw new TypeError("Missing effects");
    const expected = !success ? "NOT_APPLICABLE" : data.effects.every(e => e.state === "COMPLETED") ? "COMPLETED" : "PENDING";
    if (data.completion !== expected || (!success && data.effects.length)) throw new TypeError("Invalid completion");
    return;
  }
  if (operation === "ReadFinancialEffects") {
    keys(data, ["effects", "nextCursor"]);
    if (!Array.isArray(data.effects) || data.effects.length > payload.limit
      || !Number.isSafeInteger(data.nextCursor) || data.nextCursor < payload.after
      || (data.effects.length ? data.nextCursor <= payload.after : data.nextCursor !== payload.after)) throw new TypeError("Invalid page result");
    data.effects.forEach(assertEffect);
    if (new Set(data.effects.map(e => e.effectId)).size !== data.effects.length
      || (!payload.includeCompleted && data.effects.some(e => e.state !== "PENDING"))) throw new TypeError("Invalid effect page");
    return;
  }
  if (operation === "AcknowledgeFinancialEffect") {
    if (["UNKNOWN_EFFECT", "EFFECT_DIGEST_MISMATCH"].includes(data && data.status)) return keys(data, ["status"]);
    keys(data, ["status", "effectId", "payloadDigest"]);
    if (data.status !== "COMPLETED" || data.effectId !== payload.effectId || data.payloadDigest !== payload.payloadDigest) throw new TypeError("Invalid acknowledgement");
    return;
  }
  throw new TypeError("Unsupported operation");
}
module.exports = { PROTOCOL, MAX_BODY, OPERATIONS, keys, id, assertEnvelope, assertPayload, assertData };
