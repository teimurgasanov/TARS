"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const EVENT_NAME = "MANUAL_IMAGE_SELECTION_V1";
const TELEMETRY_KEYS = [
  "stage",
  "event_kind",
  "media_signal",
  "expect_media",
  "resolved_image_count_bucket",
  "source_type",
  "selection_state",
  "publisher_result",
  "error_class"
];

function associationKey(association) {
  return String(association && association.key || "");
}

function telemetryEvents(logs) {
  return logs.filter((line) => line.startsWith(`${EVENT_NAME} `)).map((line) => {
    const payload = {};
    for (const field of line.slice(EVENT_NAME.length + 1).split(/\s+/)) {
      const separator = field.indexOf("=");
      if (separator > 0) payload[field.slice(0, separator)] = field.slice(separator + 1);
    }
    return { line, payload };
  });
}

function createRuntime({ directMessages, roomMessages }) {
  const loaded = loadTrackedAppWithGuard();
  const guard = loaded.__testGuard;
  const logs = [];
  const records = new Map();
  const published = [];
  const room = directMessages[0].room;
  const sender = directMessages[0].sender;
  const appUser = { id: "app-user-secret", username: "tars", name: "TARS" };
  let directIndex = 0;
  let roomIndex = 0;
  const read = {
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          return records.get(associationKey(association)) || [];
        }
      };
    },
    getMessageReader() {
      return {
        async getById() {
          const value = directMessages[Math.min(directIndex, directMessages.length - 1)];
          directIndex += 1;
          return value;
        }
      };
    },
    getRoomReader() {
      return {
        async getById(id) { return String(id) === String(room.id) ? room : undefined; },
        async getByName() { return undefined; },
        async getMessages() {
          const value = roomMessages[Math.min(roomIndex, roomMessages.length - 1)] || [];
          roomIndex += 1;
          return value;
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
    }
  };
  const blockBuilder = () => {
    const blocks = [];
    return {
      addSectionBlock(value) { blocks.push({ type: "section", ...value }); },
      addActionsBlock(value) { blocks.push({ type: "actions", ...value }); },
      newButtonElement(value) { return value; },
      newPlainTextObject(text) { return { type: "plain_text", text }; },
      newMarkdownTextObject(text) { return { type: "mrkdwn", text }; },
      __blocks: blocks
    };
  };
  const creator = {
    getBlockBuilder: blockBuilder,
    startMessage() {
      const state = {};
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
      return message.id;
    }
  };
  const modify = {
    getCreator() { return creator; },
    getDeleter() { return { async deleteMessage() {} }; }
  };
  const app = Object.create(loaded.TarsReportApp.prototype);
  app.getLogger = () => ({
    info(value) { logs.push(String(value)); },
    warn(value) { logs.push(String(value)); },
    error(value) { logs.push(String(value)); }
  });
  app.receiptOcrConfig = async () => ({});
  app.handleMonthlyScheduleMessage = async () => false;
  app.handleMasterChatTextMessage = async () => false;
  app.handleLatenessTextMessage = async () => false;
  app.isPersonalReportRoom = () => false;
  app.isReportRequestText = () => false;
  app.refreshPersonalReportButton = async () => false;
  app.receiptWasAcceptedForMessage = async () => false;
  return { app, guard, logs, modify, persistence, published, read, records, room, sender };
}

function assertPrivacy(events, forbiddenValues) {
  for (const event of events) {
    assert.deepStrictEqual(Object.keys(event.payload), TELEMETRY_KEYS, "telemetry must contain only the strict whitelist");
    for (const forbidden of forbiddenValues) {
      assert.ok(!event.line.includes(forbidden), `telemetry leaked forbidden value: ${forbidden}`);
    }
  }
}

