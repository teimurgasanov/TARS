"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

function previousCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function openAiResponse(payload) {
  return { statusCode: 200, data: { output_text: JSON.stringify(payload) } };
}

function runtimeScenario(guard, mode, suffix) {
  const consensusMode = mode === "rejected-consensus";
  const records = new Map();
  const sourceContent = Buffer.from(`personal-receipt-control-${mode}-${suffix}`);
  const sourceContents = new Map();
  const personalRoom = { id: `personal-${suffix}`, type: "d", slugifiedName: `tars-master-${suffix}` };
  const controlRoom = { id: "control-room", type: "p", slugifiedName: "cheki-kontrol", displayName: "Контроль чеков" };
  const owner = { id: `owner-${suffix}`, username: `master-${suffix}`, name: `Master ${suffix}` };
  const appUser = { id: "tars-id", username: "tars", name: "TARS" };
  const teimur = { id: "teimur-id", username: "teimur", name: "Teimur" };
  const shura = { id: "shura-id", username: "shura", name: "Shura" };
  const messageFile = { _id: `upload-${suffix}`, id: `upload-${suffix}`, name: `image-${suffix}.jpg`, type: "image/jpeg" };
  sourceContents.set(messageFile.id, sourceContent);
  const message = {
    id: `message-${suffix}`,
    room: personalRoom,
    sender: owner,
    file: messageFile,
    files: [messageFile],
    text: "",
    createdAt: new Date()
  };
  const config = {
    apiKey: consensusMode ? "test-yandex-key" : "",
    folderId: consensusMode ? "test-folder" : "",
    openaiApiKey: "test-openai-key",
    openaiReceiptModel: "gpt-4.1-mini",
    scanner2ShadowMode: "OFF",
    scanner2ShadowSamplePercent: 0,
    scanner2ShadowHmacSecret: "",
    scanner2ShadowTokenKeyVersion: "k1",
    scanner2ShadowRetentionDays: 30,
    scanner2ShadowMaxRecords: 5000,
    timeZone: "Europe/Astrakhan",
    cutoffHour: 0,
    ownerUsername: "teimur",
    adminUsername: "shura",
    reviewRejectedReceipts: true,
    archiveEnabled: false
  };
  const requiredDate = guard.expectedReceiptDate(config);
  const observedDate = mode === "rejected" || consensusMode ? previousCalendarDate(requiredDate) : requiredDate;
  let receiptCalls = 0;
  let dedicatedCalls = 0;
  let yandexCalls = 0;
  const providerCalls = [];
  const http = {
    async post(url, options) {
      if (String(url).includes("ocr.api.cloud.yandex.net")) {
        yandexCalls += 1;
        const model = String(options && options.data && options.data.model || "unknown");
        providerCalls.push(`yandex:${model}`);
        const initialClassifierPass = consensusMode && yandexCalls <= 2;
        const text = initialClassifierPass
          ? "человек волосы лицо затылок"
          : [
              "Сбербанк",
              "Чек по операции",
              `Дата операции ${observedDate.split("-").reverse().join(".")}`,
              "Сумма 1200 ₽",
              "Статус операции Исполнено"
            ].join("\n");
        return { statusCode: 200, data: { result: { textAnnotation: { fullText: text, blocks: [] } } } };
      }
      const format = options && options.data && options.data.text && options.data.text.format;
      if (format && format.name === "receipt_vision_engine_v1") {
        providerCalls.push("openai:vision-engine");
        return openAiResponse({
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
        });
      }
      const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
      if (prompt.includes("строгую классификацию изображения")) {
        dedicatedCalls += 1;
        providerCalls.push("openai:work-photo");
        return openAiResponse({
          is_work_photo: false,
          is_document_or_screen: false,
          is_receipt_or_banking: false,
          has_visible_client: false,
          has_visible_service_area: false,
          kind: "other",
          confidence: 0.2,
          evidence: []
        });
      }
      receiptCalls += 1;
      const focusedPass = prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ") ? "date-focus" : prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА СУММЫ") ? "amount-focus" : "";
      providerCalls.push(focusedPass ? `openai:${focusedPass}` : "openai:primary");
      if (focusedPass) {
        const amount = mode === "unknown" ? null : 1200;
        return openAiResponse({
          date: mode === "unknown" ? null : observedDate,
          time: null,
          amount,
          amount_text: amount === null ? null : "1200 RUB",
          amount_label: amount === null ? null : "amount",
          currency: amount === null ? "unknown" : "RUB",
          confidence: mode === "unknown" ? 0.2 : 0.98,
          ambiguity_reason: mode === "unknown" ? "unreadable" : null
        });
      }
      if (receiptCalls === 1 || mode === "unknown") {
        return openAiResponse({
          is_receipt: false,
          has_readable_text: mode !== "unknown",
          visual_type: "unknown",
          is_mailing_proof: false,
          is_screenshot_of_chat: false,
          date: null,
          amount: null,
          amount_text: null,
          amount_label: null,
          status: "unknown",
          bank: null
        });
      }
      return openAiResponse({
        is_receipt: true,
        has_readable_text: true,
        visual_type: "bank_receipt",
        is_mailing_proof: false,
        is_screenshot_of_chat: false,
        date: observedDate,
        amount: 1200,
        amount_text: "1200 RUB",
        amount_label: "amount",
        status: "success",
        bank: "test-bank"
      });
    }
  };
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
    async removeByAssociation(association) {
      records.delete(associationKey(association));
    },
    async createWithAssociation(value, association) {
      const key = associationKey(association);
      records.set(key, (records.get(key) || []).concat([value]));
      return value;
    }
  };
  const publishedMessages = [];
  const publishedMessageById = new Map();
  const privateNotifications = [];
  const deletedMessages = [];
  const controlUploads = [];
  let latestControlUploadId = "";
  const read = {
    getPersistenceReader() {
      return persistenceReader;
    },
    getUploadReader() {
      return {
        async getBufferById(uploadId) {
          const content = sourceContents.get(uploadId);
          assert.ok(content, `unexpected upload ${uploadId}`);
          return content;
        },
        async getById(uploadId) {
          return uploadId === messageFile.id ? messageFile : undefined;
        }
      };
    },
    getUserReader() {
      return {
        async getByUsername(username) {
          return ({ tars: appUser, teimur, shura, [owner.username]: owner })[username];
        },
        async getById(id) {
          return [appUser, owner, teimur, shura].find((user) => user.id === id);
        },
        async getAppUser() {
          return appUser;
        }
      };
    },
    getRoomReader() {
      return {
        async getByName(name) {
          return name === "cheki-kontrol" ? controlRoom : undefined;
        },
        async getById(id) {
          if (id === personalRoom.id) return personalRoom;
          if (id === controlRoom.id) return controlRoom;
          return undefined;
        },
        async getMembers(roomId) {
          return roomId === controlRoom.id ? [appUser, owner, teimur, shura] : [appUser, owner];
        },
        async getMessages(roomId) {
          if (roomId === controlRoom.id && latestControlUploadId) {
            return [{ id: `control-message-${latestControlUploadId}`, room: controlRoom, file: { _id: latestControlUploadId } }];
          }
          return [];
        }
      };
    },
    getMessageReader() {
      return { async getById() { return undefined; } };
    }
  };
  const creator = {
    getUploadCreator() {
      return {
        async uploadBuffer(_content, options) {
          latestControlUploadId = `control-upload-${controlUploads.length + 1}`;
          controlUploads.push({ room: options.room, user: options.user, filename: options.filename });
          return { id: latestControlUploadId, type: "image/jpeg" };
        }
      };
    },
    getBlockBuilder() {
      return {
        addActionsBlock() {},
        newButtonElement(value) { return value; },
        newPlainTextObject(text) { return { text }; }
      };
    },
    startMessage(initial = {}) {
      const state = { ...initial };
      return {
        setSender(value) { state.sender = value; return this; },
        setRoom(value) { state.room = value; return this; },
        setText(value) { state.text = value; return this; },
        setBlocks(value) { state.blocks = value; return this; },
        setThreadId(value) { state.threadId = value; return this; },
        __state: state
      };
    },
    async finish(builder) {
      const id = `published-${publishedMessages.length + 1}`;
      const published = { id, ...(builder.__state || {}) };
      publishedMessages.push(published);
      publishedMessageById.set(id, published);
      return id;
    }
  };
  const modify = {
    getCreator() {
      return creator;
    },
    getExtender() {
      return {
        async extendRoom() {
          return { addMember() {} };
        },
        async finish() {}
      };
    },
    getDeleter() {
      return {
        async deleteMessage(value) {
          deletedMessages.push(value && value.id || "");
        }
      };
    },
    getNotifier() {
      return {
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
        async notifyUser(user, notification) { privateNotifications.push({ user, notification }); }
      };
    },
    getUpdater() {
      return {
        async message(id) {
          const state = publishedMessageById.get(String(id));
          return {
            getMessage() { return state; },
            setText(value) { if (state) state.text = value; return this; },
            __state: state
          };
        },
        async finish(builder) { return builder && builder.__state && builder.__state.id; }
      };
    }
  };
  const logger = { info() {}, warn() {}, error() {} };
  return {
    config,
    controlRoom,
    controlUploads,
    dedicatedCalls: () => dedicatedCalls,
    deletedMessages,
    http,
    message,
    modify,
    owner,
    persistence,
    privateNotifications,
    providerCalls,
    publishedMessages,
    read,
    receiptCalls: () => receiptCalls,
    records,
    requiredDate,
    sourceContent,
    sourceContents
  };
}

