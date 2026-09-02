"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

function openAiPass(options) {
  const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ")) return "date-focus";
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА:")) return "amount-focus";
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

function provider(config, calls) {
  const requiredDate = config.requiredDate;
  return {
    async post(url, options) {
      assert(String(url).includes("api.openai.com"), `unexpected provider URL: ${url}`);
      const pass = openAiPass(options);
      calls.push(pass);
      return { statusCode: 200, data: { output_text: JSON.stringify(receiptPayload(requiredDate)) } };
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
  assert.deepStrictEqual(reusedCalls, ["primary", "amount-focus"], "classification primary must be reused and amount-focus must remain mandatory");

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
  assert.deepStrictEqual(fallbackCalls, ["primary", "amount-focus"], "missing reusable evidence must retain the old provider path");

  const mismatchCalls = [];
  const sourceFile = { _id: "source-upload", id: "source-upload", name: "receipt.jpg", type: "image/jpeg" };
  const targetFile = { _id: "target-upload", id: "target-upload", name: "receipt.jpg", type: "image/jpeg" };
  const mismatchContent = Buffer.from("receipt-primary-mismatch");
  await guard.personalImageKindForPreUpload(sourceFile, mismatchContent, provider(config, mismatchCalls), config, logger);
  const sourceContext = guard.receiptStageContext(sourceFile, mismatchContent, config);
  const mismatchResult = await guard.validateReceiptDate(targetFile, mismatchContent, provider(config, mismatchCalls), config, logger, 0, sourceContext);
  assert.strictEqual(mismatchResult.ok, true);
  assert.deepStrictEqual(mismatchCalls, ["primary", "primary", "amount-focus"], "evidence from another upload must never be reused");
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
          return { getMessage() { return messages.get(String(id)); } };
        }
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

  const [firstHandle, secondHandle] = await Promise.all([
    first.ensure(file, content, context),
    second.ensure(file, content, guard.receiptStageContext(file, content, {}))
  ]);
  assert.ok(firstHandle && secondHandle);
  assert.strictEqual(published.length, 1, "preview/original race must create one processing status");
  assert.strictEqual(published[0].text, "⏳ Чек проверяется…");

  await second.clearAll();
  assert.strictEqual(deleted.length, 0, "a non-owner event must not remove the active owner's status");
  await first.clearAll();
  assert.deepStrictEqual(deleted, [published[0].id], "finalization must remove the one processing status");
  assert.strictEqual(records.size, 0, "processing status persistence must not survive successful finalization");

  const disabled = guard.createReceiptProcessingStatusManager(message, read, persistence, modify, { info() {}, warn() {} }, false);
  assert.strictEqual(await disabled.ensure(file, content, context), undefined);
  assert.strictEqual(published.length, 1, "non-winning events must not publish a status");

  const failingFile = { _id: "status-failure-upload", id: "status-failure-upload", name: "receipt.jpg", type: "image/jpeg" };
  const failingContent = Buffer.from("receipt-processing-status-failure");
  const failingManager = guard.createReceiptProcessingStatusManager(
    message,
    read,
    { async createWithAssociation() { throw new Error("mock persistence failure"); }, async removeByAssociation() {} },
    modify,
    { info() {}, warn() {} },
    true
  );
  assert.strictEqual(
    await failingManager.ensure(failingFile, failingContent, guard.receiptStageContext(failingFile, failingContent, {})),
    undefined,
    "status infrastructure failure must not escape into the receipt path"
  );
  assert.strictEqual(deleted.length, 2, "a status whose persistence write failed must be removed best-effort");
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
