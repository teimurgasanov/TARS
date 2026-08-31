"use strict";

const fs = require("fs");
const assert = require("assert");
const { adaptLegacySnapshot, identityInputFromEvidence } = require("../scanner2/legacy-adapter");

const dataset = JSON.parse(fs.readFileSync("tests/fixtures/scanner2/offline-shadow-cases.json", "utf8"));
const source = dataset.cases[0];
const snapshot = JSON.stringify(source);
const adapted = adaptLegacySnapshot(source);

assert.strictEqual(JSON.stringify(source), snapshot, "adapter must not mutate snapshot");
assert.strictEqual(adapted.observations.length, 2);
assert.strictEqual(adapted.observations[0].source, "OCR");
assert.strictEqual(adapted.observations[0].providerGroup, "yandex");
assert.strictEqual(adapted.observations[1].source, "VISION");
assert.strictEqual(adapted.observations[1].providerGroup, "openai");
assert.strictEqual(adapted.observations[0].documentType, "BANK_RECEIPT");
assert.strictEqual(adapted.observations[0].status, "SUCCESS");
assert.deepStrictEqual(adapted.observations[0].amount, { minorUnits: 80000, currency: "RUB" });

const multiPass = JSON.parse(snapshot);
multiPass.legacyOcrResults.push({ ...multiPass.legacyOcrResults[0], passId: "ocr-pass-2" });
multiPass.legacyVisionResults.push({ ...multiPass.legacyVisionResults[0], passId: "vision-pass-2" });
const adaptedMultiPass = adaptLegacySnapshot(multiPass);
assert.deepStrictEqual(
  adaptedMultiPass.observations.filter((item) => item.source === "OCR").map((item) => item.providerGroup),
  ["yandex", "yandex"]
);
assert.deepStrictEqual(
  adaptedMultiPass.observations.filter((item) => item.source === "VISION").map((item) => item.providerGroup),
  ["openai", "openai"]
);

const identityCase = adaptLegacySnapshot(dataset.cases.find((item) => item.caseId === "case-reject-accept"));
assert.deepStrictEqual(
  identityInputFromEvidence(identityCase.scannerIdentityEvidence, "2026-08-30", { minorUnits: 130000, currency: "RUB" }),
  { transactionId: "anon-txn-a", date: "2026-08-30", amount: { minorUnits: 130000, currency: "RUB" } }
);
assert.deepStrictEqual(identityInputFromEvidence(null, "2026-08-30", { minorUnits: 1, currency: "RUB" }), {});

console.log("PASS: Scanner2LegacyAdapter normalizes legacy passes and fixes provider independence");
