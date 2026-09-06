"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function keyOf(association) {
  return String(association && association.key || "");
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createRuntime(loaded) {
  const guard = loaded.__testGuard;
  const app = Object.create(loaded.TarsReportApp.prototype);
  const room = { id: "master-room", type: "d", slugifiedName: "tars-master" };
  const master = { id: "master-id", username: "master" };
  const tars = { id: "tars-id", username: "tars" };
  const teimur = { id: "teimur-id", username: "teimur" };
  const shura = { id: "shura-id", username: "shura" };
  const records = new Map();
  const messages = new Map();
  const notifications = [];
  const blocks = [];
  const counters = { persistenceReads: 0, indexWrites: 0, memory: 0, summary: 0, report: 0, publicMessages: 0, statusUpdates: 0 };
  const entry = {
    exact: "a".repeat(64), source: "rejected", receiptIdentity: "id:operation-one",
    receiptAmount: 600, receiptDate: "2026-09-06", invalidReason: "provider disagreement",
    roomId: room.id, userId: master.id, username: master.username,
    messageId: "receipt-message", uploadId: "receipt-upload", uploadedAt: Date.now()
  };
  records.set("receipt-duplicate-index-v1", { version: 1, photos: [clone(entry)] });
  const read = {
    getUserReader() {
      return {
        async getByUsername(username) { return { tars, teimur, shura }[username]; },
        async getAppUser() { return tars; }
      };
    },
    getRoomReader() {
      return { async getById(id) { return id === room.id ? room : undefined; } };
    },
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          counters.persistenceReads += 1;
          const value = records.get(keyOf(association));
          return value === undefined ? [] : [clone(value)];
        }
      };
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      const key = keyOf(association);
      if (key === "receipt-duplicate-index-v1") counters.indexWrites += 1;
      records.set(key, clone(value));
    },
    async createWithAssociation(value, association) { records.set(keyOf(association), clone(value)); },
    async removeByAssociation(association) { records.delete(keyOf(association)); }
  };
  const creator = {
    getBlockBuilder() {
      return {
        newPlainTextObject(text) { return { text }; },
        newButtonElement(value) { return value; },
        addActionsBlock(value) { blocks.push(value); return this; }
      };
    },
    startMessage() {
      const state = {};
      return {
        setSender(value) { state.sender = value; return this; },
        setRoom(value) { state.room = value; return this; },
        setText(value) { state.text = value; return this; },
        __state: state
      };
    },
    async finish(builder) {
      counters.publicMessages += 1;
      const id = `status-${messages.size + 1}`;
      messages.set(id, { id, ...(builder.__state || {}) });
      return id;
    }
  };
  const updater = {
    async message(id) {
      const state = clone(messages.get(String(id)));
      return {
        getMessage() { return state; },
        setText(value) { if (state) state.text = value; return this; },
        __state: state
      };
    },
    async finish(builder) {
      counters.statusUpdates += 1;
      messages.set(String(builder.__state.id), clone(builder.__state));
    }
  };
  const notifier = {
    getMessageBuilder() {
      const state = {};
      return {
        setSender(value) { state.sender = value; return this; },
        setRoom(value) { state.room = value; return this; },
        setText(value) { state.text = value; return this; },
        setBlocks(value) { state.blocks = value; return this; },
        getMessage() { return state; }
      };
    },
    async notifyUser(user, message) { notifications.push({ user, message }); }
  };
  const modify = {
    getNotifier() { return notifier; },
    getCreator() { return creator; },
    getUpdater() { return updater; },
    getDeleter() { return { async deleteMessage() {} }; }
  };
  app.getLogger = () => ({ info() {}, warn() {}, error() {} });
  app.receiptOcrConfig = async () => ({});
  app.formatRubles = (value) => `${Number(value)} ₽`;
  app.refreshPreliminaryReportAnalysis = async () => { counters.report += 1; };
  return { guard, app, room, master, teimur, read, persistence, modify, records, messages, notifications, counters, entry, blocks };
}

