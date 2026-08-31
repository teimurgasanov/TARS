"use strict";

const {
  Decision,
  DocumentType,
  OperationStatus,
  DuplicateState,
  ReasonCode,
  isFinancialDocumentType,
  assertScanner2Result
} = require("./contracts");

function acceptedReason(documentType) {
  if (documentType === DocumentType.BANK_TRANSFER) return ReasonCode.BANK_TRANSFER_CONFIRMED;
  if (documentType === DocumentType.BANK_RECEIPT || documentType === DocumentType.FISCAL_RECEIPT) {
    return ReasonCode.RECEIPT_CONFIRMED;
  }
  return ReasonCode.DOCUMENT_CONFIRMED;
}

function makeResult(resolved, identity, decision, reasonCode) {
  return assertScanner2Result({
    decision,
    reasonCode,
    date: resolved.date,
    amount: resolved.amount === null ? null : { ...resolved.amount },
    documentType: resolved.documentType,
    identity,
    confidence: resolved.confidence,
    evidence: resolved.evidence.map((item) => ({ ...item }))
  });
}

function makeDecision(resolved, context = {}) {
  if (!resolved || typeof resolved !== "object") throw new TypeError("ResolvedEvidence is required");
  const identity = context.identity === undefined ? null : context.identity;
  if (identity !== null && (typeof identity !== "string" || !identity)) {
    throw new TypeError("identity must be a non-empty string or null");
  }

  if (resolved.duplicateEvidence.state === DuplicateState.CONFIRMED) {
    return makeResult(resolved, identity, Decision.REJECT, ReasonCode.DUPLICATE_CONFIRMED);
  }
  if (resolved.status === OperationStatus.FAILED) {
    return makeResult(resolved, identity, Decision.REJECT, ReasonCode.OPERATION_FAILED);
  }
  if (resolved.documentType === DocumentType.NON_FINANCIAL_IMAGE) {
    return makeResult(resolved, identity, Decision.REJECT, ReasonCode.NOT_FINANCIAL_DOCUMENT);
  }

  if (resolved.conflicts.length) {
    return makeResult(resolved, identity, Decision.REVIEW, resolved.conflicts[0].code || ReasonCode.SOURCE_CONFLICT);
  }
  if (resolved.status === OperationStatus.PENDING) {
    return makeResult(resolved, identity, Decision.REVIEW, ReasonCode.OPERATION_PENDING);
  }
  if (resolved.duplicateEvidence.state === DuplicateState.POSSIBLE) {
    return makeResult(
      resolved,
      identity,
      Decision.REVIEW,
      identity === null ? ReasonCode.IDENTITY_INCOMPLETE : ReasonCode.POSSIBLE_DUPLICATE
    );
  }

  if (resolved.date !== null && !resolved.acceptedDates.includes(resolved.date)) {
    return makeResult(resolved, identity, Decision.REJECT, ReasonCode.DATE_OUTSIDE_ALLOWED_PERIOD);
  }
  if (resolved.issues.some((issue) => issue.code === "INVALID_AMOUNT")) {
    return makeResult(resolved, identity, Decision.REJECT, ReasonCode.INVALID_AMOUNT);
  }
  if (resolved.documentType === DocumentType.UNKNOWN) {
    return makeResult(resolved, identity, Decision.REVIEW, ReasonCode.DOCUMENT_TYPE_AMBIGUOUS);
  }
  if (!isFinancialDocumentType(resolved.documentType)) {
    return makeResult(resolved, identity, Decision.REJECT, ReasonCode.UNSUPPORTED_DOCUMENT);
  }
  if (resolved.status === OperationStatus.UNKNOWN) {
    return makeResult(resolved, identity, Decision.REVIEW, ReasonCode.STATUS_UNKNOWN);
  }
  if (resolved.date === null) {
    const internallyAmbiguousDate = resolved.internalAmbiguities.some((item) => item.field === "date");
    const lowQualityDate = resolved.candidateCounts.date > 0 && resolved.materialCounts.date === 0;
    return makeResult(
      resolved,
      identity,
      Decision.REVIEW,
      internallyAmbiguousDate || lowQualityDate ? ReasonCode.INSUFFICIENT_EVIDENCE : ReasonCode.DATE_MISSING
    );
  }
  if (resolved.amount === null) {
    const internallyAmbiguousAmount = resolved.internalAmbiguities.some((item) => item.field === "amount");
    const lowQualityAmount = resolved.candidateCounts.amount > 0 && resolved.materialCounts.amount === 0;
    return makeResult(
      resolved,
      identity,
      Decision.REVIEW,
      internallyAmbiguousAmount || lowQualityAmount ? ReasonCode.INSUFFICIENT_EVIDENCE : ReasonCode.AMOUNT_MISSING
    );
  }

  const independentlyConfirmed = resolved.support.date >= 2
    && resolved.support.amount >= 2
    && resolved.support.documentType >= 1
    && resolved.support.status >= 1;
  if (!independentlyConfirmed) {
    return makeResult(resolved, identity, Decision.REVIEW, ReasonCode.INSUFFICIENT_EVIDENCE);
  }

  return makeResult(resolved, identity, Decision.ACCEPT, acceptedReason(resolved.documentType));
}

module.exports = {
  makeDecision
};
