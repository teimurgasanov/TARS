"use strict";

const assert = require("assert");
const { DocumentType, OperationStatus, DuplicateState, Decision } = require("../scanner2/contracts");
const {
  SHADOW_SCHEMA_VERSION,
  SHADOW_PROVENANCE,
  MAX_SHADOW_OBSERVATIONS,
  MAX_SHADOW_SNAPSHOT_BYTES,
  validateShadowSnapshot,
  shadowRecordState
} = require("../scanner2/shadow-contract");
const { createShadowTokenizer } = require("../scanner2/shadow-tokenizer");

const tokenizer = createShadowTokenizer({ secret: "contract-test-secret-that-is-at-least-32-bytes", tokenKeyVersion: "k1" });
const amount = { minorUnits: 30000, currency: "RUB" };

function snapshot(final = true) {
  return {
    schemaVersion: SHADOW_SCHEMA_VERSION,
    caseId: tokenizer.tokenizeCase("contract-case"),
    provenance: SHADOW_PROVENANCE,
    captureBucket: "2026-W36",
    acceptedDates: ["2026-09-01"],
    legacyOcrResults: [{
      passType: "page",
      date: "2026-09-01",
      amount,
      documentType: DocumentType.OTHER_FINANCIAL_DOCUMENT,
      status: OperationStatus.SUCCESS,
      qualitySignal: 1
    }],
    legacyVisionResults: [{
      passType: "primary",
      date: "2026-09-01",
      amount,
      documentType: DocumentType.BANK_RECEIPT,
      status: OperationStatus.SUCCESS,
      qualitySignal: 1
    }],
    duplicateEvidence: {
      state: DuplicateState.NONE,
      matchType: "NONE",
      referenceToken: null,
      exactToken: tokenizer.tokenizeExact("exact-value"),
      visualToken: tokenizer.tokenizeVisual("visual-value")
    },
    legacyDecision: final ? {
      decision: Decision.ACCEPT,
      reasonCode: "LEGACY_ACCEPTED",
      date: "2026-09-01",
      amount,
      documentType: DocumentType.BANK_RECEIPT,
      duplicateState: DuplicateState.NONE,
      strongIdentityEvidence: {
        kind: "DOCUMENT_ID_TOKEN",
        token: tokenizer.tokenizeDocument("document-value")
      }
    } : null,
    tokenKeyVersion: "k1"
  };
}

const valid = snapshot();
const before = JSON.stringify(valid);
const cloned = validateShadowSnapshot(valid);
assert.deepStrictEqual(cloned, valid);
assert.notStrictEqual(cloned, valid);
assert.strictEqual(JSON.stringify(valid), before, "contract validation must not mutate input");
assert.strictEqual(shadowRecordState(valid), "FINAL");
assert.strictEqual(shadowRecordState(snapshot(false)), "DRAFT");
assert.strictEqual(MAX_SHADOW_OBSERVATIONS, 8);
assert.strictEqual(MAX_SHADOW_SNAPSHOT_BYTES, 8192);

const unknown = snapshot();
unknown.extra = "forbidden";
assert.throws(() => validateShadowSnapshot(unknown), /not allowed/);

const malformed = snapshot();
malformed.legacyOcrResults[0].amount = { minorUnits: 300.5, currency: "RUB" };
assert.throws(() => validateShadowSnapshot(malformed), /amount/);

const tooMany = snapshot();
tooMany.legacyOcrResults = Array.from({ length: 9 }, () => ({ ...tooMany.legacyOcrResults[0] }));
tooMany.legacyVisionResults = [];
assert.throws(() => validateShadowSnapshot(tooMany), /observation limit/);

const wrongDomain = snapshot();
wrongDomain.duplicateEvidence.exactToken = tokenizer.tokenizeVisual("not-exact");
assert.throws(() => validateShadowSnapshot(wrongDomain), /tokenized ex/);

const wrongVersion = snapshot();
wrongVersion.tokenKeyVersion = "k2";
assert.throws(() => validateShadowSnapshot(wrongVersion), /caseId/);

const undefinedValue = snapshot();
undefinedValue.legacyDecision.date = undefined;
assert.throws(() => validateShadowSnapshot(undefinedValue), /date/);

console.log("PASS: Stage 3A shadow contract is strict, bounded, and distinguishes DRAFT from FINAL");
