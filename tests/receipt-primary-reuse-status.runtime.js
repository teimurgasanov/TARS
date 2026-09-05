"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

function openAiPass(options) {
  const format = options && options.data && options.data.text && options.data.text.format;
  if (format && format.name === "receipt_vision_engine_v1") return "vision-engine";
  const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ")) return "date-focus";
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА СУММЫ")) return "amount-focus";
  return "primary";
}

function receiptPayload(date) {
  return {
    is_receipt: true,
    has_readable_text: true,
    visual_type: "bank_receipt",
    is_mailing_proof: false,
    is_screenshot_of_chat: false,
    date,
    amount: 1200,
    amount_text: "1200 RUB",
    amount_label: "amount",
    status: "success",
    bank: "test-bank",
    kind: "receipt",
    confidence: "high",
    is_banking: true,
    is_document: true,
    has_visible_client: false,
    has_visible_service_result: false,
    has_payment_ui: false,
    has_receipt_text: true
  };
}

function focusedPayload(date) {
  return {
    date,
    time: null,
    amount: 1200,
    amount_text: "1200 RUB",
    amount_label: "amount",
    currency: "RUB",
    confidence: 0.98,
    ambiguity_reason: null
  };
}

function provider(config, calls) {
  const requiredDate = config.requiredDate;
  return {
    async post(url, options) {
      assert(String(url).includes("api.openai.com"), `unexpected provider URL: ${url}`);
      const pass = openAiPass(options);
      calls.push(pass);
      if (pass === "vision-engine") {
        return { statusCode: 200, data: { output_text: JSON.stringify({
          is_receipt: true,
          bank_or_provider: null,
          operation_date: null,
          operation_time: null,
          amount: null,
          currency: "unknown",
          status: "unknown",
          amount_label: null,
          confidence: 0,
          ambiguity_reason: "legacy regression scenario"
        }) } };
      }
      return { statusCode: 200, data: { output_text: JSON.stringify(pass === "date-focus" || pass === "amount-focus" ? focusedPayload(requiredDate) : receiptPayload(requiredDate)) } };
    }
  };
}

async function verifyPrimaryReuse(guard) {
  const config = {
    openaiApiKey: "test-openai-key",
    openaiReceiptModel: "gpt-4.1-mini",
    timeZone: "Europe/Astrakhan",
    cutoffHour: 0
  };
  config.requiredDate = guard.expectedReceiptDate(config);
  const logger = { info() {}, warn() {}, error() {} };

  const reusedCalls = [];
  const reusedFile = { _id: "reuse-upload", id: "reuse-upload", name: "receipt.jpg", type: "image/jpeg" };
  const reusedContent = Buffer.from("receipt-primary-reuse");
  const kind = await guard.personalImageKindForPreUpload(reusedFile, reusedContent, provider(config, reusedCalls), config, logger);
  assert.strictEqual(kind, "receipt");
  const reusedContext = guard.receiptStageContext(reusedFile, reusedContent, config);
  const reusedResult = await guard.validateReceiptDate(reusedFile, reusedContent, provider(config, reusedCalls), config, logger, 0, reusedContext);
  assert.strictEqual(reusedResult.ok, true);
  assert.deepStrictEqual(reusedCalls, ["primary", "vision-engine", "amount-focus"], "classification primary must be reused and amount-focus must remain mandatory when semantic Vision is inconclusive");

  const fallbackCalls = [];
  const fallbackFile = { _id: "fallback-upload", id: "fallback-upload", name: "receipt.jpg", type: "image/jpeg" };
  const fallbackResult = await guard.validateReceiptDate(
    fallbackFile,
    Buffer.from("receipt-primary-fallback"),
    provider(config, fallbackCalls),
    config,
    logger
  );
  assert.strictEqual(fallbackResult.ok, true);
  assert.deepStrictEqual(fallbackCalls, ["vision-engine", "primary", "amount-focus"], "missing reusable evidence must retain the old provider path");

  const mismatchCalls = [];
  const sourceFile = { _id: "source-upload", id: "source-upload", name: "receipt.jpg", type: "image/jpeg" };
  const targetFile = { _id: "target-upload", id: "target-upload", name: "receipt.jpg", type: "image/jpeg" };
  const mismatchContent = Buffer.from("receipt-primary-mismatch");
  await guard.personalImageKindForPreUpload(sourceFile, mismatchContent, provider(config, mismatchCalls), config, logger);
  const sourceContext = guard.receiptStageContext(sourceFile, mismatchContent, config);
  const mismatchResult = await guard.validateReceiptDate(targetFile, mismatchContent, provider(config, mismatchCalls), config, logger, 0, sourceContext);
  assert.strictEqual(mismatchResult.ok, true);
  assert.deepStrictEqual(mismatchCalls, ["primary", "vision-engine", "primary", "amount-focus"], "evidence from another upload must never be reused");
}

