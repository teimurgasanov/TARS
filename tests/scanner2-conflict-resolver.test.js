"use strict";

const assert = require("assert");
const { evaluateRules } = require("../scanner2/rule-engine");
const { resolveConflicts } = require("../scanner2/conflict-resolver");
const { makeDecision } = require("../scanner2/decision-engine");

function observation(providerGroup, amountMinor, confidence = 0.9, date = "2026-08-30") {
  return {
    source: providerGroup === "openai" ? "VISION" : "OCR",
    providerGroup,
    documentType: "BANK_RECEIPT",
    date,
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

const internallyAmbiguousAmount = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [observation("yandex", 30000), observation("yandex", 300)]
}));
assert.strictEqual(internallyAmbiguousAmount.amount, null);
assert.deepStrictEqual(internallyAmbiguousAmount.conflicts, []);
assert.deepStrictEqual(
  internallyAmbiguousAmount.internalAmbiguities.map((item) => [item.field, item.providerGroup]),
  [["amount", "yandex"]]
);
const internallyAmbiguousAmountDecision = makeDecision(internallyAmbiguousAmount);
assert.strictEqual(internallyAmbiguousAmountDecision.decision, "REVIEW");
assert.strictEqual(internallyAmbiguousAmountDecision.reasonCode, "INSUFFICIENT_EVIDENCE");

const conflict = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [observation("yandex", 30000), observation("openai", 300)]
}));
assert.strictEqual(conflict.amount, null);
assert.deepStrictEqual(conflict.conflicts.map((item) => item.code), ["AMOUNT_CONFLICT"]);
assert.strictEqual(makeDecision(conflict).reasonCode, "AMOUNT_CONFLICT");

const amountConsensus = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [
    observation("yandex", 30000),
    observation("yandex", 30000, 0.95),
    observation("openai", 30000)
  ]
}));
assert.deepStrictEqual(amountConsensus.amount, { minorUnits: 30000, currency: "RUB" });
assert.strictEqual(amountConsensus.support.amount, 2);
assert.strictEqual(makeDecision(amountConsensus).decision, "ACCEPT");

const lowQualityOutlier = observation("openai", 300, 0.4);
const noMaterialConflict = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [observation("yandex", 30000), lowQualityOutlier]
}));
assert.deepStrictEqual(noMaterialConflict.amount, { minorUnits: 30000, currency: "RUB" });
assert.deepStrictEqual(noMaterialConflict.conflicts, []);

const internallyAmbiguousDate = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [
    observation("yandex", 30000, 0.9, "2026-08-30"),
    observation("yandex", 30000, 0.9, "2026-08-29")
  ]
}));
assert.strictEqual(internallyAmbiguousDate.date, null);
assert.deepStrictEqual(internallyAmbiguousDate.conflicts, []);
assert.ok(internallyAmbiguousDate.internalAmbiguities.some((item) => item.field === "date" && item.providerGroup === "yandex"));
assert.strictEqual(makeDecision(internallyAmbiguousDate).reasonCode, "INSUFFICIENT_EVIDENCE");

const independentDateConflict = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [
    observation("yandex", 30000, 0.9, "2026-08-30"),
    observation("openai", 30000, 0.9, "2026-08-29")
  ]
}));
assert.deepStrictEqual(independentDateConflict.conflicts.map((item) => item.code), ["DATE_CONFLICT"]);
assert.strictEqual(makeDecision(independentDateConflict).reasonCode, "DATE_CONFLICT");

const dateConsensus = resolveConflicts(evaluateRules({
  acceptedDates: ["2026-08-30"],
  observations: [
    observation("yandex", 30000, 0.9, "2026-08-30"),
    observation("yandex", 30000, 0.95, "2026-08-30"),
    observation("openai", 30000, 0.9, "2026-08-30")
  ]
}));
assert.strictEqual(dateConsensus.date, "2026-08-30");
assert.strictEqual(dateConsensus.support.date, 2);
assert.strictEqual(makeDecision(dateConsensus).decision, "ACCEPT");

console.log("PASS: Scanner2ConflictResolver respects independence and material conflicts");
