"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function currentSamaraReceiptDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Samara",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    display: `${parts.day}.${parts.month}.${parts.year}`
  };
}

function workPhotoPayload() {
  return {
    kind: "work_photo",
    confidence: "high",
    service_kind: "hair",
    has_payment_ui: false,
    has_receipt_layout: false,
    has_financial_document: false,
    has_document_layout: false,
    has_visible_client: true,
    has_visible_service_result: true,
    has_visible_hair_result: true,
    has_visible_nail_result: false,
    has_visible_brow_lash_result: false,
    has_salon_context: true,
    has_messaging_ui: false,
    is_receipt: false,
    is_banking: false,
    is_document: false,
    has_receipt_text: false,
    is_mailing_proof: false,
    is_screenshot_of_chat: false,
    visual_type: "hair_work_photo",
    service_type: "haircut",
    date: null,
    amount: null,
    status: "unknown",
    bank: null
  };
}

function safeUnknownPhotoPayload() {
  return {
    ...workPhotoPayload(),
    kind: "unknown",
    confidence: "low",
    service_kind: "none",
    has_visible_client: false,
    has_visible_service_result: false,
    has_visible_hair_result: false,
    visual_type: "unknown"
  };
}

function financialPayload() {
  return {
    ...workPhotoPayload(),
    kind: "receipt",
    confidence: "high",
    service_kind: "none",
    has_payment_ui: true,
    has_receipt_layout: true,
    has_visible_client: false,
    has_visible_service_result: false,
    has_visible_hair_result: false,
    has_salon_context: false,
    is_receipt: true,
    is_banking: true,
    is_document: true,
    has_receipt_text: true,
    visual_type: "bank_app_screen"
  };
}

function mailingPayload() {
  return {
    ...safeUnknownPhotoPayload(),
    kind: "mailing",
    confidence: "high",
    has_messaging_ui: true,
    is_mailing_proof: true,
    is_screenshot_of_chat: true,
    visual_type: "mailing_proof_screenshot"
  };
}

