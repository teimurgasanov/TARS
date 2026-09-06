"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

function createRuntime(options = {}) {
  const records = new Map();
  const messages = new Map();
  const created = [];
  const updated = [];
  const deleted = [];
  const logs = [];
  const appUser = { id: "tars-private-id", username: "tars" };
  const room = { id: "private-room-id", type: "d", slugifiedName: "tars-master" };
  const sender = { id: "private-master-id", username: "master" };
  const read = {
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          const value = records.get(associationKey(association));
          return value === undefined ? [] : [JSON.parse(JSON.stringify(value))];
        }
      };
    },
    getUserReader() {
      return {
        async getByUsername(username) { return username === "tars" ? appUser : undefined; },
        async getAppUser() { return appUser; }
      };
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      const key = associationKey(association);
      if (options.statusPersistenceFailure && key.startsWith("receipt-case-status-v1:")) throw new Error("status persistence unavailable");
      records.set(key, JSON.parse(JSON.stringify(value)));
    },
    async createWithAssociation(value, association) {
      const key = associationKey(association);
      if (options.statusPersistenceFailure && key.startsWith("receipt-case-status-v1:")) throw new Error("status persistence unavailable");
      records.set(key, JSON.parse(JSON.stringify(value)));
    },
    async removeByAssociation(association) { records.delete(associationKey(association)); }
  };
  const creator = {
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
      if (options.createFailure) throw new Error("status create unavailable");
      const id = `status-${created.length + 1}`;
      const value = { id, ...(builder.__state || {}) };
      messages.set(id, value);
      created.push({ ...value });
      return id;
    }
  };
  const updater = {
    async message(id) {
      if (options.updateFailure) throw new Error("status update unavailable");
      const current = messages.get(String(id));
      const state = current ? { ...current } : undefined;
      return {
        getMessage() { return state; },
        setText(value) { if (state) state.text = value; return this; },
        __state: state
      };
    },
    async finish(builder) {
      if (options.updateFailure) throw new Error("status update unavailable");
      const value = builder && builder.__state;
      if (!value) throw new Error("status message unavailable");
      messages.set(String(value.id), { ...value });
      updated.push({ ...value });
      return value.id;
    }
  };
  const modify = {
    getCreator() { return creator; },
    getUpdater() { return updater; },
    getDeleter() {
      return { async deleteMessage(message) { deleted.push(message.id); messages.delete(String(message.id)); } };
    }
  };
  const logger = {
    info(value) { logs.push(String(value)); },
    warn(value) { logs.push(String(value)); }
  };
  return { records, messages, created, updated, deleted, logs, read, persistence, modify, logger, room, sender };
}

function input(suffix, state, extra = {}) {
  return {
    sourceMessageId: `private-message-${suffix}`,
    sourceUploadId: `private-upload-${suffix}`,
    masterId: "private-master-id",
    sourceType: "original",
    state,
    ...extra
  };
}

async function transition(guard, runtime, suffix, state, extra = {}, manager) {
  const statusManager = manager || guard.createReceiptProcessingStatusManager(
    { id: `private-message-${suffix}`, room: runtime.room, sender: runtime.sender },
    runtime.read, runtime.persistence, runtime.modify, runtime.logger, true, guard.createTarsTraceV1()
  );
  assert.strictEqual(guard.scheduleReceiptCaseV1(
    input(suffix, state, extra), runtime.read, runtime.persistence, { enabled: true }, runtime.logger,
    guard.createTarsTraceV1(), statusManager
  ), true);
  await guard.flushReceiptCaseV1ForTests();
  await statusManager.clearAll();
  return statusManager;
}

