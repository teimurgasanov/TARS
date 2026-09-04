"use strict";

const assert = require("assert");
const {
  loadTrackedAppWithGuard,
  readReceiptOcrConfigFromCanonicalBundle
} = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

(async () => {
  const config = await readReceiptOcrConfigFromCanonicalBundle({
    scanner2_shadow_mode: "RECORD_ONLY",
    scanner2_shadow_sample_percent: 100,
    scanner2_shadow_retention_days: 30,
    scanner2_shadow_max_records: 5000,
    receipt_timezone: "Europe/Astrakhan"
  });
  const runtime = loadTrackedAppWithGuard();
  const guard = runtime.__testGuard;
  assert.ok(guard && typeof guard.writeIndex === "function");
  assert.strictEqual(typeof guard.publishMasterTransferSummary, "function");

  const records = new Map();
  const publishedMessages = [];
  const persistenceReader = {
    async readByAssociation(association) {
      return records.get(associationKey(association)) || [];
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      records.set(associationKey(association), [value]);
    },
    async removeByAssociation(association) {
      records.delete(associationKey(association));
    },
    async createWithAssociation(value, association) {
      const key = associationKey(association);
      const existing = records.get(key) || [];
      records.set(key, existing.concat([value]));
      return value;
    }
  };
  const owner = { id: "jon-doe-id", username: "jon-doe", name: "Jon Doe" };
  const appUser = { id: "tars-id", username: "tars", name: "TARS" };
  const room = { id: "room-jon-doe", type: "d", slugifiedName: "tars-jon-doe" };
  const read = {
    getPersistenceReader() {
      return persistenceReader;
    },
    getUserReader() {
      return {
        async getByUsername(username) {
          if (username === "jon-doe") return owner;
          if (username === "tars") return appUser;
          return undefined;
        },
        async getAppUser() {
          return appUser;
        }
      };
    },
    getRoomReader() {
      return {
        async getMembers() {
          return [owner, appUser];
        },
        async getByName() {
          return undefined;
        }
      };
    }
  };
  const modify = {
    getCreator() {
      return {
        startMessage() {
          const state = {};
          return {
            setSender(sender) { state.sender = sender; return this; },
            setRoom(targetRoom) { state.room = targetRoom; return this; },
            setText(text) { state.text = text; return this; },
            __state: state
          };
        },
        async finish(builder) {
          publishedMessages.push(builder.__state);
          return `summary-${publishedMessages.length}`;
        }
      };
    },
    getUpdater() {
      return {
        async message() {
          return { getMessage() { return undefined; } };
        }
      };
    },
    getDeleter() {
      return { async deleteMessage() {} };
    }
  };
  const receipt = {
    source: "confirmed",
    exact: "receipt-1200-exact",
    receiptIdentity: "id:receipt-1200-test",
    receiptDate: "2026-09-01",
    receiptAmount: 1200,
    userId: owner.id,
    username: owner.username,
    roomId: room.id,
    messageId: "receipt-message-1200",
    uploadId: "receipt-upload-1200",
    uploadedAt: Date.now()
  };

  await guard.writeIndex(persistence, guard.PROTECTED_ROOMS.kassa.index, {
    version: 1,
    photos: [receipt]
  });
  const acceptedIndex = await guard.readIndex(read, guard.PROTECTED_ROOMS.kassa.index);
  assert.strictEqual(acceptedIndex.photos.length, 1, "accepted receipt index must contain the receipt");
  assert.strictEqual(acceptedIndex.photos[0].receiptAmount, 1200, "accepted index must preserve 1200 RUB");

  const published = await guard.publishMasterTransferSummary(
    receipt,
    { id: receipt.messageId, room, sender: owner },
    read,
    persistence,
    modify,
    config,
    { warn() {}, info() {} },
    true,
    [receipt]
  );
  assert.strictEqual(published, true, "running total publisher must complete");
  assert.strictEqual(publishedMessages.length, 1, "one running total message must be created");
  const text = publishedMessages[0].text.replace(/[\u00a0\u202f]/g, " ");
  assert.match(text, /Чеков: 1/);
  assert.match(text, /Общая сумма чеков: 1 200 ₽/);

  const originalConfirmedTransferSummaryForUser = guard.confirmedTransferSummaryForUser;
  const reportOwner = { id: "aleksei-id", username: "aleksei", name: "Aleksei" };
  const adminUploader = { id: "teimur-id", username: "teimur", name: "Teimur" };
  const reportRoom = { id: "room-aleksei", type: "p", slugifiedName: "tars-aleksei" };
  const storedFormData = {
    rows: [{ name: "Стрижка", price: 2000, quantity: 1, expense: 0 }],
    cash: 800,
    transfers: 1200,
    mailings: 0
  };
  const storedReport = {
    userId: reportOwner.id,
    reportType: "male",
    workday: "2026-09-04",
    roomId: reportRoom.id,
    sourceRoomId: reportRoom.id,
    messageId: "old-report-message",
    ownerSummaryMessageId: "old-owner-summary",
    preliminaryMessageId: "old-preliminary",
    firstSubmittedAt: 1,
    formData: storedFormData,
    updatedAt: 2
  };
  const reconciledRecords = [];
  const fullReportCalls = [];
  const ownerSummaryCalls = [];
  const deletedPreliminary = [];
  const app = Object.create(runtime.TarsReportApp.prototype);
  app.isPersonalReportRoom = () => true;
  app.masterUserForPersonalReportRoom = async () => reportOwner;
  app.reportAssociation = (userId, reportType, workday) => ({ key: `report:${userId}:${reportType}:${workday}` });
  app.parseSubmittedReport = () => ({
    rows: [{ label: "Стрижка", quantity: 1, unitPrice: 2000, amount: 2000, expense: 0, netAmount: 2000, kind: "service" }],
    cash: storedFormData.cash,
    transfers: storedFormData.transfers,
    mailings: storedFormData.mailings
  });
  app.receiptOcrConfig = async () => config;
  app.mailingProofStatus = async () => ({ count: 10, roomFound: true });
  app.reportPhotoStatus = async () => ({ count: 1 });
  app.payrollRule = () => ({ limit: { met: true }, proofOk: true });
  app.reportFinalDueAt = () => 1;
  app.reportTimeCorrection = () => ({ applied: false, amount: 0, label: "on time" });
  app.latenessSummary = async () => ({ total: 0, count: 0, entries: [] });
  app.sendReport = async (...args) => {
    fullReportCalls.push(args);
    return "new-report-message";
  };
  app.sendOwnerShortReport = async (...args) => {
    ownerSummaryCalls.push(args);
    return "new-owner-summary";
  };
  app.sendPreliminaryReportAnalysis = async () => {
    throw new Error("expired preliminary analysis must not be recreated");
  };
  app.deletePreliminaryReportAnalysis = async (_modify, _read, messageId) => {
    deletedPreliminary.push(messageId);
  };
  const reportRead = {
    getPersistenceReader() {
      return { async readByAssociation() { return [storedReport]; } };
    }
  };
  const reportPersistence = {
    async removeByAssociation() {},
    async createWithAssociation(value) { reconciledRecords.push(value); }
  };
  try {
    guard.confirmedTransferSummaryForUser = async (_read, _config, userId, workday, _from, currentValidatedReceipts, roomId) => {
      assert.strictEqual(userId, reportOwner.id, "receipt reconciliation must use the personal-room owner");
      assert.strictEqual(workday, "2026-09-04");
      assert.strictEqual(roomId, reportRoom.id);
      assert.strictEqual(currentValidatedReceipts.length, 1, "the just-accepted receipt must bridge persistence-reader lag");
      assert.strictEqual(currentValidatedReceipts[0].receiptAmount, 800);
      return { total: 2000, count: 2, missing: 0, pendingReview: 0 };
    };
    const refreshed = await app.refreshPreliminaryReportAnalysis(
      reportRead,
      reportPersistence,
      {},
      adminUploader,
      reportRoom,
      {
        refreshFinancialReport: true,
        workday: "2026-09-04",
        currentValidatedReceipts: [{ receiptAmount: 800 }]
      }
    );
    assert.strictEqual(refreshed, true);
  } finally {
    guard.confirmedTransferSummaryForUser = originalConfirmedTransferSummaryForUser;
  }
  assert.strictEqual(fullReportCalls.length, 1, "an accepted late receipt must replace the stored full report");
  assert.strictEqual(fullReportCalls[0][2], reportOwner, "the report sender/owner must be the room owner, not the admin uploader");
  assert.strictEqual(fullReportCalls[0][4], storedFormData.cash, "manual cash must remain unchanged");
  assert.strictEqual(fullReportCalls[0][5], storedFormData.transfers, "manual transfer field must remain unchanged");
  assert.strictEqual(fullReportCalls[0][8].total, 2000, "verified receipt total must be passed as the derived authority");
  assert.strictEqual(ownerSummaryCalls.length, 1, "the owner shortage summary must be refreshed too");
  assert.deepStrictEqual(deletedPreliminary, ["old-preliminary"], "expired preliminary status must only be removed");
  assert.strictEqual(reconciledRecords.length, 1);
  assert.deepStrictEqual(reconciledRecords[0].formData, storedFormData, "reconciliation must preserve the originally submitted form data");
  assert.strictEqual(reconciledRecords[0].messageId, "new-report-message");
  assert.strictEqual(reconciledRecords[0].ownerSummaryMessageId, "new-owner-summary");
  assert.strictEqual(reconciledRecords[0].preliminaryMessageId, "");

  console.log("PASS: receipt totals update and late accepted receipts reconcile stored reports for the room owner");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
