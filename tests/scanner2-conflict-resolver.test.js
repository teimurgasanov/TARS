"use strict";

const assert = require("assert");
const { evaluateRules } = require("../scanner2/rule-engine");
const { resolveConflicts } = require("../scanner2/conflict-resolver");

function observation(providerGroup, amountMinor, confidence = 0.9) {
  return {
    source: providerGroup === "openai" ? "VISION" : "OCR",
    providerGroup,
    documentType: "BANK_RECEIPT",
    date: "2026-08-30",
    amount: { minorUnits: amountMinor, currency: "RUB" },
    status: "SUCCESS",
    confidence,
    reference: providerGroup
  };
}

const correlated = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [observation("yandex", 30000), observation("yandex", 30000, 0.95)]
}));
assert.strictEqual(correlated.support.amount, 1, "same provider group must count once");

const conflict = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [observation("yandex", 30000), observation("openai", 300)]
}));
assert.strictEqual(conflict.amount, null);
assert.deepStrictEqual(conflict.conflicts.map((item) => item.code), ["AMOUNT_CONFLICT"]);

const lowQualityOutlier = observation("openai", 300, 0.4);
const noMaterialConflict = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [observation("yandex", 30000), lowQualityOutlier]
}));
assert.deepStrictEqual(noMaterialConflict.amount, { minorUnits: 30000, currency: "RUB" });
assert.deepStrictEqual(noMaterialConflict.conflicts, []);

console.log("PASS: Scanner2ConflictResolver respects independence and material conflicts");
