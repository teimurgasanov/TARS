"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function keyOf(association) {
  return String(association && association.key || "");
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createRuntime(loaded, sharedRecords, sharedMessages, sharedFaults) {
  const guard = loaded.__testGuard;
  const app = Object.create(loaded.TarsReportApp.prototype);
  const room = { id: "master-room", type: "d", slugifiedName: "tars-master" };
  const master = { id: "master-id", username: "master" };
  const tars = { id: "tars-id", username: "tars" };
  const teimur = { id: "teimur-id", username: "teimur" };
  const shura = { id: "shura-id", username: "shura" };
  const records = sharedRecords || new Map();
  const messages = sharedMessages || new Map();
  const faults = sharedFaults || { caseWrites: 0, statusUpdates: 0 };
  const notifications = [];
  const blocks = [];
  const counters = { persistenceReads: 0, indexWrites: 0, memory: 0, summary: 0, report: 0, publicMessages: 0, statusUpdates: 0 };
  const entry = {
    exact: "a".repeat(64), source: "rejected", receiptIdentity: "id:operation-one",
    receiptAmount: 600, receiptDate: "2026-09-06", invalidReason: "provider disagreement",
    roomId: room.id, userId: master.id, username: master.username,
    messageId: "receipt-message", uploadId: "receipt-upload", uploadedAt: Date.now()
  };
  if (!records.has("receipt-duplicate-index-v1")) records.set("receipt-duplicate-index-v1", { version: 1, photos: [clone(entry)] });
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
      if (key.startsWith("receipt-case-v1:case:") && faults.caseWrites > 0) {
        faults.caseWrites -= 1;
        throw new Error("injected receipt case persistence failure");
      }
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
      if (faults.statusUpdates > 0) {
        faults.statusUpdates -= 1;
        throw new Error("injected receipt status update failure");
      }
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
  return { guard, app, room, master, teimur, read, persistence, modify, records, messages, notifications, counters, entry, blocks, faults };
}

async function prepareControl(runtime) {
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
  return { caseId: created.caseId, statusMessageId: Array.from(runtime.messages.keys())[0] };
}