async function verifyStatusIdempotency(guard) {
  const records = new Map();
  const messages = new Map();
  const published = [];
  const deleted = [];
  const appUser = { id: "tars-id", username: "tars" };
  const room = { id: "personal-room", type: "d", slugifiedName: "tars-master" };
  const read = {
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          return records.get(associationKey(association)) || [];
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
      records.set(associationKey(association), [value]);
      return value;
    },
    async createWithAssociation(value, association) {
      const key = associationKey(association);
      records.set(key, (records.get(key) || []).concat([value]));
      return value;
    },
    async removeByAssociation(association) {
      records.delete(associationKey(association));
    }
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
      const id = `status-${published.length + 1}`;
      const message = { id, ...(builder.__state || {}) };
      published.push(message);
      messages.set(id, message);
      return id;
    }
  };
  const modify = {
    getCreator() { return creator; },
    getUpdater() {
      return {
        async message(id) {
          const state = messages.get(String(id));
          return {
            getMessage() { return state; },
            setText(value) { if (state) state.text = value; return this; },
            __state: state
          };
        },
        async finish(builder) { return builder && builder.__state && builder.__state.id; }
      };
    },
    getDeleter() {
      return {
        async deleteMessage(message) {
          deleted.push(message.id);
          messages.delete(message.id);
        }
      };
    }
  };
  const file = { _id: "status-upload", id: "status-upload", name: "receipt.jpg", type: "image/jpeg" };
  const content = Buffer.from("receipt-processing-status");
  const context = guard.receiptStageContext(file, content, {});
  const message = { id: "source-message", room, sender: { id: "master-id", username: "master" } };
  const first = guard.createReceiptProcessingStatusManager(message, read, persistence, modify, { info() {}, warn() {} }, true);
  const second = guard.createReceiptProcessingStatusManager(message, read, persistence, modify, { info() {}, warn() {} }, true);

  const [firstHandle, secondHandle] = await Promise.all([first.ensure(file, content, context), second.ensure(file, content, context)]);
  assert.ok(firstHandle && secondHandle);
  const receiptInput = { sourceMessageId: message.id, sourceUploadId: file.id, masterId: message.sender.id, sourceType: "original" };
  guard.resetReceiptCaseV1ForTests();
  guard.scheduleReceiptCaseV1({ ...receiptInput, state: "PROCESSING" }, read, persistence, { enabled: true }, undefined, undefined, first);
  guard.scheduleReceiptCaseV1({ ...receiptInput, state: "PROCESSING" }, read, persistence, { enabled: true }, undefined, undefined, second);
  await guard.flushReceiptCaseV1ForTests();
  await Promise.all([first.clearAll(), second.clearAll()]);
  assert.strictEqual(published.length, 1, "preview/original race must create one processing status");
  assert.strictEqual(published[0].text, "⏳ Проверяем чек");
  assert.deepStrictEqual(deleted, [], "canonical status must survive finalization");

  guard.scheduleReceiptCaseV1({ ...receiptInput, state: "ACCEPTED", strictDecision: "accept", normalizedAmount: 1200 }, read, persistence, { enabled: true }, undefined, undefined, second);
  await guard.flushReceiptCaseV1ForTests();
  await second.clearAll();
  assert.strictEqual(published.length, 1, "terminal transition must update the canonical status");
  assert.strictEqual(messages.get(published[0].id).text.replace(/[\u00a0\u202f]/g, " "), "✅ Чек 1 200 ₽ принят");

  const disabled = guard.createReceiptProcessingStatusManager(message, read, persistence, modify, { info() {}, warn() {} }, false);
  assert.strictEqual(await disabled.ensure(file, content, context), undefined);
  assert.strictEqual(published.length, 1, "disabled status manager must not publish a status");

  const failingFile = { _id: "status-failure-upload", id: "status-failure-upload", name: "receipt.jpg", type: "image/jpeg" };
  const failingInput = { sourceMessageId: "failing-source-message", sourceUploadId: failingFile.id, masterId: message.sender.id, sourceType: "original" };
  guard.resetReceiptCaseV1ForTests();
  const failingPersistence = {
    async updateByAssociation(association, value) {
      if (associationKey(association).startsWith("receipt-case-status-v1:")) throw new Error("mock persistence failure");
      records.set(associationKey(association), [value]);
    },
    async removeByAssociation() {}
  };
  const isolatedFailingManager = guard.createReceiptProcessingStatusManager(message, read, failingPersistence, modify, { info() {}, warn() {} }, true);
  guard.scheduleReceiptCaseV1({ ...failingInput, state: "PROCESSING" }, read, failingPersistence, { enabled: true }, undefined, undefined, isolatedFailingManager);
  await guard.flushReceiptCaseV1ForTests();
  await isolatedFailingManager.clearAll();
  assert.strictEqual(deleted.length, 1, "a status whose persistence write failed must be removed best-effort");
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert.ok(guard && typeof guard.validateReceiptDate === "function");
  assert.strictEqual(typeof guard.personalImageKindForPreUpload, "function");
  assert.strictEqual(typeof guard.createReceiptProcessingStatusManager, "function");

  await verifyPrimaryReuse(guard);
  await verifyStatusIdempotency(guard);

  const source = require("fs").readFileSync(require("path").resolve(__dirname, "..", "TarsReportApp.js"), "utf8");
  const runtimeBlock = source.slice(source.indexOf("async function processPersonalMediaV2"), source.indexOf("function isTodayTransferSumRequest"));
  for (const forbiddenCall of ["evaluateRules(", "resolveConflicts(", "makeDecision(", "runOfflineComparison(", "runOfflineDataset("]) {
    assert(!runtimeBlock.includes(forbiddenCall), `legacy runtime must not call Scanner 2.0 decision logic: ${forbiddenCall}`);
  }

  console.log("PASS: primary OpenAI evidence is upload-bound, reused once, and processing status is idempotent");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
