"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

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
    is_receipt: false,
    visual_type: "hair_work_photo",
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
    is_receipt: true,
    visual_type: "bank_app_screen"
  };
}

function runtime(primaryPayload = workPhotoPayload(), options = {}) {
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
  const providerCalls = [];
  const read = {
    getPersistenceReader() { return { async readByAssociation(association) { return records.get(String(association && association.key || "")) || []; } }; },
    getMessageReader() { return { async getById() { return message; } }; },
    getRoomReader() {
      return {
        async getById(id) { return String(id) === room.id ? room : undefined; },
        async getByName(name) { return options.reportRoomUnavailable ? undefined : /^(?:otchet|отч[её]?ты?)$/i.test(String(name)) ? reportRoom : undefined; },
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
      if (/openai\.com/.test(String(url))) {
        const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
        providerCalls.push(prompt.includes("Определи только основной тип изображения") ? "image_type_v3" : "unexpected_openai");
        return { statusCode: 200, data: { output_text: JSON.stringify(primaryPayload) } };
      }
      providerCalls.push("yandex");
      return { statusCode: 200, data: {} };
    }
  };
  app.getLogger = () => ({ info() {}, warn() {}, error() {} });
  app.receiptOcrConfig = async () => ({ openaiApiKey: "test", openaiReceiptModel: "gpt-4.1-mini", timeZone: "Europe/Samara", cutoffHour: 0 });
  app.activePhotoReportIntent = async () => true;
  app.activeTransferReportIntent = async () => false;
  app.activeMailingReportIntent = async () => false;
  app.clearPhotoReportIntent = async () => {};
  app.handleMonthlyScheduleMessage = async () => false;
  app.handleMasterChatTextMessage = async () => false;
  app.handleLatenessTextMessage = async () => false;
  app.isPersonalReportRoom = () => false;
  app.isReportRequestText = () => false;
  app.refreshPersonalReportButton = async () => false;
  app.refreshPreliminaryReportAnalysis = async () => false;
  return { app, http, message, modify, persistence, providerCalls, read, reportRoom, sent };
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

  console.log("PASS: selected PHOTO uses one Vision financial/document veto, accepts safe parsed UNKNOWN, and makes zero receipt OCR/Yandex calls");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
