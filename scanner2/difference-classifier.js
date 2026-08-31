"use strict";

const Difference = Object.freeze({
  MATCH: "MATCH",
  LEGACY_ACCEPT_SCANNER_REVIEW: "LEGACY_ACCEPT_SCANNER_REVIEW",
  LEGACY_ACCEPT_SCANNER_REJECT: "LEGACY_ACCEPT_SCANNER_REJECT",
  LEGACY_REJECT_SCANNER_ACCEPT: "LEGACY_REJECT_SCANNER_ACCEPT",
  LEGACY_REJECT_SCANNER_REVIEW: "LEGACY_REJECT_SCANNER_REVIEW",
  LEGACY_REVIEW_SCANNER_ACCEPT: "LEGACY_REVIEW_SCANNER_ACCEPT",
  LEGACY_REVIEW_SCANNER_REJECT: "LEGACY_REVIEW_SCANNER_REJECT",
  AMOUNT_DIFFERENCE: "AMOUNT_DIFFERENCE",
  DATE_DIFFERENCE: "DATE_DIFFERENCE",
  DOCUMENT_TYPE_DIFFERENCE: "DOCUMENT_TYPE_DIFFERENCE",
  DUPLICATE_DIFFERENCE: "DUPLICATE_DIFFERENCE",
  IDENTITY_DIFFERENCE: "IDENTITY_DIFFERENCE",
  REASON_CODE_DIFFERENCE: "REASON_CODE_DIFFERENCE",
  DECISION_DIFFERENCE: "DECISION_DIFFERENCE"
});

const Comparison = Object.freeze({
  MATCH: "MATCH",
  DIFFERENT: "DIFFERENT",
  LEGACY_ONLY: "LEGACY_ONLY",
  SCANNER_ONLY: "SCANNER_ONLY",
  BOTH_MISSING: "BOTH_MISSING"
});

const DECISION_TRANSITIONS = Object.freeze({
  "ACCEPT->REVIEW": Difference.LEGACY_ACCEPT_SCANNER_REVIEW,
  "ACCEPT->REJECT": Difference.LEGACY_ACCEPT_SCANNER_REJECT,
  "REJECT->ACCEPT": Difference.LEGACY_REJECT_SCANNER_ACCEPT,
  "REJECT->REVIEW": Difference.LEGACY_REJECT_SCANNER_REVIEW,
  "REVIEW->ACCEPT": Difference.LEGACY_REVIEW_SCANNER_ACCEPT,
  "REVIEW->REJECT": Difference.LEGACY_REVIEW_SCANNER_REJECT
});

const PRIMARY_PRIORITY = [
  Difference.LEGACY_REJECT_SCANNER_ACCEPT,
  Difference.LEGACY_ACCEPT_SCANNER_REJECT,
  Difference.LEGACY_ACCEPT_SCANNER_REVIEW,
  Difference.LEGACY_REJECT_SCANNER_REVIEW,
  Difference.LEGACY_REVIEW_SCANNER_ACCEPT,
  Difference.LEGACY_REVIEW_SCANNER_REJECT,
  Difference.DECISION_DIFFERENCE,
  Difference.DUPLICATE_DIFFERENCE,
  Difference.AMOUNT_DIFFERENCE,
  Difference.DATE_DIFFERENCE,
  Difference.DOCUMENT_TYPE_DIFFERENCE,
  Difference.IDENTITY_DIFFERENCE,
  Difference.REASON_CODE_DIFFERENCE
];

function compareNullable(left, right, equal) {
  if (left === null && right === null) return Comparison.BOTH_MISSING;
  if (left === null) return Comparison.SCANNER_ONLY;
  if (right === null) return Comparison.LEGACY_ONLY;
  return equal(left, right) ? Comparison.MATCH : Comparison.DIFFERENT;
}

function compareAmount(left, right) {
  return compareNullable(left, right, (a, b) => (
    a.minorUnits === b.minorUnits && a.currency === b.currency
  ));
}

function classifyDifference(legacyDecision, scanner2Decision, scannerDuplicateState) {
  const comparisons = {
    decision: legacyDecision.decision === scanner2Decision.decision ? Comparison.MATCH : Comparison.DIFFERENT,
    reasonCode: compareNullable(legacyDecision.reasonCode, scanner2Decision.reasonCode, (a, b) => a === b),
    date: compareNullable(legacyDecision.date, scanner2Decision.date, (a, b) => a === b),
    amount: compareAmount(legacyDecision.amount, scanner2Decision.amount),
    documentType: legacyDecision.documentType === scanner2Decision.documentType ? Comparison.MATCH : Comparison.DIFFERENT,
    identity: compareNullable(legacyDecision.identity, scanner2Decision.identity, (a, b) => a === b),
    duplicate: legacyDecision.duplicateState === scannerDuplicateState ? Comparison.MATCH : Comparison.DIFFERENT
  };
  const tags = [];
  if (comparisons.decision !== Comparison.MATCH) {
    tags.push(DECISION_TRANSITIONS[legacyDecision.decision + "->" + scanner2Decision.decision] || Difference.DECISION_DIFFERENCE);
  }
  if (comparisons.amount !== Comparison.MATCH && comparisons.amount !== Comparison.BOTH_MISSING) tags.push(Difference.AMOUNT_DIFFERENCE);
  if (comparisons.date !== Comparison.MATCH && comparisons.date !== Comparison.BOTH_MISSING) tags.push(Difference.DATE_DIFFERENCE);
  if (comparisons.documentType !== Comparison.MATCH) tags.push(Difference.DOCUMENT_TYPE_DIFFERENCE);
  if (comparisons.duplicate !== Comparison.MATCH) tags.push(Difference.DUPLICATE_DIFFERENCE);
  if (comparisons.identity !== Comparison.MATCH && comparisons.identity !== Comparison.BOTH_MISSING) tags.push(Difference.IDENTITY_DIFFERENCE);
  if (comparisons.reasonCode !== Comparison.MATCH && comparisons.reasonCode !== Comparison.BOTH_MISSING) tags.push(Difference.REASON_CODE_DIFFERENCE);

  const uniqueTags = [...new Set(tags)];
  const primaryDifference = PRIMARY_PRIORITY.find((item) => uniqueTags.includes(item)) || Difference.MATCH;
  const dangerous = primaryDifference === Difference.LEGACY_REJECT_SCANNER_ACCEPT
    || primaryDifference === Difference.LEGACY_ACCEPT_SCANNER_REJECT;
  const decisionDifference = comparisons.decision !== Comparison.MATCH;
  const severity = dangerous ? "CRITICAL" : decisionDifference ? "WARNING" : uniqueTags.length ? "INFO" : "NONE";
  return {
    comparisons,
    difference: {
      primaryDifference,
      differenceTags: uniqueTags,
      dangerous,
      severity
    }
  };
}

module.exports = {
  Difference,
  Comparison,
  classifyDifference
};
