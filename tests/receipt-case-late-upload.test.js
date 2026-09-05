"use strict";

const assert = require("assert");
const { loadReceiptCaseHelpers, createStore } = require("./receipt-case-v1-harness");

(async () => {
  const helpers = loadReceiptCaseHelpers();
  helpers.resetReceiptCaseV1ForTests();
  const store = createStore();

  const preview = await helpers.findOrCreateReceiptCaseV1({
    sourceMessageId: "preliminary-message",
    sourceUploadId: "preview-reference",
    masterId: "master-one",
    sourceType: "preview"
  }, store.read, store.persistence);
  const original = await helpers.findOrCreateReceiptCaseV1({
    sourceMessageId: "settled-message",
    sourceOriginMessageId: "preliminary-message",
    sourceUploadId: "canonical-upload",
    masterId: "master-one",
    sourceType: "original"
  }, store.read, store.persistence);
  const late = await helpers.findOrCreateReceiptCaseV1({
    sourceMessageId: "settled-message",
    sourceUploadId: "canonical-upload",
    masterId: "master-one",
    sourceType: "original"
  }, store.read, store.persistence);

  assert.strictEqual(original.caseId, preview.caseId, "preview and original must resolve to one case");
  assert.strictEqual(late.caseId, preview.caseId, "late canonical event must resolve to the existing case");

  const correlations = helpers.receiptCaseCorrelationsV1({
    sourceMessageId: "settled-message",
    sourceOriginMessageId: "preliminary-message",
    sourceUploadId: "canonical-upload",
    masterId: "master-one"
  });
  assert(correlations.aliases.length >= 3);
  for (const correlation of correlations.aliases) {
    const linkage = store.records.get(`receipt-case-v1:alias:${correlation}`);
    assert(linkage, `missing privacy-safe alias ${correlation}`);
    assert.strictEqual(linkage.caseId, preview.caseId);
  }

  const secondUpload = await helpers.findOrCreateReceiptCaseV1({
    sourceMessageId: "another-message",
    sourceUploadId: "another-upload",
    masterId: "master-one",
    content: Buffer.from("same bytes are deliberately ignored")
  }, store.read, store.persistence);
  assert.notStrictEqual(secondUpload.caseId, preview.caseId, "new upload must not collapse by image bytes");

  console.log("PASS: preview, original, late event and retry correlate without content hashes");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