function runtime(primaryPayload = workPhotoPayload(), runtimeOptions = {}) {
  const loaded = loadTrackedAppWithGuard();
  const app = Object.create(loaded.TarsReportApp.prototype);
  const file = { _id: "preselected-photo", id: "preselected-photo", name: "result.jpg", type: "image/jpeg", url: "/file-upload/preselected-photo/result.jpg" };
  const content = Buffer.from("preselected-work-photo-v3");
  const room = { id: "personal-room", slugifiedName: "tars-master", type: "p" };
  const reportRoom = { id: "report-room", slugifiedName: "otchet", type: "c" };
  const appUser = { id: "app-user", username: "tars" };
  const message = { id: "photo-message", room, sender: { id: "master-user", username: "master" }, file, files: [file], text: "" };
  const records = new Map();
  const sent = [];
  const logs = [];
  const providerCalls = [];
  const read = {
    getPersistenceReader() { return { async readByAssociation(association) { return records.get(String(association && association.key || "")) || []; } }; },
    getMessageReader() { return { async getById() { return message; } }; },
    getRoomReader() {
      return {
        async getById(id) { return String(id) === room.id ? room : undefined; },
        async getByName(name) { return runtimeOptions.reportRoomUnavailable ? undefined : /^(?:otchet|отч[её]?ты?)$/i.test(String(name)) ? reportRoom : undefined; },
        async getMessages() { return []; }
      };
    },
    getUserReader() { return { async getByUsername() { return appUser; }, async getAppUser() { return appUser; } }; },
    getUploadReader() {
      return {
        async getBufferById(id) { assert.strictEqual(String(id), file.id); return content; },
        async getById(id) { return { id, url: file.url }; }
      };
    }
  };
  const persistence = {
    async updateByAssociation(association, value) { records.set(String(association && association.key || ""), [value]); return value; },
    async createWithAssociation(value, association) {
      const key = String(association && association.key || "");
      records.set(key, (records.get(key) || []).concat([value]));
      return value;
    },
    async removeByAssociation(association) { records.delete(String(association && association.key || "")); }
  };
  let sequence = 0;
  const creator = {
    startMessage(initial = {}) {
      const value = { ...initial };
      return {
        setSender(sender) { value.sender = sender; return this; },
        setRoom(target) { value.room = target; return this; },
        setText(text) { value.text = text; return this; },
        setParseUrls(parseUrls) { value.parseUrls = parseUrls; return this; },
        __value: value
      };
    },
    async finish(builder) { const created = { id: `created-${++sequence}`, ...builder.__value }; sent.push(created); return created.id; }
  };
  const modify = { getCreator() { return creator; }, getDeleter() { return { async deleteMessage() {} }; } };
  const http = {
    async post(url, options) {
      if (/ai\.api\.cloud\.yandex\.net\/v1\/responses/.test(String(url))) {
        providerCalls.push("yandex_primary");
        if (runtimeOptions.yandexPrimaryStatus) return { statusCode: runtimeOptions.yandexPrimaryStatus, data: {} };
        const classificationOnly = Object.fromEntries(Object.entries(primaryPayload).filter(([key]) => !["date", "amount", "status", "bank"].includes(key)));
        return { statusCode: 200, data: { output: [{ content: [{ type: "output_text", text: JSON.stringify(classificationOnly) }] }] } };
      }
      if (/openai\.com/.test(String(url))) {
        const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
        providerCalls.push(prompt.includes("Определи только основной тип изображения") ? "image_type_v3" : "unexpected_openai");
        return runtimeOptions.openaiStatus
          ? { statusCode: runtimeOptions.openaiStatus, data: {} }
          : { statusCode: 200, data: { output_text: JSON.stringify(primaryPayload) } };
      }
      providerCalls.push("yandex");
      if (runtimeOptions.yandexStatus) return { statusCode: runtimeOptions.yandexStatus, data: {} };
      return {
        statusCode: 200,
        data: {
          result: {
            textAnnotation: { fullText: String(runtimeOptions.yandexText || "") }
          }
        }
      };
    }
  };
  app.getLogger = () => ({ info(message) { logs.push(String(message)); }, warn(message) { logs.push(String(message)); }, error(message) { logs.push(String(message)); } });
  app.receiptOcrConfig = async () => ({
    apiKey: "test-yandex",
    folderId: "test-folder",
    yandexAiStudioApiKey: runtimeOptions.yandexPrimary ? "test-yandex-ai-studio" : "",
    yandexAiStudioFolderId: runtimeOptions.yandexPrimary ? "test-folder" : "",
    yandexAiStudioModel: "qwen3.6-35b-a3b",
    openaiApiKey: "test",
    openaiReceiptModel: "gpt-4.1-mini",
    timeZone: "Europe/Samara",
    cutoffHour: 0
  });
  const selectedIntent = String(runtimeOptions.intent || "photo");
  app.activePhotoReportIntent = async () => selectedIntent === "photo";
  app.activeTransferReportIntent = async () => selectedIntent === "receipt";
  app.activeMailingReportIntent = async () => selectedIntent === "mailing";
  app.clearPhotoReportIntent = async () => {};
  app.clearTransferReportIntent = async () => {};
  app.clearMailingReportIntent = async () => {};
  app.handleMonthlyScheduleMessage = async () => false;
  app.handleMasterChatTextMessage = async () => false;
  app.handleLatenessTextMessage = async () => false;
  app.isPersonalReportRoom = () => false;
  app.isReportRequestText = () => false;
  app.refreshPersonalReportButton = async () => false;
  app.refreshPreliminaryReportAnalysis = async () => false;
  return { app, http, logs, message, modify, persistence, providerCalls, read, records, reportRoom, sent };
}

async function execute(state) {
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay, ...args) => {
    if (Number(delay || 0) >= 60000) return { unref() {} };
    return realSetTimeout(callback, 0, ...args);
  };
  try {
    await state.app.executePostMessageSent(state.message, state.read, state.http, state.persistence, state.modify);
  } finally {
    global.setTimeout = realSetTimeout;
  }
}

