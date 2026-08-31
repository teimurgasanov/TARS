"use strict";

const {
  DocumentType,
  OperationStatus,
  EvidenceSource,
  DuplicateState,
  EvidenceField,
  DOCUMENT_TYPES,
  OPERATION_STATUSES,
  EVIDENCE_SOURCES,
  DUPLICATE_STATES,
  isIsoDate,
  isAmount,
  assertConfidence
} = require("./contracts");

const DEFAULT_MATERIAL_THRESHOLD = 0.7;

function fieldConfidence(observation, field) {
  const overrides = observation.fieldConfidence || {};
  const value = Object.prototype.hasOwnProperty.call(overrides, field)
    ? overrides[field]
    : observation.confidence;
  assertConfidence(value, "observation confidence for " + field);
  return value;
}

function candidate(observation, field, value, confidence) {
  return {
    source: observation.source,
    providerGroup: observation.providerGroup,
    field,
    value,
    confidence,
    reference: observation.reference === undefined ? null : observation.reference
  };
}

function evidenceFromCandidate(value) {
  return {
    source: value.source,
    providerGroup: value.providerGroup,
    field: value.field,
    value: value.value,
    confidence: value.confidence,
    reference: value.reference
  };
}

function evaluateRules(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Scanner2RuleEngine input must be an object");
  }
  if (!Array.isArray(input.observations)) throw new TypeError("observations must be an array");
  if (!Array.isArray(input.acceptedDates) || input.acceptedDates.some((date) => !isIsoDate(date))) {
    throw new TypeError("acceptedDates must contain ISO dates");
  }

  const materialThreshold = input.materialThreshold === undefined
    ? DEFAULT_MATERIAL_THRESHOLD
    : input.materialThreshold;
  assertConfidence(materialThreshold, "materialThreshold");

  const dates = [];
  const amounts = [];
  const documentTypes = [];
  const statuses = [];
  const issues = [];

  input.observations.forEach((observation, index) => {
    const label = "observations[" + index + "]";
    if (!observation || typeof observation !== "object" || Array.isArray(observation)) {
      throw new TypeError(label + " must be an object");
    }
    if (!EVIDENCE_SOURCES.has(observation.source) || observation.source === EvidenceSource.DUPLICATE_INDEX) {
      throw new TypeError(label + ".source is invalid for recognition evidence");
    }
    if (typeof observation.providerGroup !== "string" || !observation.providerGroup.trim()) {
      throw new TypeError(label + ".providerGroup is required");
    }
    assertConfidence(observation.confidence, label + ".confidence");
    if (!DOCUMENT_TYPES.has(observation.documentType)) throw new TypeError(label + ".documentType is invalid");
    if (!OPERATION_STATUSES.has(observation.status)) throw new TypeError(label + ".status is invalid");
    if (observation.reference !== undefined && observation.reference !== null && typeof observation.reference !== "string") {
      throw new TypeError(label + ".reference must be a string or null");
    }

    if (observation.date !== null) {
      const confidence = fieldConfidence(observation, "date");
      if (isIsoDate(observation.date)) {
        dates.push(candidate(observation, EvidenceField.DATE, observation.date, confidence));
      } else {
        issues.push({ code: "INVALID_DATE", source: observation.source, providerGroup: observation.providerGroup });
      }
    }

    if (observation.amount !== null) {
      const confidence = fieldConfidence(observation, "amount");
      if (isAmount(observation.amount)) {
        amounts.push(candidate(observation, EvidenceField.AMOUNT, {
          minorUnits: observation.amount.minorUnits,
          currency: observation.amount.currency
        }, confidence));
      } else {
        issues.push({ code: "INVALID_AMOUNT", source: observation.source, providerGroup: observation.providerGroup });
      }
    }

    if (observation.documentType !== DocumentType.UNKNOWN) {
      documentTypes.push(candidate(
        observation,
        EvidenceField.DOCUMENT,
        observation.documentType,
        fieldConfidence(observation, "documentType")
      ));
    }

    if (observation.status !== OperationStatus.UNKNOWN) {
      statuses.push(candidate(
        observation,
        EvidenceField.STATUS,
        observation.status,
        fieldConfidence(observation, "status")
      ));
    }
  });

  const duplicateInput = input.duplicateEvidence || { state: DuplicateState.NONE, reference: null };
  if (!DUPLICATE_STATES.has(duplicateInput.state)) throw new TypeError("duplicateEvidence.state is invalid");
  if (duplicateInput.reference !== undefined && duplicateInput.reference !== null && typeof duplicateInput.reference !== "string") {
    throw new TypeError("duplicateEvidence.reference must be a string or null");
  }
  const duplicateEvidence = {
    state: duplicateInput.state,
    reference: duplicateInput.reference === undefined ? null : duplicateInput.reference
  };

  const evidence = [...dates, ...amounts, ...documentTypes, ...statuses].map(evidenceFromCandidate);
  if (duplicateEvidence.state !== DuplicateState.NONE) {
    evidence.push({
      source: EvidenceSource.DUPLICATE_INDEX,
      providerGroup: "duplicate-index",
      field: EvidenceField.DUPLICATE,
      value: duplicateEvidence.state,
      confidence: duplicateEvidence.state === DuplicateState.CONFIRMED ? 1 : materialThreshold,
      reference: duplicateEvidence.reference
    });
  }

  return {
    acceptedDates: [...input.acceptedDates],
    materialThreshold,
    candidates: { dates, amounts, documentTypes, statuses },
    duplicateEvidence,
    issues,
    evidence
  };
}

module.exports = {
  DEFAULT_MATERIAL_THRESHOLD,
  evaluateRules
};
