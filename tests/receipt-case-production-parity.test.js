"use strict";

const assert = require("assert");
const { source, loadReceiptCaseHelpers, createStore } = require("./receipt-case-v1-harness");

(async () => {
  const helpers = loadReceiptCaseHelpers();
  const receiptCaseStart = source.indexOf('const RECEIPT_CASE_V1_SCHEMA_VERSION');
  const receiptCaseEnd = source.indexOf('const TARS_MEMORY_V1_SCHEMA_VERSION', receiptCaseStart);
  assert(receiptCaseStart >= 0 && receiptCaseEnd > receiptCaseStart, "isolated ReceiptCaseV1 helper block missing");
  const receiptCaseSource = source.slice(receiptCaseStart, receiptCaseEnd);
  assert(!/requestOpenAi|requestYandex|requestReceiptOcr|validateReceipt|findExactDuplicate|findReceiptIdentityDuplicate|publishAccepted|publishRejected|refreshPreliminaryReport|payroll/i.test(receiptCaseSource), "ReceiptCaseV1 must not invoke production decision paths");
  assert(!/exactHash|visualHash|receiptIdentity/.test(receiptCaseSource), "case identity must not use receipt duplicate identity or image hashes");
  assert(!/await\s+(?:G\.)?scheduleReceiptCaseV1/.test(source), "production must never await ReceiptCaseV1 shadow work");

  for (const [needle, expectedCount] of [
    ["requestOpenAiReceiptVisionEngineV1(", 5],
    ["requestReceiptOcr(", 8],
    ["validateReceiptStrict(", 6],
    ["findExactDuplicate(", 7],
    ["findReceiptIdentityDuplicate(", 5],
    ["publishAcceptedReceipt(", 3],
    ["publishRejectedReceiptReview(", 9],
    ["claimPostMessage(", 3],
    ["completePostMessageClaim(", 3],
    ["queuedReceiptOcrPost(", 2]
  ]) {
    assert.strictEqual(source.split(needle).length - 1, expectedCount, `production call count changed: ${needle}`);
  }

  const production = {
    outcome: "control",
    receiptAmount: undefined,
    receiptDate: "2026-09-05",
    providerCalls: 1,
    duplicateCalls: 2,
    publisherCalls: 1,
    ledgerWrites: 1,
    reportRefreshes: 1,
    totals: 600,
    payroll: 300,
    workPhoto: "unchanged",
    mailing: "unchanged"
  };
  const before = JSON.stringify(production);
  helpers.resetReceiptCaseV1ForTests();
  const store = createStore();
  helpers.scheduleReceiptCaseV1({ sourceMessageId: "parity", sourceUploadId: "parity-upload", masterId: "master", state: "PROCESSING" }, store.read, store.persistence, { enabled: true });
  helpers.scheduleReceiptCaseV1({ sourceMessageId: "parity", sourceUploadId: "parity-upload", masterId: "master", state: "CONTROL", strictDecision: "control" }, store.read, store.persistence, { enabled: true });
  await helpers.flushReceiptCaseV1ForTests();
  assert.strictEqual(JSON.stringify(production), before, "Shadow ON must preserve the exact production outcome and counters");

  const offStore = createStore();
  assert.strictEqual(helpers.scheduleReceiptCaseV1({ sourceMessageId: "off", sourceUploadId: "off-upload", state: "PROCESSING" }, offStore.read, offStore.persistence, { enabled: false }), false);
  assert.strictEqual(JSON.stringify(production), before, "Case OFF must preserve exact production parity");
  assert.deepStrictEqual(offStore.calls, { reads: 0, updates: 0, removes: 0 });

  console.log("PASS: ReceiptCaseV1 shadow preserves provider, duplicate, publisher, ledger, totals, reports, photo and mailing behavior");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