(async () => {
  const realSetTimeout = global.setTimeout;
  const observedDelays = [];
  global.setTimeout = (callback, delay, ...args) => {
    observedDelays.push(Number(delay || 0));
    if (Number(delay || 0) >= 60 * 1e3) return { unref() {} };
    const timer = realSetTimeout(callback, 0, ...args);
    return timer;
  };
  try {
    const room = { id: "private-room-secret", type: "d", slugifiedName: "tars-private-secret" };
    const sender = { id: "private-user-secret", username: "private-username-secret" };
    const preliminary = {
      id: "private-message-secret",
      room,
      sender,
      createdAt: new Date("2026-09-02T08:00:00.000Z"),
      text: "private-filename-secret.jpg"
    };
    const preview = {
      ...preliminary,
      attachments: [{
        title: { value: "private-filename-secret.jpg" },
        imageUrl: "https://private-url-secret/file-upload/private-preview-secret/private-filename-secret.jpg"
      }]
    };
    const originalFile = {
      _id: "private-upload-secret",
      id: "private-upload-secret",
      name: "private-filename-secret.jpg",
      type: "image/jpeg"
    };
    const original = { ...preliminary, file: originalFile, files: [originalFile], attachments: [] };
    const mobile = createRuntime({
      directMessages: [preliminary, original],
      roomMessages: [[preliminary, preview], [original]]
    });
    await mobile.app.executePostMessageSent(preliminary, mobile.read, {}, mobile.persistence, mobile.modify);
    const mobileEvents = telemetryEvents(mobile.logs);
    const stages = mobileEvents.map((event) => event.payload.stage);
    for (const stage of ["event_received", "media_resolved", "gate_reached", "publish_attempted", "publish_success", "state_written"]) {
      assert.ok(stages.includes(stage), `mobile executePostMessageSent must emit ${stage}`);
    }
    assert.ok(!stages.includes("media_not_resolved"));
    assert.ok(stages.indexOf("gate_reached") > stages.indexOf("media_resolved"), "gate must be observable only after media resolves");
    const resolved = mobileEvents.find((event) => event.payload.stage === "media_resolved").payload;
    assert.strictEqual(resolved.resolved_image_count_bucket, "1");
    assert.strictEqual(resolved.source_type, "original");
    const written = mobileEvents.find((event) => event.payload.stage === "state_written").payload;
    assert.strictEqual(written.selection_state, "created");
    assert.strictEqual(written.publisher_result, "success");
    assert.strictEqual(mobile.published.filter((message) => message.text === "Что вы отправили?").length, 1);
    assert.ok(observedDelays.includes(750), "current media resolver retry delay must remain 750 ms");
    assertPrivacy(mobileEvents, [room.id, room.slugifiedName, sender.id, sender.username, preliminary.id, originalFile.id, originalFile.name, "private-url-secret"]);

    const opaqueRoom = { id: "opaque-room-secret", type: "d", slugifiedName: "tars-opaque-secret" };
    const opaqueSender = { id: "opaque-user-secret", username: "opaque-username-secret" };
    const opaque = {
      id: "opaque-message-secret",
      room: opaqueRoom,
      sender: opaqueSender,
      createdAt: new Date("2026-09-02T08:01:00.000Z"),
      text: "opaque-mobile-secret"
    };
    const opaqueRuntime = createRuntime({ directMessages: [opaque], roomMessages: [[opaque]] });
    const delayStart = observedDelays.length;
    await opaqueRuntime.app.executePostMessageSent(opaque, opaqueRuntime.read, {}, opaqueRuntime.persistence, opaqueRuntime.modify);
    const opaqueEvents = telemetryEvents(opaqueRuntime.logs);
    assert.deepStrictEqual(opaqueEvents.map((event) => event.payload.stage), ["event_received", "media_not_resolved"]);
    assert.strictEqual(opaqueEvents[0].payload.media_signal, "false");
    assert.strictEqual(opaqueEvents[0].payload.expect_media, "false");
    assert.strictEqual(opaqueEvents[1].payload.resolved_image_count_bucket, "0");
    assert.strictEqual(opaqueEvents[1].payload.selection_state, "missing");
    assert.strictEqual(opaqueEvents[1].payload.publisher_result, "not_attempted");
    assert.strictEqual(opaqueRuntime.published.length, 0, "current opaque no-signal behavior must remain unchanged");
    assert.strictEqual(observedDelays.slice(delayStart).filter((delay) => delay === 400).length, 5, "current opaque resolver must keep six attempts with five 400 ms waits");
    assertPrivacy(opaqueEvents, [opaqueRoom.id, opaqueRoom.slugifiedName, opaqueSender.id, opaqueSender.username, opaque.id, opaque.text]);

    const uikitRuntime = createRuntime({ directMessages: [original], roomMessages: [[original]] });
    uikitRuntime.modify.getCreator().finish = async () => { throw new Error("private-uikit-error-secret"); };
    await assert.rejects(() => uikitRuntime.app.ensureManualImageSelection(uikitRuntime.read, uikitRuntime.persistence, uikitRuntime.modify, original));
    const uikitEvents = telemetryEvents(uikitRuntime.logs);
    const publishError = uikitEvents.find((event) => event.payload.stage === "publish_error");
    assert.ok(publishError, "UIKit failure must emit publish_error");
    assert.strictEqual(publishError.payload.publisher_result, "error");
    assert.strictEqual(publishError.payload.error_class, "uikit");
    assertPrivacy(uikitEvents, ["private-uikit-error-secret", room.id, sender.id, original.id, originalFile.id]);

    const persistenceRuntime = createRuntime({ directMessages: [original], roomMessages: [[original]] });
    persistenceRuntime.persistence.updateByAssociation = async () => { throw new Error("private-persistence-error-secret"); };
    await assert.rejects(() => persistenceRuntime.app.ensureManualImageSelection(persistenceRuntime.read, persistenceRuntime.persistence, persistenceRuntime.modify, original));
    const persistenceEvents = telemetryEvents(persistenceRuntime.logs);
    const persistenceError = persistenceEvents.find((event) => event.payload.stage === "state_written" && event.payload.selection_state === "error");
    assert.ok(persistenceError, "persistence failure must emit state_written/error");
    assert.strictEqual(persistenceError.payload.publisher_result, "success");
    assert.strictEqual(persistenceError.payload.error_class, "persistence");
    assertPrivacy(persistenceEvents, ["private-persistence-error-secret", room.id, sender.id, original.id, originalFile.id]);

    const safe = mobile.guard.safeManualImageSelectionTelemetryPayload({
      stage: "publish_error",
      event_kind: "upload",
      media_signal: true,
      expect_media: true,
      resolved_image_count_bucket: "2plus",
      source_type: "preview_fallback",
      selection_state: "error",
      publisher_result: "error",
      error_class: "uikit",
      roomId: "must-not-survive",
      rawError: "must-not-survive"
    });
    assert.deepStrictEqual(Object.keys(safe), TELEMETRY_KEYS);
    assert.ok(!JSON.stringify(safe).includes("must-not-survive"));
  } finally {
    global.setTimeout = realSetTimeout;
  }
  console.log("PASS: MANUAL_IMAGE_SELECTION_V1 traces real mobile executePostMessageSent stages without identifiers or behavior changes");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
