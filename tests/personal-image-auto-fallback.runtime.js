"use strict";

const assert = require("assert");
const fs = require("fs");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

function visionPayload(kind, confidence = "high") {
  const receipt = kind === "receipt";
  const photo = kind === "work_photo";
  const mailing = kind === "mailing";
  return {
    kind,
    confidence,
    service_kind: photo ? "hair" : "none",
    has_payment_ui: receipt,
    has_receipt_layout: receipt,
    has_financial_document: receipt,
    has_document_layout: receipt,
    has_visible_client: photo,
    has_visible_service_result: photo,
    has_visible_hair_result: photo,
    has_visible_nail_result: false,
    has_visible_brow_lash_result: false,
    has_salon_context: photo,
    has_messaging_ui: mailing,
    is_receipt: receipt,
    is_banking: receipt,
    is_document: receipt,
    has_receipt_text: receipt,
    is_mailing_proof: mailing,
    is_screenshot_of_chat: mailing,
    visual_type: receipt ? "bank_receipt" : photo ? "hair_work_photo" : mailing ? "mailing_proof_screenshot" : "unknown",
    service_type: photo ? "haircut" : "unknown",
    date: receipt ? "2026-09-03" : null,
    amount: receipt ? 1300 : null,
    amount_text: receipt ? "1 300 RUB" : null,
    amount_label: receipt ? "Сумма операции" : null,
    status: receipt ? "success" : "unknown",
    bank: receipt ? "TEST BANK" : null
  };
}

function runtime(suffix, options = {}) {
  const loaded = loadTrackedAppWithGuard();
  const guard = loaded.__testGuard;
  const records = new Map();
  const messages = new Map();
  const published = [];
  const deleted = [];
  const jobs = [];
  const providerCalls = [];
  const room = { id: `room-${suffix}`, type: "d", slugifiedName: `tars-${suffix}` };
  const user = { id: `user-${suffix}`, username: suffix, name: `Master ${suffix}` };
  const appUser = { id: "tars-app", username: "tars", name: "TARS" };
  const file = { _id: `upload-${suffix}`, id: `upload-${suffix}`, name: `${suffix}.jpg`, type: "image/jpeg" };
  const message = { id: `message-${suffix}`, room, sender: user, file, files: [file], attachments: [], text: "" };
  messages.set(message.id, message);

  const read = {
    getPersistenceReader() {
      return { async readByAssociation(association) { return records.get(associationKey(association)) || []; } };
    },
    getUserReader() {
      return {
        async getByUsername(username) { return username === "tars" ? appUser : username === user.username ? user : undefined; },
        async getById(id) { return String(id) === user.id ? user : String(id) === appUser.id ? appUser : undefined; },
        async getAppUser() { return appUser; }
      };
    },
    getMessageReader() {
      return { async getById(id) { return messages.get(String(id)); } };
    },
    getRoomReader() {
      return {
        async getById(id) { return String(id) === room.id ? room : undefined; },
        async getByName() { return undefined; },
        async getMembers() { return [appUser, user]; },
        async getMessages() { return Array.from(messages.values()).reverse(); }
      };
    },
    getUploadReader() {
      return { async getBufferById() { return Buffer.from(`canonical-${suffix}`); } };
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
    async removeByAssociation(association) { records.delete(associationKey(association)); }
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
      const result = { id: `published-${suffix}-${published.length + 1}`, ...(builder.__state || {}) };
      published.push(result);
      messages.set(result.id, result);
      return result.id;
    }
  };
  const modify = {
    getCreator() { return creator; },
    getDeleter() {
      return { async deleteMessage(value) { deleted.push(String(value && value.id || "")); if (value && value.id) messages.delete(String(value.id)); } };
    },
    getScheduler() {
      return { async scheduleOnce(job) { jobs.push(job); return `job-${jobs.length}`; } };
    }
  };
  const config = {
    personalImageAutoFallbackEnabled: options.enabled !== false,
    imageClassificationV1ShadowEnabled: false,
    yandexAiStudioApiKey: "test-yandex-key",
    yandexAiStudioFolderId: "b1gtestfolder",
    yandexAiStudioModel: "qwen3.6-35b-a3b",
    timeZone: "Europe/Samara",
    cutoffHour: 0,
    scanner2ShadowMode: "RECORD_ONLY",
    scanner2ShadowSamplePercent: 100
  };
  const http = {
    async post(url) {
      providerCalls.push(String(url));
      if (options.providerError) throw new Error("provider timeout");
      return {
        statusCode: 200,
        data: { output: [{ content: [{ type: "output_text", text: JSON.stringify(visionPayload(options.kind || "work_photo", options.confidence || "high")) }] }] }
      };
    }
  };
  const app = Object.create(loaded.TarsReportApp.prototype);
  app.getLogger = () => ({ info() {}, warn() {}, error() {} });
  app.receiptOcrConfig = async () => ({ ...config });
  app.activePhotoReportIntent = async () => options.explicitType === "photo";
  app.activeTransferReportIntent = async () => options.explicitType === "receipt";
  app.activeMailingReportIntent = async () => options.explicitType === "mailing";
  app.handleMonthlyScheduleMessage = async () => false;
  app.handleMasterChatTextMessage = async () => false;
  app.handleLatenessTextMessage = async () => false;
  app.isPersonalReportRoom = () => true;
  app.isReportRequestText = () => false;
  app.refreshPersonalReportButton = async () => false;
  app.refreshPreliminaryReportAnalysis = async () => false;
  app.receiptWasAcceptedForMessage = async () => false;
  app.reportWorkday = () => "2026-09-03";
  const counters = { receipt: 0, photo: 0, mailing: 0, photoAccepted: 0 };
  guard.processPersonalMediaV2 = async (_message, _read, _persistence, _modify, _logger, _http, _config, forcedIntent) => {
    assert.ok(forcedIntent === "receipt" || forcedIntent === "photo");
    if (forcedIntent === "receipt") counters.receipt += 1;
    else counters.photo += 1;
    return { handled: true, status: "processed" };
  };
  guard.fastForwardPersonalReportPhotos = async (_message, _read, _persistence, _modify, _logger, _http, _config, explicit, _diagnostic, routing) => {
    assert.strictEqual(explicit, true);
    assert.strictEqual(routing.primaryVisionAttempted, true);
    assert.strictEqual(routing.primaryVisionDecision.kind, "work_photo");
    counters.photo += 1;
    return true;
  };
  guard.notifyWorkPhotoAccepted = async () => { counters.photoAccepted += 1; };
  guard.detectPersonalMailingProof = async () => { counters.mailing += 1; return { uploadId: file.id }; };

  async function execute(input = message) {
    messages.set(input.id, input);
    await app.executePostMessageSent(input, read, http, persistence, modify);
  }
  async function runJob(index = 0, contextShape = "direct") {
    assert(jobs[index], `scheduled job ${index} is missing`);
    const data = jobs[index].data;
    const context = contextShape === "serialized-data" ? { data: JSON.stringify(data) }
      : contextShape === "serialized-job-data" ? { jobData: JSON.stringify(data) }
      : data;
    await app.automaticPersonalImageClassificationJob(context, read, modify, http, persistence);
  }
  return { app, counters, deleted, execute, file, guard, http, jobs, message, messages, modify, persistence, providerCalls, published, read, records, room, runJob, user };
}

