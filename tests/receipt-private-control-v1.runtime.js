"use strict";

const assert = require("assert");
const fs = require("fs");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createStore(entries = [], options = {}) {
  const records = new Map();
  records.set("receipt-duplicate-index-v1", { version: 1, photos: clone(entries) });
  const calls = { reads: 0, updates: 0, removes: 0, receiptIndexUpdates: 0 };
  const read = {
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          calls.reads += 1;
          const value = records.get(associationKey(association));
          return value === undefined ? [] : [clone(value)];
        }
      };
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      calls.updates += 1;
      if (associationKey(association) === "receipt-duplicate-index-v1") {
        calls.receiptIndexUpdates += 1;
        if (options.failReceiptIndexUpdateOnceAt === calls.receiptIndexUpdates) throw new Error("receipt index completion unavailable");
      }
      if (options.failOperationPersistence && associationKey(association).startsWith("receipt-manual-approval-v1:")) {
        throw new Error("operation persistence unavailable");
      }
      records.set(associationKey(association), clone(value));
    },
    async removeByAssociation(association) {
      calls.removes += 1;
      records.delete(associationKey(association));
    }
  };
  return { records, calls, read, persistence };
}

function rejected(overrides = {}) {
  return {
    exact: overrides.exact || "a".repeat(64),
    receiptIdentity: overrides.receiptIdentity || "id:operation-1",
    source: "rejected",
    receiptAmount: overrides.receiptAmount === undefined ? 600 : overrides.receiptAmount,
    receiptDate: overrides.receiptDate === undefined ? "2026-09-06" : overrides.receiptDate,
    invalidReason: "provider disagreement",
    uploadedAt: 100,
    postProcessedAt: 100,
    roomId: overrides.roomId || "master-room",
    userId: "master-id",
    username: "master",
    messageId: overrides.messageId || "message-1",
    uploadId: overrides.uploadId || "upload-1"
  };
}

function callbacks(options = {}) {
  const calls = { memory: 0, refresh: 0, status: 0 };
  return {
    calls,
    handlers: {
      async memory() {
        calls.memory += 1;
        if (options.failMemoryOnce && calls.memory === 1) throw new Error("memory failed");
        return true;
      },
      async refresh() {
        calls.refresh += 1;
        if (options.failRefreshOnce && calls.refresh === 1) throw new Error("refresh failed");
        return true;
      },
      async status() {
        calls.status += 1;
        if (options.failStatusOnce && calls.status === 1) throw new Error("status failed");
        return true;
      }
    }
  };
}