(async () => {
  const state = runtime();
  await execute(state);
  assert.deepStrictEqual(state.providerCalls, ["image_type_v3"], "preselected photo must use one Vision confirmation and zero receipt OCR/Yandex calls");
  assert.ok(state.sent.some((message) => message.room === state.reportRoom), "confirmed photo must use the existing report route");
  assert.ok(state.sent.some((message) => message.text === "✅ ФОТО РАБОТЫ ПРИНЯТО"), "confirmed photo must retain the existing success result");
  assert.ok(!state.sent.some((message) => message.text === "Что вы отправили?"), "post-upload manual selection must stay disabled");

  const safeUnknown = runtime(safeUnknownPhotoPayload());
  safeUnknown.message.text = "чек по операции";
  safeUnknown.message.file.name = "receipt-bank-transfer.jpg";
  safeUnknown.message.files[0].name = "receipt-bank-transfer.jpg";
  await execute(safeUnknown);
  assert.deepStrictEqual(safeUnknown.providerCalls, ["image_type_v3"], "safe parsed UNKNOWN must not trigger a second classifier, receipt OCR, or Yandex even when old filename/text heuristics look financial");
  assert.ok(safeUnknown.sent.some((message) => message.room === safeUnknown.reportRoom), "explicit PHOTO plus clean Vision safety evidence must override old filename/text heuristics");
  assert.ok(safeUnknown.sent.some((message) => message.text === "✅ ФОТО РАБОТЫ ПРИНЯТО"), "safe parsed UNKNOWN must produce the existing photo success result");

  const unavailableReport = runtime(safeUnknownPhotoPayload(), { reportRoomUnavailable: true });
  await execute(unavailableReport);
  assert.deepStrictEqual(unavailableReport.providerCalls, ["image_type_v3"], "a selected PHOTO publisher failure must stop safely without falling through to receipt OCR/Yandex");
  assert.ok(!unavailableReport.sent.some((message) => message.room === unavailableReport.reportRoom), "publisher failure must not fabricate a report photo");

  const financial = runtime(financialPayload());
  await execute(financial);
  assert.deepStrictEqual(financial.providerCalls, ["image_type_v3"], "financial veto must use only the primary Vision decision");
  assert.ok(!financial.sent.some((message) => message.room === financial.reportRoom), "positive financial evidence must block the photo route");
  assert.ok(financial.sent.some((message) => /Фото работы не принято/.test(String(message.text || ""))), "financial veto must retain the existing safe rejection UX");

  const yandexPhoto = runtime(workPhotoPayload(), { yandexPrimary: true });
  await execute(yandexPhoto);
  assert.deepStrictEqual(yandexPhoto.providerCalls, ["yandex_primary"], "Yandex primary must preserve work-photo routing without OpenAI or OCR");
  assert.ok(yandexPhoto.sent.some((message) => message.room === yandexPhoto.reportRoom));
  assert.deepStrictEqual(yandexPhoto.sent.map((message) => message.text), state.sent.map((message) => message.text), "Yandex primary must not add publisher side effects to the work-photo path");
  assert.deepStrictEqual([...yandexPhoto.records.keys()].sort(), [...state.records.keys()].sort(), "Yandex primary must not add persistence side effects to the work-photo path");

  const yandexFinancial = runtime(financialPayload(), { yandexPrimary: true });
  await execute(yandexFinancial);
  assert.deepStrictEqual(yandexFinancial.providerCalls, ["yandex_primary"], "Yandex primary must preserve the financial safety veto");
  assert.ok(!yandexFinancial.sent.some((message) => message.room === yandexFinancial.reportRoom));
  assert.deepStrictEqual(yandexFinancial.sent.map((message) => message.text), financial.sent.map((message) => message.text), "Yandex financial veto must preserve publisher behavior");

  const yandexUnknown = runtime(safeUnknownPhotoPayload(), { yandexPrimary: true });
  await execute(yandexUnknown);
  assert.deepStrictEqual(yandexUnknown.providerCalls, ["yandex_primary"], "Yandex UNKNOWN must preserve the existing explicit-photo safe path");
  assert.ok(yandexUnknown.sent.some((message) => message.room === yandexUnknown.reportRoom));

  const openAiMailing = runtime(mailingPayload(), { intent: "mailing" });
  await execute(openAiMailing);
  const yandexMailing = runtime(mailingPayload(), { yandexPrimary: true, intent: "mailing" });
  await execute(yandexMailing);
  assert.deepStrictEqual(yandexMailing.providerCalls, ["yandex_primary"], "Yandex primary must preserve mailing routing without OCR or OpenAI");
  assert.ok(yandexMailing.sent.some((message) => message.text === "✅ РАССЫЛКИ ПРИНЯТЫ"));
  assert.deepStrictEqual(yandexMailing.sent.map((message) => message.text), openAiMailing.sent.map((message) => message.text), "Yandex primary must preserve mailing publishers");
  assert.deepStrictEqual([...yandexMailing.records.keys()].sort(), [...openAiMailing.records.keys()].sort(), "Yandex primary must preserve mailing persistence keys");

  const yandexUnavailable = runtime(safeUnknownPhotoPayload(), { yandexPrimary: true, yandexPrimaryStatus: 403 });
  await execute(yandexUnavailable);
  assert.deepStrictEqual(yandexUnavailable.providerCalls, ["yandex_primary", "yandex", "yandex"], "Yandex primary 4xx must fail open to the unchanged bounded OCR safety guard");
  const failedTrace = yandexUnavailable.logs.find((line) => line.includes("TARS_TRACE_V1") && line.includes('"stage":"primary_classification"') && line.includes('"outcome":"failed"'));
  assert(failedTrace, "primary provider failure must emit structured trace telemetry");
  assert(failedTrace.includes('"provider":"yandex_ai_studio"'));
  assert(failedTrace.includes('"error_class":"provider_4xx"'));
  assert(failedTrace.includes('"reason_code":"PRIMARY_PROVIDER_4XX"'));
  assert(failedTrace.includes('"attempt":1'));
  assert(!failedTrace.includes("test-yandex-ai-studio"), "trace must not expose provider credentials");

  const openAiUnavailable = runtime(safeUnknownPhotoPayload(), { openaiStatus: 403 });
  await execute(openAiUnavailable);
  assert.deepStrictEqual(openAiUnavailable.providerCalls, ["image_type_v3", "yandex", "yandex"], "OpenAI failure must use one primary attempt followed by the bounded Yandex safety gate");
  assert.ok(openAiUnavailable.sent.some((message) => message.room === openAiUnavailable.reportRoom), "explicit PHOTO must continue when Yandex finds no financial/document evidence");
  assert.ok(openAiUnavailable.sent.some((message) => message.text === "✅ ФОТО РАБОТЫ ПРИНЯТО"), "safe Yandex fallback must retain the existing photo success result");

  const openAiUnavailableFinancial = runtime(safeUnknownPhotoPayload(), {
    openaiStatus: 403,
    yandexText: "Сбербанк. Чек по операции. Перевод выполнен. Сумма 1200 ₽. 02.09.2026"
  });
  await execute(openAiUnavailableFinancial);
  assert.deepStrictEqual(openAiUnavailableFinancial.providerCalls, ["image_type_v3", "yandex"], "positive Yandex financial evidence must block immediately");
  assert.ok(!openAiUnavailableFinancial.sent.some((message) => message.room === openAiUnavailableFinancial.reportRoom), "financial image must never enter the report-photo route");

  const allProvidersUnavailable = runtime(safeUnknownPhotoPayload(), { openaiStatus: 403, yandexStatus: 503 });
  await execute(allProvidersUnavailable);
  assert.strictEqual(allProvidersUnavailable.providerCalls.filter((call) => call === "image_type_v3").length, 1, "a failed primary Vision request must not be repeated");
  assert.ok(!allProvidersUnavailable.sent.some((message) => message.room === allProvidersUnavailable.reportRoom), "the fallback must fail closed when Yandex is unavailable");

  const today = currentSamaraReceiptDate();
  const receiptWithVisionUnavailable = runtime(financialPayload(), {
    intent: "receipt",
    openaiStatus: 403,
    yandexText: `Сбербанк. Чек по операции. Перевод выполнен. Сумма 1200 ₽. ${today.display}`
  });
  receiptWithVisionUnavailable.message.file.name = "receipt.jpg";
  receiptWithVisionUnavailable.message.files[0].name = "receipt.jpg";
  await execute(receiptWithVisionUnavailable);
  assert.strictEqual(receiptWithVisionUnavailable.providerCalls.filter((call) => call === "image_type_v3").length, 1, "selected RECEIPT must make only one failed primary Vision attempt before strict validation");
  assert.ok(receiptWithVisionUnavailable.providerCalls.includes("yandex"), "selected RECEIPT must continue into the existing strict Yandex/OCR validation when primary Vision is unavailable");
  assert.ok(!receiptWithVisionUnavailable.sent.some((message) => /Vision не подтвердил финансовый документ/.test(String(message.text || ""))), "provider unavailability must not be reported as a negative Vision classification");
  const receiptIndex = receiptWithVisionUnavailable.records.get("receipt-duplicate-index-v1") || [];
  const acceptedReceipts = receiptIndex.flatMap((record) => Array.isArray(record && record.photos) ? record.photos : []).filter((entry) => entry && entry.source === "confirmed");
  assert.strictEqual(acceptedReceipts.length, 1, "a strict Yandex receipt must be accepted when OpenAI is unavailable");
  assert.strictEqual(acceptedReceipts[0].receiptDate, today.iso);
  assert.strictEqual(acceptedReceipts[0].receiptAmount, 1200);

  const nonReceiptSelectedAsReceipt = runtime(workPhotoPayload(), { intent: "receipt" });
  await execute(nonReceiptSelectedAsReceipt);
  assert.deepStrictEqual(nonReceiptSelectedAsReceipt.providerCalls, ["image_type_v3"], "a positive non-receipt Vision decision must still block before OCR");
  assert.ok(nonReceiptSelectedAsReceipt.sent.some((message) => /Vision не подтвердил финансовый документ/.test(String(message.text || ""))), "a positive non-receipt Vision decision must retain the existing rejection UX");

  console.log("PASS: selected PHOTO keeps its fail-closed safety fallback and selected RECEIPT reaches strict validation when OpenAI Vision is unavailable");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