function selectionRecord(state) {
  return Array.from(state.records.entries())
    .filter(([key]) => key.includes("manual-image-selection-v1:"))
    .flatMap(([, values]) => values)[0];
}

(async () => {
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (callback, delay, ...args) => {
    if (Number(delay || 0) >= 60 * 1e3) return { unref() {} };
    return realSetTimeout(callback, 0, ...args);
  };
  try {
    const photo = runtime("auto-photo", { kind: "work_photo" });
    await photo.execute();
    assert.strictEqual(photo.jobs.length, 1, "one image must schedule one fallback job");
    assert.strictEqual(photo.jobs[0].id, "personal-image-auto-fallback-v1");
    assert.strictEqual(Number(photo.jobs[0].when) - Number(selectionRecord(photo).autoScheduledAt), 45e3, "manual choice gets a 45 second grace window");
    assert.strictEqual(photo.published.filter((value) => value.text === "Что вы отправили?").length, 1);
    assert.deepStrictEqual(photo.counters, { receipt: 0, photo: 0, mailing: 0, photoAccepted: 0 }, "no pipeline may run during grace");
    await photo.runJob();
    assert.deepStrictEqual(photo.counters, { receipt: 0, photo: 1, mailing: 0, photoAccepted: 1 });
    assert.strictEqual(selectionRecord(photo).status, "completed");
    assert.strictEqual(selectionRecord(photo).intentSource, "auto");
    assert.strictEqual(photo.providerCalls.length, 1, "automatic route must make one Vision decision");
    await photo.runJob();
    assert.strictEqual(photo.counters.photo, 1, "repeated scheduler delivery must be idempotent");

    const schedulerWrapped = runtime("scheduler-wrapped", { kind: "work_photo" });
    await schedulerWrapped.execute();
    const storedWithoutMedia = { ...schedulerWrapped.message };
    delete storedWithoutMedia.file;
    storedWithoutMedia.files = [];
    schedulerWrapped.messages.set(storedWithoutMedia.id, storedWithoutMedia);
    await schedulerWrapped.runJob(0, "serialized-job-data");
    assert.strictEqual(schedulerWrapped.providerCalls.length, 1, "serialized scheduler data must reach Vision");
    assert.strictEqual(schedulerWrapped.counters.photo, 1, "persisted canonical upload must survive a media-less MessageReader result");
    assert.strictEqual(selectionRecord(schedulerWrapped).status, "completed");

    const sourceRecreated = runtime("source-recreated", { kind: "work_photo" });
    await sourceRecreated.execute();
    sourceRecreated.messages.delete(sourceRecreated.message.id);
    await sourceRecreated.runJob(0, "serialized-data");
    assert.strictEqual(sourceRecreated.providerCalls.length, 1, "persisted upload must reach Vision when the source message is unavailable");
    assert.strictEqual(sourceRecreated.counters.photo, 1, "room, sender, and canonical upload must be safely reconstructed");
    assert.strictEqual(selectionRecord(sourceRecreated).status, "completed");

    const receipt = runtime("auto-receipt", { kind: "receipt" });
    await receipt.execute();
    await receipt.runJob();
    assert.deepStrictEqual(receipt.counters, { receipt: 1, photo: 0, mailing: 0, photoAccepted: 0 });

    const mailing = runtime("auto-mailing", { kind: "mailing" });
    await mailing.execute();
    await mailing.runJob();
    assert.deepStrictEqual(mailing.counters, { receipt: 0, photo: 0, mailing: 1, photoAccepted: 0 });
    assert.strictEqual(selectionRecord(mailing).intentSource, "auto");

    const unknown = runtime("auto-unknown", { kind: "unknown", confidence: "low" });
    await unknown.execute();
    await unknown.runJob();
    assert.deepStrictEqual(unknown.counters, { receipt: 0, photo: 0, mailing: 0, photoAccepted: 0 });
    assert.strictEqual(selectionRecord(unknown).status, "needs_intent");
    assert.ok(unknown.published.some((value) => value.text === "Что вы отправили?"), "UNKNOWN must leave the buttons available");

    const unavailable = runtime("auto-timeout", { providerError: true });
    await unavailable.execute();
    await unavailable.runJob();
    assert.deepStrictEqual(unavailable.counters, { receipt: 0, photo: 0, mailing: 0, photoAccepted: 0 });
    assert.strictEqual(selectionRecord(unavailable).status, "needs_intent");
    assert.strictEqual(selectionRecord(unavailable).outcome, "auto-provider-unavailable");

    const buttonWins = runtime("button-wins", { kind: "work_photo" });
    await buttonWins.execute();
    const pending = selectionRecord(buttonWins);
    await buttonWins.app.handleManualImageTypeSelection(buttonWins.read, buttonWins.http, buttonWins.persistence, buttonWins.modify, {
      room: buttonWins.room,
      user: buttonWins.user,
      value: pending.selectionKey,
      message: buttonWins.messages.get(pending.promptMessageId)
    }, "photo");
    await buttonWins.runJob();
    assert.strictEqual(buttonWins.counters.photo, 1, "button and timer must still run one pipeline");
    assert.strictEqual(selectionRecord(buttonWins).intentSource, "button");

    const preview = runtime("preview-original", { kind: "work_photo" });
    const previewFile = { ...preview.file, _id: "preview-upload", id: "preview-upload", name: "thumb-preview-original.jpg" };
    await preview.execute({ ...preview.message, file: previewFile, files: [previewFile], __mediaV2PreviewOnly: true });
    const originalFile = { ...preview.file, _id: "original-upload", id: "original-upload" };
    await preview.execute({ ...preview.message, file: originalFile, files: [originalFile], __mediaV2PreviewOnly: false });
    assert.strictEqual(preview.published.filter((value) => value.text === "Что вы отправили?").length, 1, "preview/original must share one selection block");
    assert.strictEqual(preview.jobs.length, 1, "preview/original must schedule one classifier job");

    const disabled = runtime("disabled", { enabled: false });
    await disabled.execute();
    assert.strictEqual(disabled.jobs.length, 0);
    assert.strictEqual(disabled.published.filter((value) => value.text === "ВЫБЕРИТЕ ТИП ЗАГРУЗКИ").length, 1, "default-off mode must preserve the prior three-button flow");
    assert.deepStrictEqual(disabled.counters, { receipt: 0, photo: 0, mailing: 0, photoAccepted: 0 });

    const explicit = runtime("explicit", { explicitType: "photo", kind: "work_photo" });
    await explicit.execute();
    assert.strictEqual(explicit.jobs.length, 0, "preselected type must bypass grace and auto fallback");
    assert.strictEqual(explicit.counters.photo, 1);

    const source = fs.readFileSync("TarsReportApp.js", "utf8");
    assert.match(source, /id:\s*"personal_image_auto_fallback_enabled"[\s\S]*?packageValue:\s*false[\s\S]*?public:\s*false/);
    assert.doesNotMatch(source, /(evaluateRules|resolveConflicts|makeDecision|runOfflineComparison|runOfflineDataset)\s*\(/,
      "Scanner 2.0 decision engine must remain RECORD_ONLY");
  } finally {
    global.setTimeout = realSetTimeout;
  }
  console.log("PASS: default-off per-image automatic fallback preserves buttons and starts exactly one existing pipeline after HIGH Vision");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
