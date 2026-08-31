"use strict";

const { evaluateRules } = require("./rule-engine");
const { resolveConflicts } = require("./conflict-resolver");
const { buildIdentity } = require("./identity-builder");
const { makeDecision } = require("./decision-engine");
const { adaptLegacySnapshot, identityInputFromEvidence } = require("./legacy-adapter");
const { classifyDifference } = require("./difference-classifier");
const { aggregateOfflineMetrics } = require("./offline-metrics");
const { validateOfflineDataset } = require("./offline-dataset");

function runOfflineComparison(snapshot) {
  const adapted = adaptLegacySnapshot(snapshot);
  const evaluation = evaluateRules({
    observations: adapted.observations,
    acceptedDates: adapted.acceptedDates,
    duplicateEvidence: adapted.duplicateEvidence
  });
  const resolved = resolveConflicts(evaluation);
  const scannerIdentity = buildIdentity(identityInputFromEvidence(
    adapted.scannerIdentityEvidence,
    resolved.date,
    resolved.amount
  ));
  const scanner2Decision = makeDecision(resolved, { identity: scannerIdentity });
  const legacyIdentity = buildIdentity(identityInputFromEvidence(
    adapted.legacyDecision.strongIdentityEvidence,
    adapted.legacyDecision.date,
    adapted.legacyDecision.amount
  ));
  const legacyDecision = {
    decision: adapted.legacyDecision.decision,
    reasonCode: adapted.legacyDecision.reasonCode,
    date: adapted.legacyDecision.date,
    amount: adapted.legacyDecision.amount,
    documentType: adapted.legacyDecision.documentType,
    identity: legacyIdentity,
    duplicateState: adapted.legacyDecision.duplicateState
  };
  const classified = classifyDifference(
    legacyDecision,
    scanner2Decision,
    adapted.duplicateEvidence.state
  );
  return {
    caseId: adapted.caseId,
    legacyDecision,
    scanner2Decision,
    comparisons: classified.comparisons,
    difference: classified.difference,
    groundTruth: adapted.groundTruth
  };
}

function runOfflineDataset(dataset) {
  const validated = validateOfflineDataset(dataset);
  const comparisons = validated.cases.map(runOfflineComparison);
  return {
    datasetId: validated.datasetId,
    provenance: validated.provenance,
    comparisons,
    metrics: aggregateOfflineMetrics(comparisons)
  };
}

module.exports = {
  runOfflineComparison,
  runOfflineDataset
};