async function receiptIndex(guard, scenario) {
  return guard.readIndex(scenario.read, guard.PROTECTED_ROOMS.kassa.index);
}

(async () => {
  const rejectedGuard = loadTrackedAppWithGuard().__testGuard;
  assert.ok(rejectedGuard && typeof rejectedGuard.processPersonalMediaV2 === "function");

  // A. A financial document rejected by the strict fallback must use the
  // existing rejected receipt route and must never reach the running total.
  const rejected = runtimeScenario(rejectedGuard, "rejected", "date-reject");
  await rejectedGuard.guardUpload({
    file: { ...rejected.message.file, rid: rejected.message.room.id, userId: rejected.owner.id },
    content: rejected.sourceContent
  }, rejected.read, rejected.persistence, rejected.modify, { info() {}, warn() {}, error() {} }, rejected.http, rejected.config);
  let preIndex = await receiptIndex(rejectedGuard, rejected);
  assert.strictEqual(preIndex.photos.length, 0, "personal pre-upload must not make a financial receipt decision");
  assert.strictEqual(rejected.providerCalls.length, 0, "personal pre-upload must not invoke OCR/Vision before the original settles");
  assert.strictEqual(rejected.privateNotifications.length, 0, "private CONTROL actions must wait for the post-message strict decision");
  const rejectedResult = await rejectedGuard.processPersonalMediaV2(
    rejected.message, rejected.read, rejected.persistence, rejected.modify,
    { info() {}, warn() {}, error() {} }, rejected.http, rejected.config
  );
  await rejectedGuard.flushReceiptCaseV1ForTests();
  assert.strictEqual(rejectedResult.handled, true);
  let index = await receiptIndex(rejectedGuard, rejected);
  assert.strictEqual(index.photos.length, 1);
  assert.strictEqual(index.photos[0].source, "rejected");
  assert.match(index.photos[0].invalidReason, /ДАТА ЧЕКА/);
  assert.strictEqual(rejected.controlUploads.length, 0, "date reject must not be copied to cheki-kontrol");
  assert.strictEqual(rejected.privateNotifications.filter((item) => /^👁️ ЧЕК НА КОНТРОЛЬ/.test(String(item.notification.text || ""))).length, 2, "Teimur and Shura must receive one private control action each");
  assert.ok(!rejected.deletedMessages.includes(rejected.message.id), "the disputed original must remain in the master's personal room");
  assert.strictEqual(index.photos.filter((entry) => entry.source === "confirmed").length, 0);
  const rejectedSummary = await rejectedGuard.confirmedTransferSummaryForUser(
    rejected.read, rejected.config, rejected.owner.id, rejected.requiredDate, [], undefined, rejected.message.room.id
  );
  assert.strictEqual(rejectedSummary.count, 0);
  assert.strictEqual(rejectedSummary.total, 0);
  assert.strictEqual(rejected.receiptCalls(), 4, "an inconclusive classifier must preserve the legacy strict primary plus focused checks");
  assert.strictEqual(rejected.dedicatedCalls(), 2);
  const rejectedStatuses = rejected.publishedMessages.filter((item) => item.text === "⚠️ Чек требует проверки");
  assert.strictEqual(rejectedStatuses.length, 1, "rejected receipt must retain one canonical control status");
  assert.strictEqual(rejectedStatuses[0].room.id, rejected.message.room.id, "receipt status must remain in the master's personal room");
  assert.ok(!rejected.deletedMessages.includes(rejectedStatuses[0].id), "canonical receipt status must survive finalization");

  // D. A repeated event for the same rejected message must be idempotent.
  await rejectedGuard.processPersonalMediaV2(
    rejected.message, rejected.read, rejected.persistence, rejected.modify,
    { info() {}, warn() {}, error() {} }, rejected.http, rejected.config
  );
  await rejectedGuard.flushReceiptCaseV1ForTests();
  index = await receiptIndex(rejectedGuard, rejected);
  assert.strictEqual(index.photos.length, 1);
  assert.strictEqual(rejected.controlUploads.length, 0, "the same rejected receipt must not create a control-room copy");
  assert.strictEqual(rejected.privateNotifications.filter((item) => /^👁️ ЧЕК НА КОНТРОЛЬ/.test(String(item.notification.text || ""))).length, 2, "the same rejected receipt must not duplicate private actions");
  assert.strictEqual(rejected.receiptCalls(), 4, "repeat event must not call providers again");
  assert.strictEqual(rejected.publishedMessages.filter((item) => item.text === "⚠️ Чек требует проверки").length, 1, "repeat event must not duplicate the status");

  // Combined integration. The initial classifier remains unknown, then
  // independent Yandex and primary OpenAI agree on the previous date. The
  // early mismatch must retain financial evidence and enter the same existing
  // rejected-control route without focused OpenAI passes.
  const consensusGuard = loadTrackedAppWithGuard().__testGuard;
  const consensus = runtimeScenario(consensusGuard, "rejected-consensus", "consensus-date-reject");
  const consensusResult = await consensusGuard.processPersonalMediaV2(
    consensus.message, consensus.read, consensus.persistence, consensus.modify,
    { info() {}, warn() {}, error() {} }, consensus.http, consensus.config
  );
  assert.strictEqual(consensusResult.handled, true);
  index = await receiptIndex(consensusGuard, consensus);
  assert.strictEqual(index.photos.length, 1);
  assert.strictEqual(index.photos[0].source, "rejected");
  assert.match(index.photos[0].invalidReason, /ДАТА ЧЕКА/);
  assert.strictEqual(index.photos.filter((entry) => entry.source === "confirmed").length, 0);
  assert.strictEqual(consensus.controlUploads.length, 0);
  assert.strictEqual(consensus.privateNotifications.filter((item) => /^👁️ ЧЕК НА КОНТРОЛЬ/.test(String(item.notification.text || ""))).length, 2);
  assert.ok(!consensus.deletedMessages.includes(consensus.message.id), "existing rejected route must retain the source image in the personal chat");
  assert(!consensus.providerCalls.includes("openai:amount-focus"), `unexpected provider calls: ${consensus.providerCalls.join(", ")}`);
  assert(!consensus.providerCalls.includes("openai:date-focus"), `unexpected provider calls: ${consensus.providerCalls.join(", ")}`);
  assert.strictEqual(consensus.receiptCalls(), 2, "inconclusive classifier must not replace the positive primary used by early mismatch");
  const consensusSummary = await consensusGuard.confirmedTransferSummaryForUser(
    consensus.read, consensus.config, consensus.owner.id, consensus.requiredDate, [], undefined, consensus.message.room.id
  );
  assert.strictEqual(consensusSummary.count, 0);
  assert.strictEqual(consensusSummary.total, 0);

  // B. A normal unknown image has no financial evidence and stays outside the
  // rejected receipt index and review room.
  const unknownGuard = loadTrackedAppWithGuard().__testGuard;
  const unknown = runtimeScenario(unknownGuard, "unknown", "ordinary-unknown");
  const unknownResult = await unknownGuard.processPersonalMediaV2(
    unknown.message, unknown.read, unknown.persistence, unknown.modify,
    { info() {}, warn() {}, error() {} }, unknown.http, unknown.config
  );
  assert.strictEqual(unknownResult.handled, false);
  index = await receiptIndex(unknownGuard, unknown);
  assert.strictEqual(index.photos.length, 0);
  assert.strictEqual(unknown.controlUploads.length, 0);
  assert.strictEqual(unknown.publishedMessages.filter((item) => /Проверяем чек|Чек требует проверки|Чек .* принят|Этот чек уже был отправлен|Не удалось завершить проверку/.test(String(item.text || ""))).length, 0, "ordinary unknown images must not publish receipt status");

  // C. A valid receipt through the same fallback keeps the existing accepted
  // index and 1 / 1200 RUB running-total path.
  const acceptedGuard = loadTrackedAppWithGuard().__testGuard;
  const accepted = runtimeScenario(acceptedGuard, "accepted", "valid-fallback");
  const acceptedResult = await acceptedGuard.processPersonalMediaV2(
    accepted.message, accepted.read, accepted.persistence, accepted.modify,
    { info() {}, warn() {}, error() {} }, accepted.http, accepted.config
  );
  await acceptedGuard.flushReceiptCaseV1ForTests();
  assert.strictEqual(acceptedResult.handled, true);
  index = await receiptIndex(acceptedGuard, accepted);
  assert.strictEqual(index.photos.length, 1);
  assert.strictEqual(index.photos[0].source, "confirmed");
  assert.strictEqual(index.photos[0].receiptAmount, 1200);
  assert.strictEqual(accepted.controlUploads.length, 0);
  const summaryMessages = accepted.publishedMessages.map((item) => String(item.text || "").replace(/[\u00a0\u202f]/g, " "));
  assert.ok(summaryMessages.some((text) => /Чеков: 1/.test(text) && /Общая сумма чеков: 1 200 ₽/.test(text)));
  assert.strictEqual(accepted.receiptCalls(), 3, "valid fallback must reuse its strict two-pass result");
  assert.strictEqual(accepted.dedicatedCalls(), 2);
  const acceptedStatuses = accepted.publishedMessages.filter((item) => String(item.text || "").replace(/[\u00a0\u202f]/g, " ") === "✅ Чек 1 200 ₽ принят");
  assert.strictEqual(acceptedStatuses.length, 1, "accepted receipt must retain one canonical accepted status");
  assert.strictEqual(acceptedStatuses[0].room.id, accepted.message.room.id, "accepted status must remain in the master's personal room");
  assert.ok(!accepted.deletedMessages.includes(acceptedStatuses[0].id), "accepted status must survive finalization");
  const acceptedDetails = accepted.publishedMessages.find((item) => /^✅ ЧЕК ПРИНЯТ/.test(String(item.text || "")));
  assert.ok(acceptedDetails, "accepted receipt must publish its result");
  assert.strictEqual(acceptedDetails.threadId, accepted.message.id, "accepted result must be attached to the corresponding receipt image");

  // E. Two distinct uploads with the same strictly extracted stable identity
  // must take the real direct-room identity-duplicate branch.
  const firstConfirmed = index.photos.find((entry) => entry.source === "confirmed");
  assert.ok(firstConfirmed, "first receipt must establish a confirmed identity");
  assert.match(firstConfirmed.receiptIdentity, /^(id:|txn:|text:)/, "first receipt must have a stable production identity");
  const secondContent = Buffer.from("personal-receipt-identity-duplicate-second-bytes");
  const secondFile = { _id: "upload-valid-fallback-identity-second", id: "upload-valid-fallback-identity-second", name: "identity-second.jpg", type: "image/jpeg" };
  const secondMessage = {
    ...accepted.message,
    id: "message-valid-fallback-identity-second",
    file: secondFile,
    files: [secondFile]
  };
  accepted.sourceContents.set(secondFile.id, secondContent);
  const secondResult = await acceptedGuard.processPersonalMediaV2(
    secondMessage, accepted.read, accepted.persistence, accepted.modify,
    { info() {}, warn() {}, error() {} }, accepted.http, accepted.config
  );
  await acceptedGuard.flushReceiptCaseV1ForTests();
  index = await receiptIndex(acceptedGuard, accepted);
  const secondExact = acceptedGuard.exactHash(secondContent);
  const duplicateEntry = index.photos.find((entry) => entry.exact === secondExact);
  assert.strictEqual(secondResult.handled, true, "identity duplicate must be handled by the receipt path");
  assert.ok(duplicateEntry, "second upload must be recorded in the receipt index");
  assert.notStrictEqual(duplicateEntry.exact, firstConfirmed.exact, "identity test uploads must have different exact hashes");
  assert.strictEqual(duplicateEntry.receiptIdentity, firstConfirmed.receiptIdentity, "controlled OCR must build the same stable receipt identity");
  assert.strictEqual(duplicateEntry.source, "duplicate", "M1 oracle: matching stable identity must reject the second receipt");
  assert.strictEqual(index.photos.filter((entry) => entry.source === "confirmed").length, 1, "M1 oracle: identity duplicate must not create a second confirmed receipt");

  console.log("PASS: personal fallback keeps rejected receipts private without affecting unknown images or accepted totals");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
