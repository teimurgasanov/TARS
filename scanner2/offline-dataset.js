"use strict";

const {
  Decision,
  DocumentType,
  OperationStatus,
  DuplicateState,
  ReasonCode,
  isIsoDate,
  isAmount,
  assertConfidence
} = require("./contracts");

const DATASET_SCHEMA_VERSION = "scanner2-shadow-v1";
const PROVENANCE = new Set(["SYNTHETIC", "REDACTED_STRUCTURED"]);
const DECISIONS = new Set(Object.values(Decision));
const DOCUMENT_TYPES = new Set([
  ...Object.values(DocumentType),
  "bank_receipt",
  "bank_transfer",
  "fiscal_receipt",
  "bank_app_screen",
  "receipt_on_phone",
  "other_financial_document",
  "non_financial_image",
  "unknown"
]);
const STATUSES = new Set([...Object.values(OperationStatus), "success", "failed", "pending", "unknown"]);
const DUPLICATE_STATES = new Set([...Object.values(DuplicateState), "none", "possible", "confirmed"]);
const REASON_CODES = new Set([
  ...Object.values(ReasonCode),
  "LEGACY_ACCEPTED",
  "LEGACY_REJECTED",
  "LEGACY_REVIEW"
]);
const IDENTITY_KINDS = new Set(["DOCUMENT_ID_TOKEN", "TRANSACTION_ID_TOKEN", "TIME_BANK"]);
const FORBIDDEN_KEYS = new Set([
  "rawText",
  "message",
  "username",
  "roomId",
  "uploadId",
  "url",
  "image",
  "imageUrl",
  "imagePath",
  "filePath",
  "fullName",
  "phone",
  "cardNumber",
  "accountNumber",
  "documentId",
  "transactionId",
  "providerGroup"
]);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(label + " must be an object");
  }
}

function assertAllowedKeys(value, allowed, label) {
  assertObject(value, label);
  Object.keys(value).forEach((key) => {
    if (FORBIDDEN_KEYS.has(key)) throw new TypeError(label + "." + key + " is forbidden");
    if (!allowed.has(key)) throw new TypeError(label + "." + key + " is not allowed");
  });
}

function assertSafeString(value, label) {
  if (typeof value !== "string") throw new TypeError(label + " must be a string");
  if (/https?:\/\//i.test(value) || /(?:^|[\\/])(?:users?|home|tmp|var)(?:[\\/]|$)/i.test(value)) {
    throw new TypeError(label + " must not contain a URL or file path");
  }
  if (value.replace(/\D/g, "").length >= 10) {
    throw new TypeError(label + " must not contain phone, card, account, or bank identifier digits");
  }
}

function assertTechnicalId(value, label) {
  assertSafeString(value, label);
  if (!/^[a-z][a-z0-9._:-]{0,63}$/.test(value)) {
    throw new TypeError(label + " must be a lowercase technical identifier");
  }
}

function assertAnonymousToken(value, label) {
  assertSafeString(value, label);
  if (!/^(?:anon|synthetic)-[a-z0-9][a-z0-9._:-]{0,48}$/.test(value)) {
    throw new TypeError(label + " must be an anonymized technical token");
  }
}

function assertAmountOrNull(value, label) {
  if (value !== null && !isAmount(value)) throw new TypeError(label + " is invalid");
}

function assertDateOrNull(value, label) {
  if (value !== null && !isIsoDate(value)) throw new TypeError(label + " is invalid");
}

function validateIdentityEvidence(value, label) {
  if (value === null || value === undefined) return;
  assertAllowedKeys(value, new Set(["kind", "token", "exactTime", "bankCode"]), label);
  if (!IDENTITY_KINDS.has(value.kind)) throw new TypeError(label + ".kind is invalid");
  if (value.kind === "DOCUMENT_ID_TOKEN" || value.kind === "TRANSACTION_ID_TOKEN") {
    if (Object.keys(value).some((key) => key !== "kind" && key !== "token")) {
      throw new TypeError(label + " has fields incompatible with token identity");
    }
    assertAnonymousToken(value.token, label + ".token");
    return;
  }
  if (Object.keys(value).some((key) => key !== "kind" && key !== "exactTime" && key !== "bankCode")) {
    throw new TypeError(label + " has fields incompatible with time/bank identity");
  }
  if (typeof value.exactTime !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(value.exactTime)) {
    throw new TypeError(label + ".exactTime is invalid");
  }
  if (typeof value.bankCode !== "string" || !/^BANK_[A-Z][A-Z0-9_]{0,15}$/.test(value.bankCode)) {
    throw new TypeError(label + ".bankCode is invalid");
  }
}

function validateFieldQuality(value, label) {
  if (value === undefined) return;
  assertAllowedKeys(value, new Set(["date", "amount", "documentType", "status"]), label);
  Object.keys(value).forEach((key) => assertConfidence(value[key], label + "." + key));
}

