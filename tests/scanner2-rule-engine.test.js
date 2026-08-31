"use strict";

const assert = require("assert");
const { evaluateRules } = require("../scanner2/rule-engine");

const input = {
  acceptedDates: ["2026-08-30"],
  observations: [{
    source: "OCR",
    providerGroup: "yandex",
    documentType: "BANK_RECEIPT",
    date: "2026-08-30",
    amount: { minorUnits: 30000, currency: "RUB" },
    status: "SUCCESS",
    confidence: 0.9,
    fieldConfidence: { amount: 0.4 },
    reference: "fixture"
  }],
  duplicateEvidence: { state: "NONE", reference: null }
};
const before = JSON.stringify(input);
const result = evaluateRules(input);

assert.strictEqual(JSON.stringify(input), before, "rule engine must not mutate input");
assert.strictEqual(result.candidates.dates.length, 1);
assert.strictEqual(result.candidates.amounts.length, 1);
assert.strictEqual(result.candidates.amounts[0].confidence, 0.4);
assert.notStrictEqual(result.acceptedDates, input.acceptedDates);
assert.strictEqual(result.evidence.length, 4);

const invalidAmount = evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [{
    source: "OCR",
    providerGroup: "yandex",
    documentType: "BANK_RECEIPT",
    date: "2026-08-30",
    amount: { minorUnits: 0, currency: "RUB" },
    status: "SUCCESS",
    confidence: 0.9,
    reference: null
  }]
});
assert.deepStrictEqual(invalidAmount.issues.map((issue) => issue.code), ["INVALID_AMOUNT"]);

console.log("PASS: Scanner2RuleEngine normalizes evidence without side effects");