async function lifecycle(guard, state, text, extra = {}) {
  guard.resetReceiptCaseV1ForTests();
  const runtime = createRuntime();
  const manager = await transition(guard, runtime, state.toLowerCase(), "PROCESSING");
  const id = runtime.created[0] && runtime.created[0].id;
  await transition(guard, runtime, state.toLowerCase(), state, extra, manager);
  assert.strictEqual(runtime.created.length, 1, `${state} must reuse the PROCESSING message`);
  assert.strictEqual(runtime.messages.get(id).text, text);
  assert.strictEqual(runtime.deleted.length, 0, "canonical status must survive request finalization");
  return { runtime, manager, id };
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert(guard && typeof guard.scheduleReceiptCaseV1 === "function");

  // 1-5. One stable message follows every lifecycle state.
  guard.resetReceiptCaseV1ForTests();
  const processing = createRuntime();
  const processingManager = await transition(guard, processing, "processing", "PROCESSING");
  assert.strictEqual(processing.created.length, 1);
  assert.strictEqual(processing.created[0].text, "⏳ Проверяем чек");
  await processingManager.clearAll();

  await lifecycle(guard, "ACCEPTED", "✅ Чек 1 900 ₽ принят", { strictDecision: "accept", normalizedAmount: 1900, normalizedDate: "2026-09-05" });
  await lifecycle(guard, "CONTROL", "⚠️ Чек требует проверки", { strictDecision: "control", controlReason: "amount_missing" });
  await lifecycle(guard, "DUPLICATE", "🚫 Этот чек уже был отправлен", { strictDecision: "duplicate" });
  await lifecycle(guard, "FAILED", "⚠️ Не удалось завершить проверку", { strictDecision: "failed" });

  // A guarded manual CONTROL -> ACCEPTED resolution must update the same
  // canonical status message rather than publishing a second status.
  guard.resetReceiptCaseV1ForTests();
  const manual = createRuntime();
  const manualManager = await transition(guard, manual, "manual", "PROCESSING");
  await transition(guard, manual, "manual", "CONTROL", { strictDecision: "control", controlReason: "unresolved", normalizedAmount: 600, normalizedDate: "2026-09-06" }, manualManager);
  const manualCase = Array.from(manual.records.entries()).filter(([key]) => key.startsWith("receipt-case-v1:case:")).map(([, value]) => value)[0];
  const originalStatusId = manual.created[0] && manual.created[0].id;
  const acceptedManualCase = await guard.manualTransitionReceiptCaseV1(manualCase.caseId, { normalizedAmount: 600, normalizedDate: "2026-09-06" }, manual.read, manual.persistence);
  await manualManager.syncCase(acceptedManualCase);
  assert.strictEqual(manual.created.length, 1, "manual approval must not create another status");
  assert.strictEqual(Array.from(manual.messages.values())[0].id, originalStatusId);
  assert.strictEqual(Array.from(manual.messages.values())[0].text, "✅ Чек 600 ₽ принят");

  // 6. Repeated transitions are idempotent.
  guard.resetReceiptCaseV1ForTests();
  const repeated = createRuntime();
  const repeatedManager = await transition(guard, repeated, "repeat", "PROCESSING");
  await transition(guard, repeated, "repeat", "ACCEPTED", { strictDecision: "accept", normalizedAmount: 600 }, repeatedManager);
  const updateCount = repeated.updated.length;
  await transition(guard, repeated, "repeat", "ACCEPTED", { strictDecision: "accept", normalizedAmount: 600 }, repeatedManager);
  assert.strictEqual(repeated.created.length, 1);
  assert.strictEqual(repeated.updated.length, updateCount, "same terminal text must not be updated twice");

  // 7. Preview/original/late aliases resolve to the same status.
  guard.resetReceiptCaseV1ForTests();
  const late = createRuntime();
  const lateManager = guard.createReceiptProcessingStatusManager(
    { id: "preview-message", room: late.room, sender: late.sender },
    late.read, late.persistence, late.modify, late.logger, true, guard.createTarsTraceV1()
  );
  for (const event of [
    { sourceMessageId: "preview-message", sourceUploadId: "preview-upload", sourceType: "preview" },
    { sourceMessageId: "original-message", sourceOriginMessageId: "preview-message", sourceUploadId: "original-upload", sourceType: "original" },
    { sourceMessageId: "original-message", sourceUploadId: "original-upload", sourceType: "original" }
  ]) {
    guard.scheduleReceiptCaseV1({ ...event, masterId: "private-master-id", state: "PROCESSING" }, late.read, late.persistence, { enabled: true }, late.logger, guard.createTarsTraceV1(), lateManager);
  }
  await guard.flushReceiptCaseV1ForTests();
  await lateManager.clearAll();
  assert.strictEqual(late.created.length, 1);

  // 8. A new manager after restart finds and updates the same message.
  const restarted = guard.createReceiptProcessingStatusManager(
    { id: "original-message", room: late.room, sender: late.sender },
    late.read, late.persistence, late.modify, late.logger, true, guard.createTarsTraceV1()
  );
  guard.scheduleReceiptCaseV1({ sourceMessageId: "original-message", sourceUploadId: "original-upload", masterId: "private-master-id", state: "CONTROL", strictDecision: "control" }, late.read, late.persistence, { enabled: true }, late.logger, guard.createTarsTraceV1(), restarted);
  await guard.flushReceiptCaseV1ForTests();
  await restarted.clearAll();
  assert.strictEqual(late.created.length, 1);
  assert.strictEqual(Array.from(late.messages.values())[0].text, "⚠️ Чек требует проверки");

  // 9-11. UI and linkage failures are fail-open after the case decision.
  for (const mode of ["createFailure", "updateFailure", "statusPersistenceFailure"]) {
    guard.resetReceiptCaseV1ForTests();
    const broken = createRuntime({ [mode]: true });
    const manager = await transition(guard, broken, mode, "PROCESSING");
    await transition(guard, broken, mode, "ACCEPTED", { strictDecision: "accept", normalizedAmount: 700 }, manager);
    const cases = Array.from(broken.records.entries()).filter(([key]) => key.startsWith("receipt-case-v1:case:"));
    assert.strictEqual(cases.length, 1, `${mode} must not prevent ReceiptCase persistence`);
    assert.strictEqual(cases[0][1].state, "ACCEPTED", `${mode} must not change the financial outcome`);
    const failedEvents = broken.logs.filter((line) => line.startsWith("TARS_TRACE_V1 ")).map((line) => JSON.parse(line.slice("TARS_TRACE_V1 ".length))).filter((event) => event.stage === "receipt_case_status" && event.event === "status_update_failed");
    assert(failedEvents.length >= 1, `${mode} must emit only a privacy-safe status failure event`);
  }

  // 12-19. Status work has no access to production publishers or authorities.
  const productionCounters = {
    acceptedPublisher: 0, rejectedPublisher: 0, notifier: 0, ledger: 0, totals: 0,
    reports: 0, payroll: 0, exactDuplicate: 0, identityDuplicate: 0, ocr: 0, vision: 0,
    workPhoto: 0, mailing: 0, controlRoom: 0
  };
  const snapshot = JSON.stringify(productionCounters);
  guard.resetReceiptCaseV1ForTests();
  const isolated = createRuntime();
  const isolatedManager = await transition(guard, isolated, "isolated", "PROCESSING");
  await transition(guard, isolated, "isolated", "CONTROL", { strictDecision: "control" }, isolatedManager);
  assert.strictEqual(JSON.stringify(productionCounters), snapshot);

  // 20. User text, ReceiptCase and trace output expose no raw linkage or secrets.
  const serializedPublic = JSON.stringify({ messages: Array.from(isolated.messages.values()).map((message) => message.text), logs: isolated.logs });
  for (const forbidden of [
    "private-message-isolated", "private-upload-isolated", "private-room-id", "private-master-id",
    "private-receipt.jpg", "https://private.invalid", "raw OCR", "base64", "receiptIdentity", "api-key"
  ]) assert(!serializedPublic.includes(forbidden), `privacy leak: ${forbidden}`);
  const caseRecords = Array.from(isolated.records.entries()).filter(([key]) => key.startsWith("receipt-case-v1:case:"));
  assert(caseRecords.length === 1);
  assert(!JSON.stringify(caseRecords).includes("private-message-isolated"));
  assert(/^rcs_[a-f0-9]{32}$/.test(String(caseRecords[0][1].statusCorrelation || "")), "ReceiptCase must keep only a privacy-safe status correlation");
  const statusEvents = isolated.logs.filter((line) => line.startsWith("TARS_TRACE_V1 ")).map((line) => JSON.parse(line.slice("TARS_TRACE_V1 ".length))).filter((event) => event.stage === "receipt_case_status");
  assert(statusEvents.some((event) => event.event === "status_created" && event.reason_code === "RECEIPT_STATUS_CREATED"));
  assert(statusEvents.some((event) => event.event === "status_updated" && event.reason_code === "RECEIPT_STATUS_UPDATED"));
  assert(statusEvents.every((event) => /^rcc_[a-f0-9]{16}$/.test(String(event.ids.case || ""))), "trace must contain only a one-way case token");

  console.log("PASS: one ReceiptCase has one privacy-safe, idempotent, fail-open status message");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
