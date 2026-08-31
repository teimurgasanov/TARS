"use strict";

const {
  Decision,
  DocumentType,
  OperationStatus,
  DuplicateState,
  ReasonCode,
  isPlainObject,
  isIsoDate,
  isAmount,
  assertConfidence
} = require("./contracts");

const SHADOW_SCHEMA_VERSION = "scanner2-shadow-recorder-v1";
const SHADOW_PROVENANCE = "REDACTED_STRUCTURED";
const MAX_SHADOW_OBSERVATIONS = 8;
const MAX_SHADOW_SNAPSHOT_BYTES = 8 * 1024;

const YANDEX_PASS_TYPES = new Set(["page", "page-column-sort", "table", "markdown"]);
const VISION_PASS_TYPES = new Set(["primary", "amount_focus", "date_focus"]);
const DOCUMENT_TYPES = new Set(Object.values(DocumentType));
const OPERATION_STATUSES = new Set(Object.values(OperationStatus));
const DUPLICATE_STATES = new Set(Object.values(DuplicateState));
const DECISIONS = new Set(Object.values(Decision));
const DUPLICATE_MATCH_TYPES = new Set(["NONE", "EXACT", "VISUAL", "IDENTITY"]);
const IDENTITY_KINDS = new Set([
  "DOCUMENT_ID_TOKEN",
  "TRANSACTION_ID_TOKEN",
  "COMPOSITE_TRANSACTION_TOKEN"
]);
const LEGACY_REASON_CODES = new Set([
  ...Object.values(ReasonCode),
  "LEGACY_ACCEPTED",
  "DUPLICATE_EXACT",
  "DUPLICATE_IDENTITY",
  "DUPLICATE_VISUAL",
  "CONTAINER_SCREENSHOT",
  "AMOUNT_MISSING",
  "DATE_MISMATCH",
  "DATE_MISSING",
  "NOT_RECEIPT",
  "PROVIDER_UNAVAILABLE",
  "VALIDATION_INCONCLUSIVE",
  "UNKNOWN_REJECTION"
]);

const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "caseId",
  "provenance",
  "captureBucket",
  "acceptedDates",
  "legacyOcrResults",
  "legacyVisionResults",
  "duplicateEvidence",
  "legacyDecision",
  "tokenKeyVersion"
]);

const FORBIDDEN_KEYS = new Set([
  "rawtext",
  "message",
  "username",
  "userid",
  "roomid",
  "messageid",
  "uploadid",
  "uploadattemptkey",
  "url",
  "image",
  "imageurl",
  "imagepath",
  "filepath",
  "originalname",
  "phone",
  "cardnumber",
  "accountnumber",
  "documentid",
  "transactionid",
  "bank",
  "bankname",
  "openairawresponse",
  "yandexrawpayload",
  "rawresponse",
  "rawpayload",
  "text",
  "note",
  "description"
]);

function normalizeKey(value) {
  return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function assertNoForbiddenKeys(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, path + "[" + index + "]"));
    return;
  }
  if (!isPlainObject(value)) return;
  Object.keys(value).forEach((key) => {
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) {
      throw new TypeError(path + "." + key + " is forbidden by the shadow privacy contract");
    }
    assertNoForbiddenKeys(value[key], path + "." + key);
  });
}

function assertExactKeys(value, allowed, required, label) {
  if (!isPlainObject(value)) throw new TypeError(label + " must be an object");
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) throw new TypeError(label + "." + key + " is not allowed");
  });
  required.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new TypeError(label + "." + key + " is required");
    }
  });
}

function assertJsonSafe(value, path) {
  if (value === undefined) throw new TypeError(path + " must not be undefined");
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(path + " must be finite");
  }
  if (typeof value === "string") {
    if (/https?:\/\//i.test(value)) throw new TypeError(path + " must not contain a URL");
    if (/(?:^|[\\/])(?:users?|home|tmp|var|private)(?:[\\/]|$)/i.test(value)) {
      throw new TypeError(path + " must not contain a file path");
    }
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, path + "[" + index + "]"));
    return;
  }
  if (isPlainObject(value)) {
    Object.keys(value).forEach((key) => assertJsonSafe(value[key], path + "." + key));
  }
}

