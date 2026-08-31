"use strict";

const Decision = Object.freeze({
  ACCEPT: "ACCEPT",
  REJECT: "REJECT",
  REVIEW: "REVIEW"
});

const DocumentType = Object.freeze({
  BANK_RECEIPT: "BANK_RECEIPT",
  BANK_TRANSFER: "BANK_TRANSFER",
  FISCAL_RECEIPT: "FISCAL_RECEIPT",
  OTHER_FINANCIAL_DOCUMENT: "OTHER_FINANCIAL_DOCUMENT",
  NON_FINANCIAL_IMAGE: "NON_FINANCIAL_IMAGE",
  UNKNOWN: "UNKNOWN"
});

const OperationStatus = Object.freeze({
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  PENDING: "PENDING",
  UNKNOWN: "UNKNOWN"
});

const EvidenceSource = Object.freeze({
  OCR: "OCR",
  VISION: "VISION",
  MANUAL: "MANUAL",
  DUPLICATE_INDEX: "DUPLICATE_INDEX"
});

const DuplicateState = Object.freeze({
  NONE: "NONE",
  POSSIBLE: "POSSIBLE",
  CONFIRMED: "CONFIRMED"
});

const ReasonCode = Object.freeze({
  DOCUMENT_CONFIRMED: "DOCUMENT_CONFIRMED",
  BANK_TRANSFER_CONFIRMED: "BANK_TRANSFER_CONFIRMED",
  RECEIPT_CONFIRMED: "RECEIPT_CONFIRMED",
  NOT_FINANCIAL_DOCUMENT: "NOT_FINANCIAL_DOCUMENT",
  OPERATION_FAILED: "OPERATION_FAILED",
  OPERATION_PENDING: "OPERATION_PENDING",
  DATE_OUTSIDE_ALLOWED_PERIOD: "DATE_OUTSIDE_ALLOWED_PERIOD",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  DUPLICATE_CONFIRMED: "DUPLICATE_CONFIRMED",
  UNSUPPORTED_DOCUMENT: "UNSUPPORTED_DOCUMENT",
  DOCUMENT_TYPE_AMBIGUOUS: "DOCUMENT_TYPE_AMBIGUOUS",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  DATE_MISSING: "DATE_MISSING",
  AMOUNT_MISSING: "AMOUNT_MISSING",
  STATUS_UNKNOWN: "STATUS_UNKNOWN",
  DATE_CONFLICT: "DATE_CONFLICT",
  AMOUNT_CONFLICT: "AMOUNT_CONFLICT",
  DOCUMENT_CONFLICT: "DOCUMENT_CONFLICT",
  STATUS_CONFLICT: "STATUS_CONFLICT",
  SOURCE_CONFLICT: "SOURCE_CONFLICT",
  POSSIBLE_DUPLICATE: "POSSIBLE_DUPLICATE",
  IDENTITY_INCOMPLETE: "IDENTITY_INCOMPLETE"
});

const EvidenceField = Object.freeze({
  DOCUMENT: "DOCUMENT",
  DATE: "DATE",
  AMOUNT: "AMOUNT",
  STATUS: "STATUS",
  IDENTITY: "IDENTITY",
  DUPLICATE: "DUPLICATE"
});

const DECISIONS = new Set(Object.values(Decision));
const DOCUMENT_TYPES = new Set(Object.values(DocumentType));
const OPERATION_STATUSES = new Set(Object.values(OperationStatus));
const EVIDENCE_SOURCES = new Set(Object.values(EvidenceSource));
const DUPLICATE_STATES = new Set(Object.values(DuplicateState));
const REASON_CODES = new Set(Object.values(ReasonCode));
const EVIDENCE_FIELDS = new Set(Object.values(EvidenceField));

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isAmount(value) {
  return isPlainObject(value)
    && Number.isSafeInteger(value.minorUnits)
    && value.minorUnits > 0
    && value.currency === "RUB";
}

function isFinancialDocumentType(value) {
  return value === DocumentType.BANK_RECEIPT
    || value === DocumentType.BANK_TRANSFER
    || value === DocumentType.FISCAL_RECEIPT
    || value === DocumentType.OTHER_FINANCIAL_DOCUMENT;
}

function assertConfidence(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError(label + " must be a finite quality signal from 0 to 1");
  }
}

function assertEvidence(value, index) {
  const label = "evidence[" + index + "]";
  if (!isPlainObject(value)) throw new TypeError(label + " must be an object");
  if (!EVIDENCE_SOURCES.has(value.source)) throw new TypeError(label + ".source is invalid");
  if (typeof value.providerGroup !== "string" || !value.providerGroup.trim()) {
    throw new TypeError(label + ".providerGroup is required");
  }
  if (!EVIDENCE_FIELDS.has(value.field)) throw new TypeError(label + ".field is invalid");
  if (!Object.prototype.hasOwnProperty.call(value, "value") || value.value === undefined) {
    throw new TypeError(label + ".value must be present and must not be undefined");
  }
  assertConfidence(value.confidence, label + ".confidence");
  if (value.reference !== null && typeof value.reference !== "string") {
    throw new TypeError(label + ".reference must be a string or null");
  }
}

function assertJsonSafe(value, path) {
  if (value === undefined) throw new TypeError(path + " must not be undefined");
  if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError(path + " must be finite");
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, path + "[" + index + "]"));
    return;
  }
  if (isPlainObject(value)) {
    Object.keys(value).forEach((key) => assertJsonSafe(value[key], path + "." + key));
  }
}

function assertScanner2Result(result) {
  if (!isPlainObject(result)) throw new TypeError("Scanner2Result must be an object");
  if (!DECISIONS.has(result.decision)) throw new TypeError("Scanner2Result.decision is invalid");
  if (!REASON_CODES.has(result.reasonCode)) throw new TypeError("Scanner2Result.reasonCode is invalid");
  if (result.date !== null && !isIsoDate(result.date)) throw new TypeError("Scanner2Result.date is invalid");
  if (result.amount !== null && !isAmount(result.amount)) throw new TypeError("Scanner2Result.amount is invalid");
  if (!DOCUMENT_TYPES.has(result.documentType)) throw new TypeError("Scanner2Result.documentType is invalid");
  if (result.identity !== null && (typeof result.identity !== "string" || !result.identity)) {
    throw new TypeError("Scanner2Result.identity must be a non-empty string or null");
  }
  assertConfidence(result.confidence, "Scanner2Result.confidence");
  if (!Array.isArray(result.evidence)) throw new TypeError("Scanner2Result.evidence must be an array");
  result.evidence.forEach(assertEvidence);
  assertJsonSafe(result, "Scanner2Result");
  return result;
}

module.exports = {
  Decision,
  DocumentType,
  OperationStatus,
  EvidenceSource,
  DuplicateState,
  ReasonCode,
  EvidenceField,
  DOCUMENT_TYPES,
  OPERATION_STATUSES,
  EVIDENCE_SOURCES,
  DUPLICATE_STATES,
  isPlainObject,
  isIsoDate,
  isAmount,
  isFinancialDocumentType,
  assertConfidence,
  assertScanner2Result
};
