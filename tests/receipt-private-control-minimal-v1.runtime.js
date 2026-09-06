"use strict";

const fs = require("fs");
const assert = require("assert");
const { loadReceiptCaseHelpers, createStore } = require("./receipt-case-v1-harness");

const source = fs.readFileSync("TarsReportApp.js", "utf8");

function block(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `missing source block: ${startMarker}`);
  return source.slice(start, end);
}

(async () => {
  const publish = block("async function publishRejectedReceiptReview", "async function archiveUploadExists");
  const handler = block("async handleApproveReceiptButton", "photoReportIntentAssociation");

  assert.doesNotMatch(publish, /ensureReceiptReviewRoom|uploadBuffer|createReviewMessageForUpload|RECEIPT_REVIEW_ROOM/, "new receipt controls must not create or copy into cheki-kontrol");
  assert.match(publish, /notifyUser\(/, "reviewers must receive a private notification");
  assert.match(publish, /\["teimur", "shura"\]/, "only Teimur and Shura are private reviewers");
  assert.match(publish, /receiptPrivateControlEntryTokenV1/, "button payload must use a one-way entry token");
  assert.doesNotMatch(publish, /value: String\(reviewDetails\.exact\)/, "raw exact hash must not be exposed in the button");

  const authorization = handler.indexOf("privateReceiptControlActorAllowed");
  const indexRead = handler.indexOf("G.readIndex");
  assert(authorization >= 0 && indexRead > authorization, "server authorization must happen before receipt index read");
  assert.match(handler, /candidate\.source === "rejected"/, "manual action must only accept unresolved rejected entries");
  assert.match(handler, /manualTransitionReceiptCaseV1/, "manual acceptance must update the existing ReceiptCase");
  assert.match(handler, /createReceiptProcessingStatusManager[\s\S]*syncCase/, "manual acceptance must update the canonical status message");
  assert.strictEqual((source.match(/ensureReceiptReviewRoom\(/g) || []).length, 0, "the app must not retain a cheki-kontrol room creator");
  assert.strictEqual((source.match(/privateControl: true/g) || []).length, 2, "only the two personal CONTROL paths may publish a private action");
  assert.match(source, /if \(!isPersonalTarsRoom\(message\.room\)\) await deleteReceiptMessage/, "an existing personal CONTROL original must be retained");
  assert.match(source, /message\.sender && !isPersonalTarsRoom\(message\.room\)\) await deleteReceiptMessage/, "a new personal CONTROL original must be retained");

  const helpers = loadReceiptCaseHelpers();
  assert.strictEqual(typeof helpers.findReceiptCaseForInputV1, "function");
  assert.strictEqual(typeof helpers.manualTransitionReceiptCaseV1, "function");
  const store = createStore();
  const input = { sourceMessageId: "control-message", sourceUploadId: "control-upload", masterId: "control-master" };
  const created = await helpers.findOrCreateReceiptCaseV1(input, store.read, store.persistence);
  await helpers.transitionReceiptCaseV1(created.caseId, { state: "PROCESSING" }, store.read, store.persistence);
  await helpers.transitionReceiptCaseV1(created.caseId, {
    state: "CONTROL", strictDecision: "control", controlReason: "amount_missing"
  }, store.read, store.persistence);
  const found = await helpers.findReceiptCaseForInputV1(input, store.read);
  assert.strictEqual(found.caseId, created.caseId);
  const accepted = await helpers.manualTransitionReceiptCaseV1(found.caseId, {
    normalizedAmount: 600, normalizedDate: "2026-09-06"
  }, store.read, store.persistence);
  assert.strictEqual(accepted.state, "ACCEPTED");
  assert.strictEqual(accepted.strictDecision, "accept");
  assert.deepStrictEqual(accepted.normalizedAmount, { status: "recognized", value: 600 });

  const duplicateRewrite = await helpers.manualTransitionReceiptCaseV1(created.caseId, {
    normalizedAmount: 700, normalizedDate: "2026-09-06"
  }, store.read, store.persistence);
  assert.strictEqual(duplicateRewrite.state, "ACCEPTED", "repeated click must not rewrite an accepted case");
  assert.deepStrictEqual(duplicateRewrite.normalizedAmount, { status: "recognized", value: 600 });

  console.log("PASS: disputed receipts stay personal and reuse guarded manual acceptance helpers");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