function assertTokenKeyVersion(value, label) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,7}$/.test(value)) {
    throw new TypeError(label + " is invalid");
  }
}

function caseTokenPattern(keyVersion) {
  return new RegExp("^anon-" + keyVersion + "-[a-f0-9]{48}$");
}

function valueTokenPattern(keyVersion, tag) {
  return new RegExp("^tok-" + keyVersion + "-" + tag + "-[a-f0-9]{48}$");
}

function assertToken(value, keyVersion, tag, label, nullable) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !valueTokenPattern(keyVersion, tag).test(value)) {
    throw new TypeError(label + " must be a tokenized " + tag + " value for " + keyVersion);
  }
}

function assertAmountOrNull(value, label) {
  if (value !== null && !isAmount(value)) throw new TypeError(label + " is invalid");
}

function assertDateOrNull(value, label) {
  if (value !== null && !isIsoDate(value)) throw new TypeError(label + " is invalid");
}

function validateObservation(value, label, passTypes) {
  const keys = new Set(["passType", "date", "amount", "documentType", "status", "qualitySignal"]);
  assertExactKeys(value, keys, keys, label);
  if (!passTypes.has(value.passType)) throw new TypeError(label + ".passType is invalid");
  assertDateOrNull(value.date, label + ".date");
  assertAmountOrNull(value.amount, label + ".amount");
  if (!DOCUMENT_TYPES.has(value.documentType)) throw new TypeError(label + ".documentType is invalid");
  if (!OPERATION_STATUSES.has(value.status)) throw new TypeError(label + ".status is invalid");
  assertConfidence(value.qualitySignal, label + ".qualitySignal");
}

function validateDuplicateEvidence(value, keyVersion, label) {
  const keys = new Set(["state", "matchType", "referenceToken", "exactToken", "visualToken"]);
  assertExactKeys(value, keys, keys, label);
  if (!DUPLICATE_STATES.has(value.state)) throw new TypeError(label + ".state is invalid");
  if (!DUPLICATE_MATCH_TYPES.has(value.matchType)) throw new TypeError(label + ".matchType is invalid");
  assertToken(value.referenceToken, keyVersion, "dup", label + ".referenceToken", true);
  assertToken(value.exactToken, keyVersion, "ex", label + ".exactToken", true);
  assertToken(value.visualToken, keyVersion, "vis", label + ".visualToken", true);
  if (value.state === DuplicateState.NONE && value.matchType !== "NONE") {
    throw new TypeError(label + ".matchType must be NONE when duplicate state is NONE");
  }
  if (value.state === DuplicateState.CONFIRMED && value.matchType === "NONE") {
    throw new TypeError(label + ".matchType is required for a confirmed duplicate");
  }
}

function validateIdentityEvidence(value, keyVersion, label) {
  if (value === null) return;
  const keys = new Set(["kind", "token"]);
  assertExactKeys(value, keys, keys, label);
  if (!IDENTITY_KINDS.has(value.kind)) throw new TypeError(label + ".kind is invalid");
  const tag = value.kind === "DOCUMENT_ID_TOKEN" ? "doc"
    : value.kind === "TRANSACTION_ID_TOKEN" ? "txn" : "cmp";
  assertToken(value.token, keyVersion, tag, label + ".token", false);
}

