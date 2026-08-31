"use strict";

const {
  DocumentType,
  OperationStatus,
  DuplicateState
} = require("./contracts");
const { validateOfflineCase } = require("./offline-dataset");

const DOCUMENT_TYPE_MAP = Object.freeze({
  BANK_RECEIPT: DocumentType.BANK_RECEIPT,
  BANK_TRANSFER: DocumentType.BANK_TRANSFER,
  FISCAL_RECEIPT: DocumentType.FISCAL_RECEIPT,
  OTHER_FINANCIAL_DOCUMENT: DocumentType.OTHER_FINANCIAL_DOCUMENT,
  NON_FINANCIAL_IMAGE: DocumentType.NON_FINANCIAL_IMAGE,
  UNKNOWN: DocumentType.UNKNOWN,
  bank_receipt: DocumentType.BANK_RECEIPT,
  receipt_on_phone: DocumentType.BANK_RECEIPT,
  bank_transfer: DocumentType.BANK_TRANSFER,
  bank_app_screen: DocumentType.BANK_TRANSFER,
  fiscal_receipt: DocumentType.FISCAL_RECEIPT,
  other_financial_document: DocumentType.OTHER_FINANCIAL_DOCUMENT,
  non_financial_image: DocumentType.NON_FINANCIAL_IMAGE,
  unknown: DocumentType.UNKNOWN
});

const STATUS_MAP = Object.freeze({
  SUCCESS: OperationStatus.SUCCESS,
  FAILED: OperationStatus.FAILED,
  PENDING: OperationStatus.PENDING,
  UNKNOWN: OperationStatus.UNKNOWN,
  success: OperationStatus.SUCCESS,
  failed: OperationStatus.FAILED,
  pending: OperationStatus.PENDING,
  unknown: OperationStatus.UNKNOWN
});

const DUPLICATE_MAP = Object.freeze({
  NONE: DuplicateState.NONE,
  POSSIBLE: DuplicateState.POSSIBLE,
  CONFIRMED: DuplicateState.CONFIRMED,
  none: DuplicateState.NONE,
  possible: DuplicateState.POSSIBLE,
  confirmed: DuplicateState.CONFIRMED
});

function cloneAmount(value) {
  return value === null ? null : { minorUnits: value.minorUnits, currency: value.currency };
}

function adaptPass(value, source, providerGroup) {
  return {
    source,
    providerGroup,
    documentType: DOCUMENT_TYPE_MAP[value.documentType],
    date: value.date,
    amount: cloneAmount(value.amount),
    status: STATUS_MAP[value.status],
    confidence: value.qualitySignal,
    fieldConfidence: value.fieldQuality === undefined ? {} : { ...value.fieldQuality },
    reference: value.passId
  };
}

function adaptIdentityEvidence(value) {
  if (value === null || value === undefined) return null;
  return { ...value };
}

function adaptLegacySnapshot(snapshot) {
  const value = validateOfflineCase(snapshot, "legacySnapshot");
  const observations = [
    ...value.legacyOcrResults.map((item) => adaptPass(item, "OCR", "yandex")),
    ...value.legacyVisionResults.map((item) => adaptPass(item, "VISION", "openai"))
  ];
  return {
    caseId: value.caseId,
    acceptedDates: [...value.acceptedDates],
    observations,
    duplicateEvidence: {
      state: DUPLICATE_MAP[value.duplicateEvidence.state],
      reference: value.duplicateEvidence.referenceToken
    },
    scannerIdentityEvidence: adaptIdentityEvidence(value.scannerIdentityEvidence),
    legacyDecision: {
      decision: value.legacyDecision.decision,
      reasonCode: value.legacyDecision.reasonCode,
      date: value.legacyDecision.date,
      amount: cloneAmount(value.legacyDecision.amount),
      documentType: DOCUMENT_TYPE_MAP[value.legacyDecision.documentType],
      duplicateState: DUPLICATE_MAP[value.legacyDecision.duplicateState],
      strongIdentityEvidence: adaptIdentityEvidence(value.legacyDecision.strongIdentityEvidence)
    },
    groundTruth: value.groundTruth === null || value.groundTruth === undefined ? null : {
      decision: value.groundTruth.decision,
      date: value.groundTruth.date,
      amount: cloneAmount(value.groundTruth.amount),
      documentType: DOCUMENT_TYPE_MAP[value.groundTruth.documentType],
      duplicateState: DUPLICATE_MAP[value.groundTruth.duplicateState]
    }
  };
}

function identityInputFromEvidence(value, date, amount) {
  if (value === null || date === null || amount === null) return {};
  if (value.kind === "DOCUMENT_ID_TOKEN") return { documentId: value.token, date, amount };
  if (value.kind === "TRANSACTION_ID_TOKEN") return { transactionId: value.token, date, amount };
  return { time: value.exactTime, bank: value.bankCode, date, amount };
}

module.exports = {
  adaptLegacySnapshot,
  identityInputFromEvidence
};