(async () => {
  const loaded = loadTrackedAppWithGuard();

  const unauthorizedList = createRuntime(loaded);
  assert.strictEqual(typeof unauthorizedList.app.handleReceiptControlCommand, "function", "/receipt-control handler must exist");
  await unauthorizedList.app.handleReceiptControlCommand(unauthorizedList.read, unauthorizedList.modify, unauthorizedList.room, unauthorizedList.master);
  assert.strictEqual(unauthorizedList.counters.persistenceReads, 0, "list authorization must precede receipt data access");
  assert.match(unauthorizedList.notifications[0].message.text, /только Теймур.*Шур/);

  const wrongRoomList = createRuntime(loaded);
  const unrelatedRoom = { id: "unrelated-room", type: "c", slugifiedName: "unrelated" };
  await wrongRoomList.app.handleReceiptControlCommand(wrongRoomList.read, wrongRoomList.modify, unrelatedRoom, wrongRoomList.teimur);
  assert.strictEqual(wrongRoomList.counters.persistenceReads, 0, "a command outside a master personal room must not read receipt data");
  assert.match(wrongRoomList.notifications[0].message.text, /личном чате мастера/);

  const commandList = createRuntime(loaded);
  const commandIndex = commandList.records.get("receipt-duplicate-index-v1");
  commandIndex.photos.push(
    { ...clone(commandList.entry), exact: "b".repeat(64), uploadId: "second-upload", messageId: "second-message", receiptAmount: 1000, uploadedAt: Date.now() + 1 },
    { ...clone(commandList.entry), exact: "c".repeat(64), uploadId: "other-upload", messageId: "other-message", receiptAmount: 900, roomId: "other-room" },
    { ...clone(commandList.entry), exact: "d".repeat(64), uploadId: "accepted-upload", messageId: "accepted-message", receiptAmount: 1200, source: "confirmed" }
  );
  await commandList.app.handleReceiptControlCommand(commandList.read, commandList.modify, commandList.room, commandList.teimur);
  assert.strictEqual(commandList.counters.persistenceReads, 1, "authorized list must read the receipt index once");
  assert.strictEqual(commandList.notifications.length, 2, "only unresolved receipts from the current master chat must be listed");
  assert.strictEqual(commandList.counters.publicMessages, 0, "the recovery command must not create shared room messages");
  assert.strictEqual(commandList.counters.indexWrites, 0, "listing controls must be read-only");
  assert(commandList.notifications.every((item) => item.user.id === commandList.teimur.id && item.message.room.id === commandList.room.id));
  assert(commandList.blocks.every((block) => /^rce_[a-f0-9]{32}$/.test(block.elements[0].value)), "regenerated buttons must use the existing private action token");
  const firstListText = JSON.stringify(commandList.notifications);
  assert(firstListText.includes("600") && firstListText.includes("1000"));
  assert(!firstListText.includes("900") && !firstListText.includes("1200"), "foreign-room and already accepted receipts must be excluded");
  assert(!firstListText.includes(commandList.entry.exact), "raw exact hash must not be exposed by the recovery command");

  await commandList.app.handleReceiptControlCommand(commandList.read, commandList.modify, commandList.room, commandList.teimur);
  assert.strictEqual(commandList.notifications.length, 4, "repeated command invocation must regenerate the same two private controls");
  assert.strictEqual(commandList.counters.indexWrites, 0, "repeated listing must remain read-only");

  const restartedList = createRuntime(loaded, commandList.records);
  await restartedList.app.handleReceiptControlCommand(restartedList.read, restartedList.modify, restartedList.room, restartedList.teimur);
  assert.strictEqual(restartedList.notifications.length, 2, "a new app instance must restore controls from persisted unresolved receipts");
  assert.strictEqual(restartedList.counters.publicMessages, 0);
  assert.strictEqual(restartedList.counters.indexWrites, 0);
  const restoredToken = restartedList.blocks[0].elements[0].value;
  const restoredEntry = restartedList.records.get("receipt-duplicate-index-v1").photos.find((candidate) => restartedList.guard.receiptPrivateControlEntryTokenV1(candidate) === restoredToken);
  const originalRestoredMemory = restartedList.guard.scheduleTarsMemoryHumanReceiptConfirmationV1;
  const originalRestoredSummary = restartedList.guard.publishMasterTransferSummary;
  restartedList.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = () => true;
  restartedList.guard.publishMasterTransferSummary = async () => true;
  try {
    await restartedList.app.handleApproveReceiptButton(restartedList.read, restartedList.modify, restartedList.persistence, {
      user: restartedList.teimur,
      room: restartedList.room,
      value: restoredToken
    });
  } finally {
    restartedList.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = originalRestoredMemory;
    restartedList.guard.publishMasterTransferSummary = originalRestoredSummary;
  }
  assert.strictEqual(restartedList.records.get("receipt-duplicate-index-v1").photos.find((candidate) => candidate.exact === restoredEntry.exact).source, "confirmed", "a regenerated button must use the existing approval handler after restart");

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
  const { statusMessageId } = await prepareControl(runtime);

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
    assert.strictEqual(runtime.counters.indexWrites, 2, "approval must persist acceptance, then clear only the status-repair marker after successful synchronization");
    assert.deepStrictEqual({ memory: runtime.counters.memory, summary: runtime.counters.summary, report: runtime.counters.report }, { memory: 1, summary: 1, report: 1 });
    assert.strictEqual(runtime.messages.size, 1, "approval must not create another room message");
    assert.strictEqual(runtime.messages.get(statusMessageId).text, "✅ Чек 600 ₽ принят", "the same ReceiptCase status must be updated");
    assert.strictEqual(runtime.counters.statusUpdates, 1);
    assert.match(runtime.notifications[runtime.notifications.length - 1].message.text, /ЧЕК ЗАЧТЁН/);

    await runtime.app.handleApproveReceiptButton(runtime.read, runtime.modify, runtime.persistence, action);
    assert.strictEqual(runtime.counters.indexWrites, 2, "repeated click must not credit the receipt twice");
    assert.deepStrictEqual({ memory: runtime.counters.memory, summary: runtime.counters.summary, report: runtime.counters.report }, { memory: 1, summary: 1, report: 1 });
  } finally {
    runtime.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = originalMemory;
    runtime.guard.publishMasterTransferSummary = originalSummary;
  }

  for (const failurePoint of ["caseWrites", "statusUpdates"]) {
    const failed = createRuntime(loaded);
    const prepared = await prepareControl(failed);
    const originalFailedMemory = failed.guard.scheduleTarsMemoryHumanReceiptConfirmationV1;
    const originalFailedSummary = failed.guard.publishMasterTransferSummary;
    failed.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = () => { failed.counters.memory += 1; return true; };
    failed.guard.publishMasterTransferSummary = async () => { failed.counters.summary += 1; return true; };
    failed.faults[failurePoint] = 1;
    try {
      await failed.app.handleApproveReceiptButton(failed.read, failed.modify, failed.persistence, {
        user: failed.teimur,
        room: failed.room,
        value: failed.guard.receiptPrivateControlEntryTokenV1(failed.entry)
      });
    } finally {
      failed.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = originalFailedMemory;
      failed.guard.publishMasterTransferSummary = originalFailedSummary;
    }
    const confirmed = failed.records.get("receipt-duplicate-index-v1").photos[0];
    assert.strictEqual(confirmed.source, "confirmed", `${failurePoint}: financial acceptance must remain committed`);
    assert.strictEqual(confirmed.receiptCaseStatusPending, true, `${failurePoint}: failed status synchronization must remain durably retryable`);
    assert.deepStrictEqual({ memory: failed.counters.memory, summary: failed.counters.summary, report: failed.counters.report }, { memory: 1, summary: 1, report: 1 });
    assert.strictEqual(failed.messages.get(prepared.statusMessageId).text, "⚠️ Чек требует проверки", `${failurePoint}: injected failure must leave the original status unchanged`);

    const restarted = createRuntime(loaded, failed.records, failed.messages);
    await restarted.app.handleReceiptControlCommand(restarted.read, restarted.modify, restarted.room, restarted.teimur);
    const repairBlock = restarted.blocks[0];
    assert(repairBlock, `${failurePoint}: restart recovery must expose a private status-repair action`);
    const repairToken = repairBlock.elements[0].value;
    assert.match(restarted.notifications[0].message.text, /СТАТУС.*СИНХРОНИЗАЦ/i);

    const originalRestartedMemory = restarted.guard.scheduleTarsMemoryHumanReceiptConfirmationV1;
    const originalRestartedSummary = restarted.guard.publishMasterTransferSummary;
    restarted.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = () => { restarted.counters.memory += 1; return true; };
    restarted.guard.publishMasterTransferSummary = async () => { restarted.counters.summary += 1; return true; };
    try {
      await restarted.app.handleApproveReceiptButton(restarted.read, restarted.modify, restarted.persistence, {
        user: restarted.teimur,
        room: restarted.room,
        value: repairToken
      });
    } finally {
      restarted.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = originalRestartedMemory;
      restarted.guard.publishMasterTransferSummary = originalRestartedSummary;
    }
    const repaired = restarted.records.get("receipt-duplicate-index-v1").photos[0];
    assert.strictEqual(repaired.source, "confirmed");
    assert.strictEqual(repaired.receiptCaseStatusPending, undefined, `${failurePoint}: successful repair must clear the durable marker`);
    assert.deepStrictEqual({ memory: restarted.counters.memory, summary: restarted.counters.summary, report: restarted.counters.report }, { memory: 0, summary: 0, report: 0 }, `${failurePoint}: status repair must not repeat financial/report effects`);
    assert.strictEqual(restarted.messages.size, 1, `${failurePoint}: repair must update the existing status message`);
    assert.strictEqual(restarted.messages.get(prepared.statusMessageId).text, "✅ Чек 600 ₽ принят");
  }

  console.log("PASS: private receipt action is server-authorized and updates the same ReceiptCase status");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