function validateLegacyDecision(value, keyVersion, label) {
  if (value === null) return;
  const keys = new Set([
    "decision",
    "reasonCode",
    "date",
    "amount",
    "documentType",
    "duplicateState",
    "strongIdentityEvidence"
  ]);
  assertExactKeys(value, keys, keys, label);
  if (!DECISIONS.has(value.decision)) throw new TypeError(label + ".decision is invalid");
  if (!LEGACY_REASON_CODES.has(value.reasonCode)) throw new TypeError(label + ".reasonCode is invalid");
  assertDateOrNull(value.date, label + ".date");
  assertAmountOrNull(value.amount, label + ".amount");
  if (!DOCUMENT_TYPES.has(value.documentType)) throw new TypeError(label + ".documentType is invalid");
  if (!DUPLICATE_STATES.has(value.duplicateState)) throw new TypeError(label + ".duplicateState is invalid");
  validateIdentityEvidence(value.strongIdentityEvidence, keyVersion, label + ".strongIdentityEvidence");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateShadowSnapshot(value, options = {}) {
  assertNoForbiddenKeys(value, "shadowSnapshot");
  assertExactKeys(value, TOP_LEVEL_KEYS, TOP_LEVEL_KEYS, "shadowSnapshot");
  if (value.schemaVersion !== SHADOW_SCHEMA_VERSION) throw new TypeError("shadowSnapshot.schemaVersion is invalid");
  if (value.provenance !== SHADOW_PROVENANCE) throw new TypeError("shadowSnapshot.provenance is invalid");
  assertTokenKeyVersion(value.tokenKeyVersion, "shadowSnapshot.tokenKeyVersion");
  if (typeof value.caseId !== "string" || !caseTokenPattern(value.tokenKeyVersion).test(value.caseId)) {
    throw new TypeError("shadowSnapshot.caseId must be an anonymous case token");
  }
  if (value.captureBucket !== null && (typeof value.captureBucket !== "string" || !/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(value.captureBucket))) {
    throw new TypeError("shadowSnapshot.captureBucket is invalid");
  }
  if (!Array.isArray(value.acceptedDates) || value.acceptedDates.some((date) => !isIsoDate(date))) {
    throw new TypeError("shadowSnapshot.acceptedDates is invalid");
  }
  if (!Array.isArray(value.legacyOcrResults)) throw new TypeError("shadowSnapshot.legacyOcrResults must be an array");
  if (!Array.isArray(value.legacyVisionResults)) throw new TypeError("shadowSnapshot.legacyVisionResults must be an array");
  value.legacyOcrResults.forEach((item, index) => validateObservation(item, "shadowSnapshot.legacyOcrResults[" + index + "]", YANDEX_PASS_TYPES));
  value.legacyVisionResults.forEach((item, index) => validateObservation(item, "shadowSnapshot.legacyVisionResults[" + index + "]", VISION_PASS_TYPES));
  const maxObservations = Number.isSafeInteger(options.maxObservations) ? options.maxObservations : MAX_SHADOW_OBSERVATIONS;
  if (value.legacyOcrResults.length + value.legacyVisionResults.length > maxObservations) {
    throw new TypeError("shadowSnapshot exceeds the observation limit");
  }
  validateDuplicateEvidence(value.duplicateEvidence, value.tokenKeyVersion, "shadowSnapshot.duplicateEvidence");
  validateLegacyDecision(value.legacyDecision, value.tokenKeyVersion, "shadowSnapshot.legacyDecision");
  assertJsonSafe(value, "shadowSnapshot");
  const maxBytes = Number.isSafeInteger(options.maxBytes) ? options.maxBytes : MAX_SHADOW_SNAPSHOT_BYTES;
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maxBytes) {
    throw new TypeError("shadowSnapshot exceeds the 8 KB size limit");
  }
  return cloneJson(value);
}

function shadowRecordState(snapshot) {
  return snapshot && snapshot.legacyDecision === null ? "DRAFT" : "FINAL";
}

module.exports = {
  SHADOW_SCHEMA_VERSION,
  SHADOW_PROVENANCE,
  MAX_SHADOW_OBSERVATIONS,
  MAX_SHADOW_SNAPSHOT_BYTES,
  YANDEX_PASS_TYPES,
  VISION_PASS_TYPES,
  LEGACY_REASON_CODES,
  validateShadowSnapshot,
  shadowRecordState
};
