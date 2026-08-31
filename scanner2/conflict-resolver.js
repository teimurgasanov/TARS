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
  const candidatesByGroup = new Map();
  material.forEach((item) => {
    if (!candidatesByGroup.has(item.providerGroup)) candidatesByGroup.set(item.providerGroup, []);
    candidatesByGroup.get(item.providerGroup).push(item);
  });

  const groupsByValue = new Map();
  const valuesByKey = new Map();
  const internalAmbiguities = [];

  candidatesByGroup.forEach((groupCandidates, providerGroup) => {
    const groupValues = new Map();
    groupCandidates.forEach((item) => {
      groupValues.set(valueKey(field, item.value), item.value);
    });
    const groupKeys = [...groupValues.keys()].sort();
    if (groupKeys.length !== 1) {
      internalAmbiguities.push({
        providerGroup,
        values: groupKeys.map((key) => groupValues.get(key))
      });
      return;
    }
    const key = groupKeys[0];
    if (!groupsByValue.has(key)) groupsByValue.set(key, new Set());
    groupsByValue.get(key).add(providerGroup);
    valuesByKey.set(key, groupValues.get(key));
  });

  const keys = [...groupsByValue.keys()].sort();
  if (keys.length !== 1) {
    return {
      value: missingValue,
      supportCount: 0,
      qualitySignal: 0,
      conflict: keys.length > 1,
      conflictingValues: keys.map((key) => valuesByKey.get(key)),
      conflictingGroups: keys.flatMap((key) => [...groupsByValue.get(key)]).sort(),
      internalAmbiguities,
      materialCount: material.length,
      candidateCount: candidates.length
    };
  }

  const selectedKey = keys[0];
  const selectedGroups = groupsByValue.get(selectedKey);
  const selected = material.filter((item) => (
    selectedGroups.has(item.providerGroup)
    && valueKey(field, item.value) === selectedKey
  ));
  return {
    value: valuesByKey.get(selectedKey),
    supportCount: selectedGroups.size,
    qualitySignal: Math.min(...selected.map((item) => item.confidence)),
    conflict: false,
    conflictingValues: [],
    conflictingGroups: [],
    internalAmbiguities,
    materialCount: material.length,
    candidateCount: candidates.length
  };
}

function conflict(code, field, resolvedField) {
  return {
    code,
    field,
    values: resolvedField.conflictingValues,
    providerGroups: [...resolvedField.conflictingGroups]
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

  if (amount.conflict) conflicts.push(conflict(ReasonCode.AMOUNT_CONFLICT, "amount", amount));
  if (date.conflict) conflicts.push(conflict(ReasonCode.DATE_CONFLICT, "date", date));
  if (document.conflict) conflicts.push(conflict(ReasonCode.DOCUMENT_CONFLICT, "documentType", document));
  if (status.conflict) conflicts.push(conflict(ReasonCode.STATUS_CONFLICT, "status", status));

  const internalAmbiguities = [
    ["date", date],
    ["amount", amount],
    ["documentType", document],
    ["status", status]
  ].flatMap(([field, resolvedField]) => resolvedField.internalAmbiguities.map((ambiguity) => ({
    field,
    providerGroup: ambiguity.providerGroup,
    values: ambiguity.values
  })));

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
    internalAmbiguities,
    duplicateEvidence: { ...evaluation.duplicateEvidence },
    issues: evaluation.issues.map((item) => ({ ...item })),
    evidence: evaluation.evidence.map((item) => ({ ...item })),
    confidence: qualitySignals.length ? Math.min(...qualitySignals) : 0
  };
}

module.exports = {
  resolveConflicts
};
