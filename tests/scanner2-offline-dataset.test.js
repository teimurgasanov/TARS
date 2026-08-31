"use strict";

const fs = require("fs");
const assert = require("assert");
const { validateOfflineDataset } = require("../scanner2/offline-dataset");

const dataset = JSON.parse(fs.readFileSync("tests/fixtures/scanner2/offline-shadow-cases.json", "utf8"));
const snapshot = JSON.stringify(dataset);
const validated = validateOfflineDataset(dataset);
assert.strictEqual(JSON.stringify(dataset), snapshot, "dataset validation must not mutate input");
assert.strictEqual(validated.provenance, "SYNTHETIC");
assert.ok(validated.cases[0].groundTruth);

const redactedDataset = JSON.parse(snapshot);
redactedDataset.provenance = "REDACTED_STRUCTURED";
assert.strictEqual(validateOfflineDataset(redactedDataset).provenance, "REDACTED_STRUCTURED");

const withoutGroundTruth = JSON.parse(snapshot);
delete withoutGroundTruth.cases[0].groundTruth;
assert.doesNotThrow(() => validateOfflineDataset(withoutGroundTruth), "groundTruth must be optional");

function rejectedBySchema(change, pattern) {
  const dirty = JSON.parse(snapshot);
  change(dirty);
  assert.throws(() => validateOfflineDataset(dirty), pattern);
}

rejectedBySchema((dirty) => { dirty.cases[0].legacyOcrResults[0].providerGroup = "invented"; }, /providerGroup.*forbidden/);
rejectedBySchema((dirty) => { dirty.cases[0].legacyOcrResults[0].rawText = "arbitrary text"; }, /rawText.*forbidden/);
for (const forbiddenKey of [
  "message",
  "username",
  "roomId",
  "uploadId",
  "url",
  "image",
  "imageUrl",
  "imagePath",
  "filePath",
  "fullName",
  "phone",
  "cardNumber",
  "accountNumber",
  "documentId",
  "transactionId"
]) {
  rejectedBySchema((dirty) => { dirty.cases[0][forbiddenKey] = "blocked"; }, new RegExp(forbiddenKey + ".*forbidden"));
}
rejectedBySchema((dirty) => { dirty.cases[0].duplicateEvidence.referenceToken = "anon-79991234567"; }, /identifier digits/);
rejectedBySchema((dirty) => {
  dirty.cases[3].scannerIdentityEvidence = { kind: "TIME_BANK", exactTime: "12:34:56", bankCode: "REAL BANK ACCOUNT" };
}, /bankCode/);
rejectedBySchema((dirty) => { dirty.cases[0].note = "free text"; }, /not allowed/);
rejectedBySchema((dirty) => { dirty.cases[0].groundTruth.owner = "name"; }, /not allowed/);
rejectedBySchema((dirty) => { dirty.provenance = "LIVE_MESSAGES"; }, /provenance/);
rejectedBySchema((dirty) => { dirty.cases[1].caseId = dirty.cases[0].caseId; }, /unique/);

console.log("PASS: Scanner 2.0 offline dataset is strict, anonymized, and supports optional ground truth");
