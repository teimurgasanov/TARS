"use strict";

const assert = require("assert");
const { Difference, classifyDifference } = require("../scanner2/difference-classifier");

const amount = { minorUnits: 80000, currency: "RUB" };
const legacyBase = {
  decision: "ACCEPT",
  reasonCode: "RECEIPT_CONFIRMED",
  date: "2026-08-30",
  amount,
  documentType: "BANK_RECEIPT",
  identity: null,
  duplicateState: "NONE"
};
const scannerBase = {
  decision: "ACCEPT",
  reasonCode: "RECEIPT_CONFIRMED",
  date: "2026-08-30",
  amount,
  documentType: "BANK_RECEIPT",
  identity: null
};

const exact = classifyDifference(legacyBase, scannerBase, "NONE");
assert.strictEqual(exact.difference.primaryDifference, "MATCH");
assert.deepStrictEqual(exact.difference.differenceTags, []);

const transitions = [
  ["ACCEPT", "REVIEW", Difference.LEGACY_ACCEPT_SCANNER_REVIEW, false],
  ["ACCEPT", "REJECT", Difference.LEGACY_ACCEPT_SCANNER_REJECT, true],
  ["REJECT", "ACCEPT", Difference.LEGACY_REJECT_SCANNER_ACCEPT, true],
  ["REJECT", "REVIEW", Difference.LEGACY_REJECT_SCANNER_REVIEW, false],
  ["REVIEW", "ACCEPT", Difference.LEGACY_REVIEW_SCANNER_ACCEPT, false],
  ["REVIEW", "REJECT", Difference.LEGACY_REVIEW_SCANNER_REJECT, false]
];
for (const [legacyDecision, scannerDecision, expected, dangerous] of transitions) {
  const result = classifyDifference(
    { ...legacyBase, decision: legacyDecision },
    { ...scannerBase, decision: scannerDecision },
    "NONE"
  );
  assert.strictEqual(result.difference.primaryDifference, expected);
  assert.strictEqual(result.difference.dangerous, dangerous);
}

const fieldCases = [
  [{ amount: { minorUnits: 300, currency: "RUB" } }, "NONE", Difference.AMOUNT_DIFFERENCE],
  [{ date: "2026-08-29" }, "NONE", Difference.DATE_DIFFERENCE],
  [{ documentType: "BANK_TRANSFER" }, "NONE", Difference.DOCUMENT_TYPE_DIFFERENCE],
  [{ identity: "scanner2:v1:id:syntheticb|2026-08-30|80000" }, "NONE", Difference.IDENTITY_DIFFERENCE],
  [{ reasonCode: "DOCUMENT_CONFIRMED" }, "NONE", Difference.REASON_CODE_DIFFERENCE],
  [{}, "POSSIBLE", Difference.DUPLICATE_DIFFERENCE]
];
for (const [scannerChange, duplicateState, expected] of fieldCases) {
  const result = classifyDifference(legacyBase, { ...scannerBase, ...scannerChange }, duplicateState);
  assert.strictEqual(result.difference.primaryDifference, expected);
  assert.ok(result.difference.differenceTags.includes(expected));
}

const multiDifference = classifyDifference(
  { ...legacyBase, decision: "REJECT", duplicateState: "NONE" },
  { ...scannerBase, decision: "ACCEPT", amount: { minorUnits: 300, currency: "RUB" } },
  "POSSIBLE"
);
assert.strictEqual(multiDifference.difference.primaryDifference, Difference.LEGACY_REJECT_SCANNER_ACCEPT);
assert.strictEqual(multiDifference.difference.dangerous, true);
assert.ok(multiDifference.difference.differenceTags.includes(Difference.AMOUNT_DIFFERENCE));
assert.ok(multiDifference.difference.differenceTags.includes(Difference.DUPLICATE_DIFFERENCE));
assert.strictEqual(Difference.DECISION_DIFFERENCE, "DECISION_DIFFERENCE");

console.log("PASS: Scanner 2.0 difference classifier preserves all tags and highlights dangerous transitions");
