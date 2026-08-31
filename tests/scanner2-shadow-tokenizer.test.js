"use strict";

const assert = require("assert");
const { createShadowTokenizer, validSecret } = require("../scanner2/shadow-tokenizer");

const secret = "tokenizer-test-secret-that-is-definitely-long-enough";
const tokenizer = createShadowTokenizer({ secret, tokenKeyVersion: "k1" });
assert.ok(tokenizer);
assert.strictEqual(validSecret(secret), true);
assert.strictEqual(createShadowTokenizer({ secret: "short", tokenKeyVersion: "k1" }), null);
assert.strictEqual(createShadowTokenizer({ secret, tokenKeyVersion: "invalid-version" }), null);

const raw = "sensitive-source-value-12345";
const documentToken = tokenizer.tokenizeDocument(raw);
assert.strictEqual(documentToken, tokenizer.tokenizeDocument(raw), "tokens must be deterministic");
assert.notStrictEqual(documentToken, tokenizer.tokenizeTransaction(raw), "domains must be separated");
assert.notStrictEqual(documentToken, tokenizer.tokenizeExact(raw), "image and identity domains must differ");
assert.ok(!documentToken.includes(raw), "token must not expose its source");
assert.match(documentToken, /^tok-k1-doc-[a-f0-9]{48}$/);
assert.match(tokenizer.tokenizeCase(raw), /^anon-k1-[a-f0-9]{48}$/);
assert.match(tokenizer.tokenizeVisual(raw), /^tok-k1-vis-[a-f0-9]{48}$/);
assert.match(tokenizer.tokenizeDuplicateReference(raw), /^tok-k1-dup-[a-f0-9]{48}$/);

const anotherKey = createShadowTokenizer({ secret: secret + "-different", tokenKeyVersion: "k2" });
assert.notStrictEqual(documentToken, anotherKey.tokenizeDocument(raw), "key rotation must unlink tokens");

const composite = tokenizer.tokenizeCompositeTransaction({
  date: "2026-09-01",
  exactTime: "12:34:56",
  amount: { minorUnits: 130000, currency: "RUB" },
  bank: "Synthetic Bank"
});
assert.match(composite, /^tok-k1-cmp-[a-f0-9]{48}$/);
assert.ok(!composite.includes("Synthetic"));

const caseId = tokenizer.tokenizeCase("date-shift-case");
const first = tokenizer.shiftDateForCase(caseId, "2026-09-01");
const second = tokenizer.shiftDateForCase(caseId, "2026-08-31");
assert.notStrictEqual(first, "2026-09-01", "privacy date shift must be non-zero");
assert.strictEqual(
  (new Date(first + "T00:00:00Z") - new Date(second + "T00:00:00Z")) / 86400000,
  1,
  "relative date distance must be preserved"
);
assert.strictEqual(first, tokenizer.shiftDateForCase(caseId, "2026-09-01"), "date shift must be deterministic");

const sourceSnapshot = {
  caseId,
  acceptedDates: ["2026-09-01"],
  legacyOcrResults: [{ date: "2026-08-31" }],
  legacyVisionResults: [{ date: null }],
  legacyDecision: { date: "2026-09-01" }
};
const original = JSON.stringify(sourceSnapshot);
const shifted = tokenizer.shiftSnapshotDates(sourceSnapshot);
assert.strictEqual(JSON.stringify(sourceSnapshot), original, "date shifting must not mutate input");
assert.strictEqual(shifted.acceptedDates[0], shifted.legacyDecision.date);
assert.strictEqual(shifted.legacyVisionResults[0].date, null);
assert.strictEqual(
  (new Date(shifted.acceptedDates[0] + "T00:00:00Z") - new Date(shifted.legacyOcrResults[0].date + "T00:00:00Z")) / 86400000,
  1
);

console.log("PASS: Stage 3A tokenizer uses domain-separated HMAC and deterministic privacy date shifting");