(async () => {
  const loaded = loadTrackedAppWithGuard();

  const privatePublish = createRuntime(loaded);
  const publishResult = await privatePublish.guard.publishRejectedReceiptReview(
    { id: "receipt-upload", type: "image/jpeg" }, Buffer.from("private receipt bytes"), {
      privateControl: true,
      sourceRoom: privatePublish.room,
      user: privatePublish.master,
      exact: privatePublish.entry.exact,
      receiptAmount: 600,
      receiptDate: "2026-09-06",
      reason: "нужна проверка"
    }, privatePublish.read, privatePublish.modify, { reviewRejectedReceipts: true }, privatePublish.app.getLogger()
  );
  assert.strictEqual(publishResult, "private");
  assert.strictEqual(privatePublish.notifications.length, 2, "Teimur and Shura must each receive one private action");
  assert.strictEqual(privatePublish.counters.publicMessages, 0, "private control must not publish or copy a room message");
  assert.strictEqual(privatePublish.blocks.length, 2);
  assert(privatePublish.blocks.every((block) => /^rce_[a-f0-9]{32}$/.test(block.elements[0].value)));
  assert(!JSON.stringify(privatePublish.notifications).includes(privatePublish.entry.exact), "raw exact hash must not reach the private action");

  const acceptedWarning = createRuntime(loaded);
  assert.strictEqual(await acceptedWarning.guard.publishRejectedReceiptReview(
    { id: "accepted-upload", type: "image/jpeg" }, Buffer.from("accepted warning bytes"), {
      sourceRoom: acceptedWarning.room, user: acceptedWarning.master, exact: acceptedWarning.entry.exact,
      receiptAmount: 600, receiptDate: "2026-09-06", reason: "accepted warning"
    }, acceptedWarning.read, acceptedWarning.modify, { reviewRejectedReceipts: true }, acceptedWarning.app.getLogger()
  ), "");
  assert.strictEqual(acceptedWarning.notifications.length, 0, "accepted warnings must not become manual CONTROL actions");

  const unauthorized = createRuntime(loaded);
  await unauthorized.app.handleApproveReceiptButton(unauthorized.read, unauthorized.modify, unauthorized.persistence, {
    user: unauthorized.master,
    room: unauthorized.room,
    value: unauthorized.guard.receiptPrivateControlEntryTokenV1(unauthorized.entry)
  });
  assert.strictEqual(unauthorized.counters.persistenceReads, 0, "authorization must precede receipt data access");
  assert.strictEqual(unauthorized.counters.indexWrites, 0);
  assert.match(unauthorized.notifications[0].message.text, /только Теймур и Шура/);

  const missingFields = createRuntime(loaded);
  missingFields.records.get("receipt-duplicate-index-v1").photos[0].receiptAmount = undefined;
  await missingFields.app.handleApproveReceiptButton(missingFields.read, missingFields.modify, missingFields.persistence, {
    user: missingFields.teimur,
    room: missingFields.room,
    value: missingFields.guard.receiptPrivateControlEntryTokenV1(missingFields.entry)
  });
  assert.strictEqual(missingFields.counters.indexWrites, 0, "missing amount/date must never be guessed or accepted");
  assert.strictEqual(missingFields.records.get("receipt-duplicate-index-v1").photos[0].source, "rejected");

  const runtime = createRuntime(loaded);
  runtime.guard.resetReceiptCaseV1ForTests();
  const created = await runtime.guard.findOrCreateReceiptCaseV1({
    sourceMessageId: runtime.entry.messageId,
    sourceUploadId: runtime.entry.uploadId,
    masterId: runtime.entry.userId
  }, runtime.read, runtime.persistence);
  await runtime.guard.transitionReceiptCaseV1(created.caseId, { state: "PROCESSING" }, runtime.read, runtime.persistence);
  const control = await runtime.guard.transitionReceiptCaseV1(created.caseId, {
    state: "CONTROL", strictDecision: "control", controlReason: "unresolved",
    normalizedAmount: 600, normalizedDate: "2026-09-06"
  }, runtime.read, runtime.persistence);
  const statusManager = runtime.guard.createReceiptProcessingStatusManager({
    id: runtime.entry.messageId, room: runtime.room, sender: runtime.master
  }, runtime.read, runtime.persistence, runtime.modify, runtime.app.getLogger(), true);
  await statusManager.syncCase(control);
  const statusMessageId = Array.from(runtime.messages.keys())[0];

  const originalMemory = runtime.guard.scheduleTarsMemoryHumanReceiptConfirmationV1;
  const originalSummary = runtime.guard.publishMasterTransferSummary;
  runtime.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = () => { runtime.counters.memory += 1; return true; };
  runtime.guard.publishMasterTransferSummary = async () => { runtime.counters.summary += 1; return true; };
  try {
    const action = {
      user: runtime.teimur,
      room: runtime.room,
      value: runtime.guard.receiptPrivateControlEntryTokenV1(runtime.entry)
    };
    await runtime.app.handleApproveReceiptButton(runtime.read, runtime.modify, runtime.persistence, action);
    const index = runtime.records.get("receipt-duplicate-index-v1");
    assert.strictEqual(index.photos[0].source, "confirmed");
    assert.strictEqual(runtime.counters.indexWrites, 1, "manual financial path must remain the existing single index write");
    assert.deepStrictEqual({ memory: runtime.counters.memory, summary: runtime.counters.summary, report: runtime.counters.report }, { memory: 1, summary: 1, report: 1 });
    assert.strictEqual(runtime.messages.size, 1, "approval must not create another room message");
    assert.strictEqual(runtime.messages.get(statusMessageId).text, "✅ Чек 600 ₽ принят", "the same ReceiptCase status must be updated");
    assert.strictEqual(runtime.counters.statusUpdates, 1);
    assert.match(runtime.notifications[runtime.notifications.length - 1].message.text, /ЧЕК ЗАЧТЁН/);

    await runtime.app.handleApproveReceiptButton(runtime.read, runtime.modify, runtime.persistence, action);
    assert.strictEqual(runtime.counters.indexWrites, 1, "repeated click must not credit the receipt twice");
    assert.deepStrictEqual({ memory: runtime.counters.memory, summary: runtime.counters.summary, report: runtime.counters.report }, { memory: 1, summary: 1, report: 1 });
  } finally {
    runtime.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = originalMemory;
    runtime.guard.publishMasterTransferSummary = originalSummary;
  }

  console.log("PASS: private receipt action is server-authorized and updates the same ReceiptCase status");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