(async () => {
  const loaded = loadTrackedAppWithGuard();
  const guard = loaded.__testGuard;
  assert(guard, "TARS test guard missing");
  for (const name of [
    "receiptPrivateControlEntryTokenV1",
    "receiptManualApprovalOperationTokenV1",
    "sanitizeReceiptManualApprovalOperationV1",
    "runReceiptManualApprovalV1",
    "manualTransitionReceiptCaseV1",
    "resetReceiptManualApprovalV1ForTests"
  ]) assert.strictEqual(typeof guard[name], "function", `${name} missing`);

  // Test-first regression: two different cases for one payment must serialize
  // through one global approval path and only one may become authoritative.
  guard.resetReceiptManualApprovalV1ForTests();
  const first = rejected({ exact: "1".repeat(64), messageId: "message-a", uploadId: "upload-a" });
  const second = rejected({ exact: "2".repeat(64), messageId: "message-b", uploadId: "upload-b" });
  const concurrent = createStore([first, second]);
  const firstCallbacks = callbacks();
  const secondCallbacks = callbacks();
  const [left, right] = await Promise.all([
    guard.runReceiptManualApprovalV1({ entryToken: guard.receiptPrivateControlEntryTokenV1(first), approvedBy: "teimur" }, concurrent.read, concurrent.persistence, firstCallbacks.handlers),
    guard.runReceiptManualApprovalV1({ entryToken: guard.receiptPrivateControlEntryTokenV1(second), approvedBy: "shura" }, concurrent.read, concurrent.persistence, secondCallbacks.handlers)
  ]);
  assert.deepStrictEqual([left.status, right.status].sort(), ["approved", "duplicate_blocked"]);
  const concurrentIndex = concurrent.records.get("receipt-duplicate-index-v1");
  assert.strictEqual(concurrentIndex.photos.filter((entry) => entry.source === "confirmed").length, 1, "one payment must be credited once");
  assert.strictEqual(firstCallbacks.calls.refresh + secondCallbacks.calls.refresh, 1, "derived reports must refresh once");
  const operationRecords = Array.from(concurrent.records.entries()).filter(([key]) => key.startsWith("receipt-manual-approval-v1:"));
  assert.strictEqual(operationRecords.length, 1);
  assert.deepStrictEqual(Object.keys(operationRecords[0][1]), [
    "schemaVersion", "operationToken", "actorToken", "authorityCommitted", "memoryCompleted",
    "refreshCompleted", "statusCompleted", "completed", "createdAt", "updatedAt", "revision"
  ]);
  const serializedOperation = JSON.stringify(operationRecords[0]);
  for (const forbidden of ["operation-1", "message-a", "upload-a", "master-room", "600", "2026-09-06", "1".repeat(64)]) {
    assert(!serializedOperation.includes(forbidden), `approval recovery record leaked private/financial data: ${forbidden}`);
  }

  // Missing fields are never guessed and no financial mutation is made.
  for (const broken of [
    rejected({ exact: "3".repeat(64), receiptAmount: undefined }),
    rejected({ exact: "4".repeat(64), receiptDate: "" })
  ]) {
    if (broken.exact.startsWith("3")) delete broken.receiptAmount;
    guard.resetReceiptManualApprovalV1ForTests();
    const store = createStore([broken]);
    const result = await guard.runReceiptManualApprovalV1({ entryToken: guard.receiptPrivateControlEntryTokenV1(broken), approvedBy: "teimur" }, store.read, store.persistence, callbacks().handlers);
    assert.strictEqual(result.status, "invalid_fields");
    assert.strictEqual(store.records.get("receipt-duplicate-index-v1").photos[0].source, "rejected");
  }

  // A partial failure after the authority write must resume after a simulated
  // restart without another financial transition.
  guard.resetReceiptManualApprovalV1ForTests();
  const recoverableEntry = rejected({ exact: "5".repeat(64), receiptIdentity: "id:restart-safe" });
  const recoveryStore = createStore([recoverableEntry]);
  const recoveryCallbacks = callbacks({ failRefreshOnce: true });
  const selector = { entryToken: guard.receiptPrivateControlEntryTokenV1(recoverableEntry), approvedBy: "teimur" };
  const partial = await guard.runReceiptManualApprovalV1(selector, recoveryStore.read, recoveryStore.persistence, recoveryCallbacks.handlers);
  assert.strictEqual(partial.status, "recovery_pending");
  assert.strictEqual(recoveryStore.records.get("receipt-duplicate-index-v1").photos[0].source, "confirmed", "financial authority must commit before recovery work");
  guard.resetReceiptManualApprovalV1ForTests();
  const resumed = await guard.runReceiptManualApprovalV1(selector, recoveryStore.read, recoveryStore.persistence, recoveryCallbacks.handlers);
  assert.strictEqual(resumed.status, "approved");
  assert.strictEqual(recoveryStore.records.get("receipt-duplicate-index-v1").photos.filter((entry) => entry.source === "confirmed" && entry.receiptIdentity === "id:restart-safe").length, 1);
  assert.strictEqual(recoveryCallbacks.calls.memory, 1, "completed recovery stages must not repeat");
  assert.strictEqual(recoveryCallbacks.calls.refresh, 2, "failed stage must retry once");
  assert.strictEqual(recoveryCallbacks.calls.status, 1);
  assert(Number(recoveryStore.records.get("receipt-duplicate-index-v1").photos[0].manualApprovalCompletedAt) > 0, "completed recovery must be marked in the authoritative index");

  // If the final completion marker write fails after every downstream stage,
  // restart must retry only that marker and not repeat side effects.
  guard.resetReceiptManualApprovalV1ForTests();
  const completionEntry = rejected({ exact: "8".repeat(64), receiptIdentity: "id:completion-safe" });
  const completionStore = createStore([completionEntry], { failReceiptIndexUpdateOnceAt: 2 });
  const completionCallbacks = callbacks();
  const completionSelector = { entryToken: guard.receiptPrivateControlEntryTokenV1(completionEntry), approvedBy: "shura" };
  const completionPartial = await guard.runReceiptManualApprovalV1(completionSelector, completionStore.read, completionStore.persistence, completionCallbacks.handlers);
  assert.strictEqual(completionPartial.status, "recovery_pending");
  assert.strictEqual(completionPartial.authorityCommitted, true);
  guard.resetReceiptManualApprovalV1ForTests();
  const completionResumed = await guard.runReceiptManualApprovalV1(completionSelector, completionStore.read, completionStore.persistence, completionCallbacks.handlers);
  assert.strictEqual(completionResumed.status, "approved");
  assert.deepStrictEqual(completionCallbacks.calls, { memory: 1, refresh: 1, status: 1 }, "completed stages must not repeat after restart");
  assert(Number(completionStore.records.get("receipt-duplicate-index-v1").photos[0].manualApprovalCompletedAt) > 0);

  // Losing the auxiliary operation record must not repeat the financial write;
  // the receipt index marker is the durable recovery source of truth.
  guard.resetReceiptManualApprovalV1ForTests();
  const markerEntry = rejected({ exact: "6".repeat(64), receiptIdentity: "id:marker-safe" });
  const markerStore = createStore([markerEntry], { failOperationPersistence: true });
  const markerCallbacks = callbacks();
  const markerSelector = { entryToken: guard.receiptPrivateControlEntryTokenV1(markerEntry), approvedBy: "teimur" };
  const markerFirst = await guard.runReceiptManualApprovalV1(markerSelector, markerStore.read, markerStore.persistence, markerCallbacks.handlers);
  assert.strictEqual(markerFirst.status, "approved");
  guard.resetReceiptManualApprovalV1ForTests();
  const markerRetry = await guard.runReceiptManualApprovalV1(markerSelector, markerStore.read, markerStore.persistence, markerCallbacks.handlers);
  assert.notStrictEqual(markerRetry.status, "duplicate_blocked");
  assert.strictEqual(markerStore.records.get("receipt-duplicate-index-v1").photos.filter((entry) => entry.source === "confirmed" && entry.receiptIdentity === "id:marker-safe").length, 1);

  // A persistence failure before the financial authority write must never be
  // described as an accepted receipt.
  guard.resetReceiptManualApprovalV1ForTests();
  const unavailableStore = createStore([rejected({ exact: "7".repeat(64) })]);
  unavailableStore.read.getPersistenceReader = () => ({
    async readByAssociation() { throw new Error("receipt index unavailable"); }
  });
  const unavailableResult = await guard.runReceiptManualApprovalV1({ entryToken: "rce_" + "7".repeat(32), approvedBy: "teimur" }, unavailableStore.read, unavailableStore.persistence, callbacks().handlers);
  assert.strictEqual(unavailableResult.status, "failed");
  assert.strictEqual(unavailableResult.authorityCommitted, false);
  assert.strictEqual(unavailableStore.calls.updates, 0);

  // CONTROL -> ACCEPTED is a dedicated transition; other terminal rewrites
  // remain prohibited and normalized fields come from the authoritative entry.
  guard.resetReceiptManualApprovalV1ForTests();
  guard.resetReceiptCaseV1ForTests();
  const caseStore = createStore([]);
  const created = await guard.findOrCreateReceiptCaseV1({ sourceMessageId: "case-message", sourceUploadId: "case-upload", masterId: "master-id" }, caseStore.read, caseStore.persistence);
  await guard.transitionReceiptCaseV1(created.caseId, { state: "PROCESSING" }, caseStore.read, caseStore.persistence);
  await guard.transitionReceiptCaseV1(created.caseId, { state: "CONTROL", strictDecision: "control", normalizedAmount: 600, normalizedDate: "2026-09-06" }, caseStore.read, caseStore.persistence);
  const manuallyAccepted = await guard.manualTransitionReceiptCaseV1(created.caseId, { normalizedAmount: 600, normalizedDate: "2026-09-06" }, caseStore.read, caseStore.persistence);
  assert.strictEqual(manuallyAccepted.state, "ACCEPTED");
  assert.strictEqual(manuallyAccepted.strictDecision, "accept");
  const forbiddenRewrite = await guard.manualTransitionReceiptCaseV1(created.caseId, { state: "DUPLICATE" }, caseStore.read, caseStore.persistence);
  assert.strictEqual(forbiddenRewrite.state, "ACCEPTED");

  // Structural authorization boundary: the private handler must authorize by
  // resolved server-side user id before any receipt/case/index read.
  const source = fs.readFileSync("TarsReportApp.js", "utf8");
  const privateStart = source.indexOf("async handlePrivateReceiptControlCommand");
  const privateEnd = source.indexOf("async handleApproveReceiptCommand", privateStart);
  assert(privateStart >= 0 && privateEnd > privateStart, "private control command handler missing");
  const privateHandler = source.slice(privateStart, privateEnd);
  const authorization = privateHandler.indexOf("privateReceiptControlActorAllowed");
  const indexRead = privateHandler.indexOf("G.readIndex");
  assert(authorization >= 0 && indexRead > authorization, "authorization must precede private receipt index access");
  assert.match(privateHandler, /getNotifier\(\)[\s\S]*notifyUser/);
  assert.match(privateHandler, /PRIVATE_RECEIPT_CONTROL_ACTION/);
  assert.match(privateHandler, /entry\.source === "confirmed"[\s\S]*manualApprovalOperationToken[\s\S]*manualApprovalCompletedAt/);
  assert.doesNotMatch(privateHandler, /publishRejectedReceiptReview|uploadBuffer|receiptIdentity|\.exact/);
  const buttonStart = source.indexOf("async handlePrivateReceiptControlButton");
  const buttonEnd = source.indexOf("async handleApproveReceiptCommand", buttonStart);
  const privateButton = source.slice(buttonStart, buttonEnd);
  assert(privateButton.indexOf("privateReceiptControlActorAllowed") >= 0);
  assert(privateButton.indexOf("approveReceiptThroughSharedService") > privateButton.indexOf("privateReceiptControlActorAllowed"), "button authorization must precede approval lookup");

  const sharedServiceBlock = source.slice(source.indexOf("async function runReceiptManualApprovalV1"), source.indexOf("async function writeIndex", source.indexOf("async function runReceiptManualApprovalV1")));
  assert.match(sharedServiceBlock, /findReceiptIdentityDuplicate/);
  assert.match(sharedServiceBlock, /receiptManualApprovalQueue/);
  assert.doesNotMatch(sharedServiceBlock, /requestOpenAi|requestYandex|requestReceiptOcr|publishRejectedReceiptReview/);
  assert.match(source, /approveReceiptThroughSharedService[\s\S]*G\.runReceiptManualApprovalV1/);
  assert.match(source.slice(source.indexOf("async handleApproveReceiptCommand"), source.indexOf("async handleApproveReceiptButton")), /approveReceiptThroughSharedService/);
  assert.match(source.slice(source.indexOf("async handleApproveReceiptButton"), source.indexOf("photoReportIntentAssociation")), /approveReceiptThroughSharedService/);
  assert.strictEqual((source.match(/a\.actionId === PRIVATE_RECEIPT_CONTROL_ACTION/g) || []).length, 2, "action and block handlers must dispatch the private action");

  console.log("PASS: private receipt control is authorized, duplicate-safe, recoverable and idempotent");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