function validateLegacyPass(value, label) {
  assertAllowedKeys(value, new Set([
    "passId",
    "date",
    "amount",
    "documentType",
    "status",
    "qualitySignal",
    "fieldQuality"
  ]), label);
  assertTechnicalId(value.passId, label + ".passId");
  assertDateOrNull(value.date, label + ".date");
  assertAmountOrNull(value.amount, label + ".amount");
  if (!DOCUMENT_TYPES.has(value.documentType)) throw new TypeError(label + ".documentType is invalid");
  if (!STATUSES.has(value.status)) throw new TypeError(label + ".status is invalid");
  assertConfidence(value.qualitySignal, label + ".qualitySignal");
  validateFieldQuality(value.fieldQuality, label + ".fieldQuality");
}

function validateDuplicateEvidence(value, label) {
  assertAllowedKeys(value, new Set(["state", "referenceToken"]), label);
  if (!DUPLICATE_STATES.has(value.state)) throw new TypeError(label + ".state is invalid");
  if (value.referenceToken !== null) assertAnonymousToken(value.referenceToken, label + ".referenceToken");
}

function validateLegacyDecision(value, label) {
  assertAllowedKeys(value, new Set([
    "decision",
    "reasonCode",
    "date",
    "amount",
    "documentType",
    "duplicateState",
    "strongIdentityEvidence"
  ]), label);
  if (!DECISIONS.has(value.decision)) throw new TypeError(label + ".decision is invalid");
  if (value.reasonCode !== null && !REASON_CODES.has(value.reasonCode)) throw new TypeError(label + ".reasonCode is invalid");
  assertDateOrNull(value.date, label + ".date");
  assertAmountOrNull(value.amount, label + ".amount");
  if (!DOCUMENT_TYPES.has(value.documentType)) throw new TypeError(label + ".documentType is invalid");
  if (!DUPLICATE_STATES.has(value.duplicateState)) throw new TypeError(label + ".duplicateState is invalid");
  validateIdentityEvidence(value.strongIdentityEvidence, label + ".strongIdentityEvidence");
}

function validateGroundTruth(value, label) {
  if (value === null || value === undefined) return;
  assertAllowedKeys(value, new Set(["decision", "date", "amount", "documentType", "duplicateState"]), label);
  if (!DECISIONS.has(value.decision)) throw new TypeError(label + ".decision is invalid");
  assertDateOrNull(value.date, label + ".date");
  assertAmountOrNull(value.amount, label + ".amount");
  if (!DOCUMENT_TYPES.has(value.documentType)) throw new TypeError(label + ".documentType is invalid");
  if (!DUPLICATE_STATES.has(value.duplicateState)) throw new TypeError(label + ".duplicateState is invalid");
}

function validateOfflineCase(value, label = "case") {
  assertAllowedKeys(value, new Set([
    "caseId",
    "acceptedDates",
    "legacyOcrResults",
    "legacyVisionResults",
    "duplicateEvidence",
    "legacyDecision",
    "scannerIdentityEvidence",
    "groundTruth"
  ]), label);
  assertTechnicalId(value.caseId, label + ".caseId");
  if (!Array.isArray(value.acceptedDates) || value.acceptedDates.some((date) => !isIsoDate(date))) {
    throw new TypeError(label + ".acceptedDates is invalid");
  }
  if (!Array.isArray(value.legacyOcrResults)) throw new TypeError(label + ".legacyOcrResults must be an array");
  if (!Array.isArray(value.legacyVisionResults)) throw new TypeError(label + ".legacyVisionResults must be an array");
  value.legacyOcrResults.forEach((item, index) => validateLegacyPass(item, label + ".legacyOcrResults[" + index + "]"));
  value.legacyVisionResults.forEach((item, index) => validateLegacyPass(item, label + ".legacyVisionResults[" + index + "]"));
  validateDuplicateEvidence(value.duplicateEvidence, label + ".duplicateEvidence");
  validateLegacyDecision(value.legacyDecision, label + ".legacyDecision");
  validateIdentityEvidence(value.scannerIdentityEvidence, label + ".scannerIdentityEvidence");
  validateGroundTruth(value.groundTruth, label + ".groundTruth");
  return JSON.parse(JSON.stringify(value));
}

function validateOfflineDataset(value) {
  assertAllowedKeys(value, new Set(["schemaVersion", "datasetId", "provenance", "cases"]), "dataset");
  if (value.schemaVersion !== DATASET_SCHEMA_VERSION) throw new TypeError("dataset.schemaVersion is invalid");
  assertTechnicalId(value.datasetId, "dataset.datasetId");
  if (!PROVENANCE.has(value.provenance)) throw new TypeError("dataset.provenance is invalid");
  if (!Array.isArray(value.cases)) throw new TypeError("dataset.cases must be an array");
  const caseIds = new Set();
  const cases = value.cases.map((item, index) => {
    const validated = validateOfflineCase(item, "dataset.cases[" + index + "]");
    if (caseIds.has(validated.caseId)) throw new TypeError("dataset caseId must be unique");
    caseIds.add(validated.caseId);
    return validated;
  });
  return {
    schemaVersion: value.schemaVersion,
    datasetId: value.datasetId,
    provenance: value.provenance,
    cases
  };
}

module.exports = {
  DATASET_SCHEMA_VERSION,
  validateOfflineCase,
  validateOfflineDataset
};
