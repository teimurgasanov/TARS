"use strict";

const assert = require("assert");
const { loadReceiptCaseHelpers, createStore } = require("./receipt-case-v1-harness");

(async () => {
  const helpers = loadReceiptCaseHelpers();
  helpers.resetReceiptCaseV1ForTests();
  const store = createStore();
  const input = {
    sourceMessageId: "message-one",
    sourceUploadId: "upload-one",
    masterId: "master-one",
    sourceType: "original"
  };

  const created = await helpers.findOrCreateReceiptCaseV1(input, store.read, store.persistence);
  assert(created);
  assert.match(created.caseId, /^rcv1_[a-f0-9]{32}$/);
  assert.strictEqual(created.state, "RECEIVED");
  assert.strictEqual(created.revision, 1);

  const processing = await helpers.transitionReceiptCaseV1(created.caseId, {
    state: "PROCESSING",
    strictDecision: "unknown"
  }, store.read, store.persistence);
  assert.strictEqual(processing.state, "PROCESSING");

  const accepted = await helpers.transitionReceiptCaseV1(created.caseId, {
    state: "ACCEPTED",
    strictDecision: "accept",
    normalizedAmount: 1900,
    normalizedDate: "2026-09-05"
  }, store.read, store.persistence);
  assert.strictEqual(accepted.state, "ACCEPTED");
  assert.deepStrictEqual(accepted.normalizedAmount, { status: "recognized", value: 1900 });
  assert.deepStrictEqual(accepted.normalizedDate, { status: "recognized", value: "2026-09-05" });

  helpers.resetReceiptCaseV1ForTests();
  const afterRestart = await helpers.findOrCreateReceiptCaseV1(input, store.read, store.persistence);
  assert.strictEqual(afterRestart.caseId, created.caseId, "restart/retry must find the same case");
  assert.strictEqual(afterRestart.state, "ACCEPTED");
  assert.strictEqual(afterRestart.revision, accepted.revision, "idempotent lookup must not revise a terminal case");

  const sameBytesNewUpload = await helpers.findOrCreateReceiptCaseV1({
    sourceMessageId: "message-two",
    sourceUploadId: "upload-two",
    masterId: "master-one",
    content: Buffer.from("same receipt bytes")
  }, store.read, store.persistence);
  assert.notStrictEqual(sameBytesNewUpload.caseId, created.caseId, "new upload of the same bytes must create a new case");

  const terminalProtected = await helpers.transitionReceiptCaseV1(created.caseId, {
    state: "DUPLICATE",
    strictDecision: "duplicate"
  }, store.read, store.persistence);
  assert.strictEqual(terminalProtected.state, "ACCEPTED", "retry must not rewrite a terminal case");
  assert.strictEqual(terminalProtected.revision, accepted.revision);

  const bounded = createStore();
  for (let index = 0; index < 3; index += 1) {
    await helpers.findOrCreateReceiptCaseV1({
      sourceMessageId: `bounded-message-${index}`,
      sourceUploadId: `bounded-upload-${index}`,
      masterId: "master-one"
    }, bounded.read, bounded.persistence, { maxRecords: 2 });
  }
  const boundedIndex = bounded.records.get("receipt-case-v1:index");
  assert(boundedIndex);
  assert.strictEqual(boundedIndex.entries.length, 2, "ReceiptCaseV1 persistence must be bounded");

  const expired = await helpers.findOrCreateReceiptCaseV1({
    sourceMessageId: "expired-message",
    sourceUploadId: "expired-upload",
    masterId: "master-one"
  }, bounded.read, bounded.persistence, { maxRecords: 3 });
  const expiredKey = `receipt-case-v1:case:${expired.caseId}`;
  bounded.records.get(expiredKey).updatedAt = Date.now() - 120000;
  const expiryIndex = bounded.records.get("receipt-case-v1:index");
  expiryIndex.entries.find((entry) => entry.caseId === expired.caseId).updatedAt = Date.now() - 120000;
  await helpers.findOrCreateReceiptCaseV1({
    sourceMessageId: "retention-message",
    sourceUploadId: "retention-upload",
    masterId: "master-one"
  }, bounded.read, bounded.persistence, { maxRecords: 3, retentionMs: 60000 });
  assert.strictEqual(bounded.records.has(expiredKey), false, "expired ReceiptCaseV1 records must be removed during bounded writes");

  const brokenRead = createStore({ readError: new Error("lookup failed") });
  assert.strictEqual(await helpers.findOrCreateReceiptCaseV1(input, brokenRead.read, brokenRead.persistence), undefined, "lookup failure must fail open");
  const brokenWrite = createStore({ writeError: new Error("write failed") });
  assert.strictEqual(await helpers.findOrCreateReceiptCaseV1(input, brokenWrite.read, brokenWrite.persistence), undefined, "persistence failure must fail open");
  const transitionTarget = await helpers.findOrCreateReceiptCaseV1({ sourceMessageId: "transition-message", sourceUploadId: "transition-upload" }, store.read, store.persistence);
  const failedTransition = await helpers.transitionReceiptCaseV1(transitionTarget.caseId, {
    state: "PROCESSING",
    strictDecision: "unknown"
  }, store.read, { async updateByAssociation() { throw new Error("transition failed"); } });
  assert.strictEqual(failedTransition, undefined, "transition failure must fail open");
  assert.strictEqual((await helpers.findOrCreateReceiptCaseV1({ sourceMessageId: "transition-message", sourceUploadId: "transition-upload" }, store.read, store.persistence)).state, "RECEIVED", "failed shadow transition must not alter the existing case");

  helpers.resetReceiptCaseV1ForTests();
  const scheduledStore = createStore();
  assert.strictEqual(helpers.scheduleReceiptCaseV1({ ...input, state: "PROCESSING" }, scheduledStore.read, scheduledStore.persistence, { enabled: false }), false);
  assert.deepStrictEqual(scheduledStore.calls, { reads: 0, updates: 0, removes: 0 }, "Case OFF must perform no persistence work");
  assert.strictEqual(helpers.scheduleReceiptCaseV1({ ...input, state: "PROCESSING" }, scheduledStore.read, scheduledStore.persistence, { enabled: true }), true);
  assert.strictEqual(helpers.scheduleReceiptCaseV1({ ...input, state: "ACCEPTED", strictDecision: "accept", normalizedAmount: 1900, normalizedDate: "2026-09-05" }, scheduledStore.read, scheduledStore.persistence, { enabled: true }), true);
  await helpers.flushReceiptCaseV1ForTests();
  const finalRecords = Array.from(scheduledStore.records.entries()).filter(([key]) => key.startsWith("receipt-case-v1:case:")).map(([, value]) => value);
  assert.strictEqual(finalRecords.length, 1, "duplicate scheduled events must retain one case");
  assert.strictEqual(finalRecords[0].state, "ACCEPTED");

  console.log("PASS: ReceiptCaseV1 is idempotent, fail-open and bounded");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
