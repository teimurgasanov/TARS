"use strict";

const { Difference, Comparison } = require("./difference-classifier");

function metric(count, denominator) {
  return {
    count,
    denominator,
    rate: denominator === 0 ? null : count / denominator
  };
}

function fieldDisagreement(comparisons, field) {
  const eligible = comparisons.filter((item) => item.comparisons[field] !== Comparison.BOTH_MISSING);
  return metric(
    eligible.filter((item) => item.comparisons[field] !== Comparison.MATCH).length,
    eligible.length
  );
}

function aggregateOfflineMetrics(comparisons) {
  if (!Array.isArray(comparisons)) throw new TypeError("comparisons must be an array");
  const totalCases = comparisons.length;
  const legacyAccept = comparisons.filter((item) => item.legacyDecision.decision === "ACCEPT");
  const legacyReject = comparisons.filter((item) => item.legacyDecision.decision === "REJECT");
  const dangerous = comparisons.filter((item) => item.difference.dangerous);
  const decisionMatrix = {};
  for (const legacy of ["ACCEPT", "REJECT", "REVIEW"]) {
    for (const scanner of ["ACCEPT", "REJECT", "REVIEW"]) {
      decisionMatrix[legacy + "->" + scanner] = 0;
    }
  }
  comparisons.forEach((item) => {
    const key = item.legacyDecision.decision + "->" + item.scanner2Decision.decision;
    if (!Object.prototype.hasOwnProperty.call(decisionMatrix, key)) throw new TypeError("comparison decision is invalid");
    decisionMatrix[key] += 1;
  });

  return {
    totalCases,
    decisionAgreement: metric(
      comparisons.filter((item) => item.comparisons.decision === Comparison.MATCH).length,
      totalCases
    ),
    exactMatch: metric(
      comparisons.filter((item) => item.difference.primaryDifference === Difference.MATCH).length,
      totalCases
    ),
    acceptAgreement: metric(
      legacyAccept.filter((item) => item.scanner2Decision.decision === "ACCEPT").length,
      legacyAccept.length
    ),
    rejectAgreement: metric(
      legacyReject.filter((item) => item.scanner2Decision.decision === "REJECT").length,
      legacyReject.length
    ),
    scannerReviewRate: metric(
      comparisons.filter((item) => item.scanner2Decision.decision === "REVIEW").length,
      totalCases
    ),
    amountDisagreement: fieldDisagreement(comparisons, "amount"),
    dateDisagreement: fieldDisagreement(comparisons, "date"),
    duplicateDisagreement: metric(
      comparisons.filter((item) => item.comparisons.duplicate !== Comparison.MATCH).length,
      totalCases
    ),
    dangerousDisagreements: {
      total: dangerous.length,
      legacyRejectScannerAccept: dangerous.filter((item) => (
        item.difference.primaryDifference === Difference.LEGACY_REJECT_SCANNER_ACCEPT
      )).length,
      legacyAcceptScannerReject: dangerous.filter((item) => (
        item.difference.primaryDifference === Difference.LEGACY_ACCEPT_SCANNER_REJECT
      )).length,
      caseIds: dangerous.map((item) => item.caseId)
    },
    decisionMatrix
  };
}

module.exports = {
  aggregateOfflineMetrics
};
