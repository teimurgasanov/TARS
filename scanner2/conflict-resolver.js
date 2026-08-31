"use strict";

const {
  DocumentType,
  OperationStatus,
  ReasonCode
} = require("./contracts");

function valueKey(field, value) {
  if (field === "amount") return value.currency + ":" + value.minorUnits;
  return String(value);
}

function resolveField(field, candidates, threshold, missingValue) {
  const material = candidates.filter((item) => item.confidence >= threshold);
  const groupsByValue = new Map();
  const valuesByKey = new Map();

  material.forEach((item) => {
    const key = valueKey(field, item.value);
    if (!groupsByValue.has(key)) groupsByValue.set(key, new Set());
    groupsByValue.get(key).add(item.providerGroup);
    valuesByKey.set(key, item.value);
  });

  const keys = [...groupsByValue.keys()].sort();
  if (keys.length !== 1) {
    return {
      value: missingValue,
      supportCount: 0,
      qualitySignal: 0,
      conflict: keys.length > 1,
      conflictingValues: keys.map((key) => valuesByKey.get(key)),
      materialCount: material.length,
      candidateCount: candidates.length
    };
  }

  const selectedKey = keys[0];
  const selected = material.filter((item) => valueKey(field, item.value) === selectedKey);
  return {
    value: valuesByKey.get(selectedKey),
    supportCount: groupsByValue.get(selectedKey).size,
    qualitySignal: Math.min(...selected.map((item) => item.confidence)),
    conflict: false,
    conflictingValues: [],
    materialCount: material.length,
    candidateCount: candidates.length
  };
}

function conflict(code, field, resolvedField, candidates) {
  return {
    code,
    field,
    values: resolvedField.conflictingValues,
    providerGroups: [...new Set(candidates
      .filter((item) => item.confidence > 0)
      .map((item) => item.providerGroup))].sort()
  };
}

function resolveConflicts(evaluation) {
  if (!evaluation || typeof evaluation !== "object") {
    throw new TypeError("RuleEvaluation is required");
  }
  const threshold = evaluation.materialThreshold;
  const date = resolveField("date", evaluation.candidates.dates, threshold, null);
  const amount = resolveField("amount", evaluation.candidates.amounts, threshold, null);
  const document = resolveField("document", evaluation.candidates.documentTypes, threshold, DocumentType.UNKNOWN);
  const status = resolveField("status", evaluation.candidates.statuses, threshold, OperationStatus.UNKNOWN);
  const conflicts = [];

  if (amount.conflict) conflicts.push(conflict(ReasonCode.AMOUNT_CONFLICT, "amount", amount, evaluation.candidates.amounts));
  if (date.conflict) conflicts.push(conflict(ReasonCode.DATE_CONFLICT, "date", date, evaluation.candidates.dates));
  if (document.conflict) conflicts.push(conflict(ReasonCode.DOCUMENT_CONFLICT, "documentType", document, evaluation.candidates.documentTypes));
  if (status.conflict) conflicts.push(conflict(ReasonCode.STATUS_CONFLICT, "status", status, evaluation.candidates.statuses));

  const qualitySignals = [date, amount, document, status]
    .filter((item) => item.value !== null && item.value !== DocumentType.UNKNOWN && item.value !== OperationStatus.UNKNOWN)
    .map((item) => item.qualitySignal);

  return {
    acceptedDates: [...evaluation.acceptedDates],
    date: date.value,
    amount: amount.value,
    documentType: document.value,
    status: status.value,
    support: {
      date: date.supportCount,
      amount: amount.supportCount,
      documentType: document.supportCount,
      status: status.supportCount
    },
    candidateCounts: {
      date: date.candidateCount,
      amount: amount.candidateCount,
      documentType: document.candidateCount,
      status: status.candidateCount
    },
    materialCounts: {
      date: date.materialCount,
      amount: amount.materialCount,
      documentType: document.materialCount,
      status: status.materialCount
    },
    conflicts,
    duplicateEvidence: { ...evaluation.duplicateEvidence },
    issues: evaluation.issues.map((item) => ({ ...item })),
    evidence: evaluation.evidence.map((item) => ({ ...item })),
    confidence: qualitySignals.length ? Math.min(...qualitySignals) : 0
  };
}

module.exports = {
  resolveConflicts
};
