"use strict";

const assert = require("assert");
const fs = require("fs");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

function runtime(suffix) {
  const loaded = loadTrackedAppWithGuard();
  const guard = loaded.__testGuard;
  const records = new Map();
  const messages = new Map();
  const published = [];
  const deleted = [];
  const room = { id: `personal-${suffix}`, type: "d", slugifiedName: `tars-master-${suffix}` };
  const user = { id: `user-${suffix}`, username: `master-${suffix}`, name: `Master ${suffix}` };
  const appUser = { id: "tars-id", username: "tars", name: "TARS" };
  const original = {
    id: `message-${suffix}`,
    room,
    sender: user,
    file: { _id: `upload-${suffix}`, id: `upload-${suffix}`, name: `${suffix}.jpg`, type: "image/jpeg" },
    files: [{ _id: `upload-${suffix}`, id: `upload-${suffix}`, name: `${suffix}.jpg`, type: "image/jpeg" }],
    text: ""
  };
  messages.set(original.id, original);
  const persistenceReader = {
    async readByAssociation(association) {
      return records.get(associationKey(association)) || [];
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
  const read = {
    getPersistenceReader() { return persistenceReader; },
    getUserReader() {
      return {
        async getByUsername(username) { return username === "tars" ? appUser : username === user.username ? user : undefined; },
        async getAppUser() { return appUser; }
      };
    },
    getMessageReader() {
      return { async getById(id) { return messages.get(String(id)); } };
    },
    getRoomReader() {
      return {
        async getById(id) { return id === room.id ? room : undefined; },
        async getMembers() { return [appUser, user]; }
      };
    }
  };
  const creator = {
    getBlockBuilder() {
      const blocks = [];
      return {
        addSectionBlock(value) { blocks.push({ type: "section", ...value }); },
        addActionsBlock(value) { blocks.push({ type: "actions", ...value }); },
        newButtonElement(value) { return value; },
        newPlainTextObject(text) { return { text }; },
        newMarkdownTextObject(text) { return { text }; },
        __blocks: blocks
      };
    },
    startMessage(initial = {}) {
      const state = { ...initial };
      return {
        setSender(value) { state.sender = value; return this; },
        setRoom(value) { state.room = value; return this; },
        setText(value) { state.text = value; return this; },
        setBlocks(value) { state.blocks = value.__blocks || value; return this; },
        __state: state
      };
    },
    async finish(builder) {
      const message = { id: `published-${published.length + 1}`, ...(builder.__state || {}) };
      published.push(message);
      messages.set(message.id, message);
      return message.id;
    }
  };
  const modify = {
    getCreator() { return creator; },
    getDeleter() {
      return {
        async deleteMessage(message) {
          deleted.push(String(message && message.id || ""));
          if (message && message.id) messages.delete(String(message.id));
        }
      };
    }
  };
  const app = Object.create(loaded.TarsReportApp.prototype);
  app.getLogger = () => ({ info() {}, warn() {}, error() {} });
  app.receiptOcrConfig = async () => ({ scanner2ShadowMode: "RECORD_ONLY", scanner2ShadowSamplePercent: 100 });
  app.reportWorkday = () => "2026-09-01";
  app.refreshPreliminaryReportAnalysis = async () => true;
  const counters = { receipt: 0, photo: 0, mailing: 0, photoAccepted: 0 };
  guard.processPersonalMediaV2 = async (_message, _read, _persistence, _modify, _logger, _http, _config, forcedIntent) => {
    counters.receipt += 1;
    assert.strictEqual(forcedIntent, "receipt");
    return { handled: suffix !== "hair-as-receipt", status: suffix === "hair-as-receipt" ? "unclassified" : "processed" };
  };
  guard.fastForwardPersonalReportPhotos = async (_message, _read, _persistence, _modify, _logger, _http, _config, explicit, _diagnostic, options) => {
    counters.photo += 1;
    assert.strictEqual(explicit, true);
    assert.ok(_diagnostic, "manual photo safety checks must keep normalized diagnostic evidence");
    assert.deepStrictEqual(options, { skipStrictReceiptFallback: true, manualPhotoSafetyOnly: true });
    return suffix === "bank-as-photo" ? false : true;
  };
  guard.notifyWorkPhotoAccepted = async () => { counters.photoAccepted += 1; return true; };
  guard.detectPersonalMailingProof = async () => {
    counters.mailing += 1;
    return suffix === "mailing" ? { uploadId: original.file.id } : undefined;
  };
  const data = (record, interactionUser = user) => ({
    room,
    user: interactionUser,
    value: record.selectionKey,
    message: messages.get(record.promptMessageId)
  });
  return { app, counters, data, deleted, guard, loaded, messages, modify, original, persistence, published, read, records, room, user };
}

async function createSelection(state) {
  const record = await state.app.ensureManualImageSelection(state.read, state.persistence, state.modify, state.original);
  assert.ok(record && record.selectionKey);
  return record;
}

(async () => {
  // F. Preview/original events with the same canonical message share one block.
  const preview = runtime("preview-original");
  const firstPrompt = await createSelection(preview);
  assert.deepStrictEqual(preview.counters, { receipt: 0, photo: 0, mailing: 0, photoAccepted: 0 }, "no pipeline may start before selection");
  const originalVariant = { ...preview.original, file: { ...preview.original.file, id: "original-upload" }, files: [{ ...preview.original.file, id: "original-upload" }] };
  const secondPrompt = await preview.app.ensureManualImageSelection(preview.read, preview.persistence, preview.modify, originalVariant);
  assert.strictEqual(secondPrompt.promptMessageId, firstPrompt.promptMessageId);
  assert.strictEqual(preview.published.filter((message) => message.text === "Что вы отправили?").length, 1);
  const actions = preview.published.find((message) => message.id === firstPrompt.promptMessageId).blocks.find((block) => block.type === "actions").elements;
  assert.deepStrictEqual(actions.map((action) => action.text.text), ["Чек", "Фото работы", "Рассылка"]);

  // A, G and H. A work photo uses only the guarded photo route. A repeated or
  // changed click cannot run a second pipeline.
  const photo = runtime("hair-photo");
  const photoRecord = await createSelection(photo);
  await photo.app.handleManualImageTypeSelection(photo.read, {}, photo.persistence, photo.modify, photo.data(photoRecord), "photo");
  assert.strictEqual(photo.counters.photo, 1);
  assert.strictEqual(photo.counters.photoAccepted, 1);
  assert.strictEqual(photo.counters.receipt, 0, "manual work photo must not enter receipt OCR");
  assert.strictEqual(photo.counters.mailing, 0);
  assert.ok(photo.deleted.includes(photoRecord.promptMessageId), "selection block must be removed after the click");
  await photo.app.handleManualImageTypeSelection(photo.read, {}, photo.persistence, photo.modify, photo.data(photoRecord), "photo");
  await photo.app.handleManualImageTypeSelection(photo.read, {}, photo.persistence, photo.modify, photo.data(photoRecord), "receipt");
  assert.strictEqual(photo.counters.photo, 1, "double click must be idempotent");
  assert.strictEqual(photo.counters.receipt, 0, "completed type cannot be changed");
  const completedPhoto = await photo.guard.readManualImageSelection(photo.read, photoRecord.selectionKey);
  assert.strictEqual(completedPhoto.status, "completed");
  assert.strictEqual(completedPhoto.selectedType, "photo");

  // B. Receipt selection calls only the existing full receipt pipeline.
  const receipt = runtime("bank-receipt");
  const receiptRecord = await createSelection(receipt);
  await receipt.app.handleManualImageTypeSelection(receipt.read, {}, receipt.persistence, receipt.modify, receipt.data(receiptRecord), "receipt");
  assert.strictEqual(receipt.counters.receipt, 1);
  assert.strictEqual(receipt.counters.photo, 0);
  assert.strictEqual(receipt.counters.mailing, 0);

  // C. A financial/document image selected as photo is blocked and never
  // receives the work-photo acceptance outcome.
  const blockedPhoto = runtime("bank-as-photo");
  const blockedPhotoRecord = await createSelection(blockedPhoto);
  await blockedPhoto.app.handleManualImageTypeSelection(blockedPhoto.read, {}, blockedPhoto.persistence, blockedPhoto.modify, blockedPhoto.data(blockedPhotoRecord), "photo");
  assert.strictEqual(blockedPhoto.counters.photo, 1);
  assert.strictEqual(blockedPhoto.counters.photoAccepted, 0);
  assert.ok(blockedPhoto.published.some((message) => /Фото работы не принято/.test(String(message.text || ""))));

  // D. A non-financial image selected as receipt stays in the receipt route and
  // receives the existing not-financial rejection outcome.
  const notReceipt = runtime("hair-as-receipt");
  const notReceiptRecord = await createSelection(notReceipt);
  await notReceipt.app.handleManualImageTypeSelection(notReceipt.read, {}, notReceipt.persistence, notReceipt.modify, notReceipt.data(notReceiptRecord), "receipt");
  assert.strictEqual(notReceipt.counters.receipt, 1);
  assert.ok(notReceipt.published.some((message) => /не подтверждено как финансовый чек/.test(String(message.text || ""))));

  // E. Mailing selection records the proof without receipt or photo routing.
  const mailing = runtime("mailing");
  const mailingRecord = await createSelection(mailing);
  await mailing.app.handleManualImageTypeSelection(mailing.read, {}, mailing.persistence, mailing.modify, mailing.data(mailingRecord), "mailing");
  assert.strictEqual(mailing.counters.mailing, 1);
  assert.strictEqual(mailing.counters.receipt, 0);
  assert.strictEqual(mailing.counters.photo, 0);
  assert.ok(Array.from(mailing.records.values()).flat().some((entry) => entry && entry.source === "manual-image-selection"));

  // Manual photo choice uses OpenAI safety guards only. A parsed, clean but
  // conservative portrait result is user-authoritative; OCR/Yandex is never
  // called. Financial evidence remains a hard block and provider failures stay
  // fail-closed.
  const primaryPayload = (overrides = {}) => ({
    is_receipt: false,
    has_readable_text: false,
    visual_type: "salon_photo",
    is_mailing_proof: false,
    service_type: "haircut",
    is_screenshot_of_chat: false,
    date: null,
    amount: null,
    amount_text: null,
    amount_label: null,
    status: "unknown",
    bank: null,
    ...overrides
  });
  const dedicatedPayload = (overrides = {}) => ({
    is_work_photo: false,
    is_document_or_screen: false,
    is_receipt_or_banking: false,
    has_visible_client: true,
    has_visible_service_area: false,
    kind: "hair",
    confidence: 0.5,
    evidence: [],
    ...overrides
  });
  const safetyProvider = (primary, dedicated, calls) => ({
    async post(url, options) {
      calls.push(String(url || ""));
      const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
      const payload = prompt.includes("строгую классификацию изображения") ? dedicated : primary;
      return { statusCode: 200, data: { output_text: JSON.stringify(payload) } };
    }
  });
  const safetyConfig = { openaiApiKey: "test-key", openaiReceiptModel: "gpt-4.1-mini", timeZone: "Europe/Samara", cutoffHour: 0 };
  const quietLogger = { info() {}, warn() {}, error() {} };
  const cleanCalls = [];
  const cleanDecision = await photo.guard.shouldForwardConfirmedWorkPhoto(
    { _id: "manual-clean", name: "manual-clean.jpg", type: "image/jpeg" },
    Buffer.from("manual-clean-photo"),
    safetyProvider(primaryPayload(), dedicatedPayload(), cleanCalls),
    safetyConfig,
    quietLogger,
    true,
    photo.guard.createPersonalImageClassificationDiagnostic("original"),
    { manualPhotoSafetyOnly: true }
  );
  assert.deepStrictEqual(cleanDecision, { forward: true, reason: "manual-photo-safety-clean" });
  assert.strictEqual(cleanCalls.length, 3, "the existing dedicated safety guard keeps its two attempts");
  assert.ok(cleanCalls.every((url) => /api\.openai\.com/.test(url)), "manual photo safety must not invoke receipt OCR/Yandex");
  const financialCalls = [];
  const financialDecision = await photo.guard.shouldForwardConfirmedWorkPhoto(
    { _id: "manual-bank", name: "manual-bank.jpg", type: "image/jpeg" },
    Buffer.from("manual-bank-screen"),
    safetyProvider(primaryPayload({ is_receipt: true, visual_type: "bank_app_screen", amount: 1200 }), dedicatedPayload({ is_receipt_or_banking: true }), financialCalls),
    safetyConfig,
    quietLogger,
    true,
    photo.guard.createPersonalImageClassificationDiagnostic("original"),
    { manualPhotoSafetyOnly: true }
  );
  assert.strictEqual(financialDecision.forward, false);
  assert.strictEqual(financialDecision.reason, "document-or-screen");
  assert.strictEqual(financialCalls.length, 1, "a primary financial block must stop before further work-photo processing");

  const source = fs.readFileSync("TarsReportApp.js", "utf8");
  const postBlock = source.slice(source.indexOf("async executePostMessageSent"), source.indexOf("photoReportIntentAssociation", source.indexOf("async executePostMessageSent")));
  assert.match(postBlock, /if \(hasPersonalImageUpload\) \{[\s\S]*ensureManualImageSelection[\s\S]*return;/);
  assert.ok(postBlock.indexOf("ensureManualImageSelection") < postBlock.indexOf("detectPersonalMailingProof"), "selection gate must precede automatic classification");
  assert.doesNotMatch(source, /(evaluateRules|resolveConflicts|makeDecision|runOfflineComparison|runOfflineDataset)\s*\(/);

  console.log("PASS: each personal image requires one idempotent manual type selection before a guarded existing pipeline");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
