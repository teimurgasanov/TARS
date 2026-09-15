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
  const uploadFiles = new Map();
  const roomMessages = [];
  const personalRoom = { id: `personal-${suffix}`, type: "d", slugifiedName: `tars-master-${suffix}` };
  const controlRoom = { id: "control-room", type: "p", slugifiedName: "cheki-kontrol", displayName: "Контроль чеков" };
  const owner = { id: `owner-${suffix}`, username: `master-${suffix}`, name: `Master ${suffix}` };
  const appUser = { id: "tars-id", username: "tars", name: "TARS" };
  const teimur = { id: "teimur-id", username: "teimur", name: "Teimur" };
  const shura = { id: "shura-id", username: "shura", name: "Shura" };
  const messageFile = { _id: `upload-${suffix}`, id: `upload-${suffix}`, name: `image-${suffix}.jpg`, type: "image/jpeg" };
  sourceContents.set(messageFile.id, sourceContent);
  uploadFiles.set(messageFile.id, messageFile);
  const message = {
    id: `message-${suffix}`,
    room: personalRoom,
    sender: owner,
    file: messageFile,
    files: [messageFile],
    text: "",
    createdAt: new Date()
  };
  const messagesById = new Map([[message.id, message]]);
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
    archiveEnabled: false,
    pasAuthorityUrl: "http://127.0.0.1:12345",
    pasAuthorityToken: "synthetic_pas_token_1234567890abcdef"
  };
  const requiredDate = guard.expectedReceiptDate(config);
  const observedDate = mode === "rejected" || consensusMode ? previousCalendarDate(requiredDate) : requiredDate;
  let receiptCalls = 0;
  let dedicatedCalls = 0;
  let yandexCalls = 0;
  let lastRequestedUploadId = messageFile.id;
  const amountOverrides = new Map();
  const providerCalls = [];
  const pasCalls = [];
  let pasOutcome = { status: "CONFIRMED", canonicalPaymentId: `pas-${suffix}`, reasonCode: null };
  const http = {
    async put(url, options) {
      if (String(url).includes("storage.yandexcloud.net")) {
        return { statusCode: 200, content: "" };
      }
      throw new Error(`unexpected PUT ${url}`);
    },
    async post(url, options) {
      if (String(url).includes("127.0.0.1:12345/v1/operation")) {
        const envelope = JSON.parse(String(options && options.content || "{}"));
        pasCalls.push(envelope.payload);
        if (pasOutcome === "malformed") return { statusCode: 200, content: "{}" };
        if (pasOutcome === "unavailable") return { statusCode: 503, content: "" };
        const outcome = pasOutcome.status === "CONFIRMED" ? { ...pasOutcome, canonicalPaymentId: `${pasOutcome.canonicalPaymentId}-${envelope.payload.payment.amount.value.minorUnits}` } : pasOutcome;
        return { statusCode: 200, content: JSON.stringify({ protocol: envelope.protocol, requestId: envelope.requestId, operation: envelope.operation, data: outcome }) };
      }
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
        const amount = mode === "unknown" ? null : (amountOverrides.get(lastRequestedUploadId) || 1200);
        return openAiResponse({
          date: mode === "unknown" ? null : observedDate,
          time: null,
          amount,
          amount_text: amount === null ? null : `${amount} RUB`,
          amount_label: amount === null ? null : "amount",
          currency: amount === null ? "unknown" : "RUB",
          confidence: mode === "unknown" ? 0.2 : 0.98,
          ambiguity_reason: mode === "unknown" ? "unreadable" : null
        });
      }
      if (receiptCalls === 1 && mode !== "repair-accepted" || mode === "unknown") {
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
      const primaryAmount = amountOverrides.get(lastRequestedUploadId) || 1200;
      return openAiResponse({
        is_receipt: true,
        has_readable_text: true,
        visual_type: "bank_receipt",
        is_mailing_proof: false,
        is_screenshot_of_chat: false,
        date: observedDate,
        amount: primaryAmount,
        amount_text: `${primaryAmount} RUB`,
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
          lastRequestedUploadId = uploadId;
          const content = sourceContents.get(uploadId);
          assert.ok(content, `unexpected upload ${uploadId}`);
          return content;
        },
        async getById(uploadId) {
          return uploadFiles.get(uploadId);
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
          if (roomId === personalRoom.id) return roomMessages;
          return [];
        }
      };
    },
    getMessageReader() {
      return { async getById(id) { return messagesById.get(id); } };
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
    amountOverrides,
    config,
    controlRoom,
    controlUploads,
    dedicatedCalls: () => dedicatedCalls,
    deletedMessages,
    http,
    message,
    messagesById,
    modify,
    owner,
    pasCalls,
    setPasOutcome(value) { pasOutcome = value; },
    persistence,
    privateNotifications,
    providerCalls,
    publishedMessages,
    read,
    receiptCalls: () => receiptCalls,
    records,
    roomMessages,
    requiredDate,
    sourceContent,
    sourceContents,
    uploadFiles
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
  assert.strictEqual(rejected.providerCalls.length, 0, "personal pre-upload must not invoke Vision/fallback before the original settles");
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

  // W1 regression: this is the shared rejectDuplicateMessage photo fast path,
  // not a copy of its same-message/same-upload predicate. A normal, already
  // posted direct-room work photo must remain reusable when Rocket.Chat gives
  // us the original message again, or a wrapper with the same upload.
  for (const photoCase of ["same-message", "same-upload"]) {
    const photoGuard = loadTrackedAppWithGuard().__testGuard;
    const photo = runtimeScenario(photoGuard, "unknown", `photo-post-${photoCase}`);
    const photoIndex = { photos: [{
      exact: photoGuard.exactHash(photo.sourceContent),
      visual: photoGuard.visualHash(photo.message.file, photo.sourceContent),
      source: "post",
      messageId: photoCase === "same-message" ? photo.message.id : "earlier-photo-message",
      uploadId: photo.message.file.id,
      roomId: photo.message.room.id,
      userId: photo.owner.id,
      username: photo.owner.username,
      receiptDate: "",
      reportQueuedAt: Date.now()
    }] };
    await photoGuard.writeIndex(photo.persistence, photoGuard.PROTECTED_ROOMS.otchet.index, photoIndex);
    const replay = photoCase === "same-message" ? photo.message : { ...photo.message, id: `photo-wrapper-${photoCase}` };
    const result = await photoGuard.rejectDuplicateMessage(
      replay, photo.read, photo.persistence, photo.modify, { info() {}, warn() {}, error() {} }, photo.http, photo.config, "photo"
    );
    const persisted = await photoGuard.readIndex(photo.read, photoGuard.PROTECTED_ROOMS.otchet.index);
    assert.strictEqual(result, "processed", `photo ${photoCase}: shared duplicate path must accept the original post entry`);
    assert.strictEqual(persisted.photos.length, 1, `photo ${photoCase}: no duplicate photo row`);
    assert.strictEqual(persisted.photos[0].source, "post", `photo ${photoCase}: legacy post source is preserved`);
    assert.strictEqual(photo.deletedMessages.length, 0, `photo ${photoCase}: original photo is not deleted as a duplicate`);
    assert.strictEqual(photo.privateNotifications.length, 0, `photo ${photoCase}: no duplicate-photo notification`);
  }

  // W1 regression: malformed PAS data has no authority. The actual personal
  // receipt route may retain a non-authoritative pre observation, but cannot
  // publish acceptance or include it in the current financial total.
  const malformedGuard = loadTrackedAppWithGuard().__testGuard;
  const malformed = runtimeScenario(malformedGuard, "accepted", "malformed-pas");
  malformed.setPasOutcome("malformed");
  const malformedResult = await malformedGuard.processPersonalMediaV2(
    malformed.message, malformed.read, malformed.persistence, malformed.modify,
    { info() {}, warn() {}, error() {} }, malformed.http, malformed.config, "receipt"
  );
  await malformedGuard.flushReceiptCaseV1ForTests();
  const malformedIndex = await receiptIndex(malformedGuard, malformed);
  const malformedSummary = await malformedGuard.confirmedTransferSummaryForUser(
    malformed.read, malformed.config, malformed.owner.id, malformed.requiredDate, [], undefined, malformed.message.room.id
  );
  assert.strictEqual(malformedResult.handled, true, "malformed PAS response is handled by the real receipt path without acceptance");
  assert.strictEqual(malformed.pasCalls.length, 1, "malformed PAS response reaches the authority seam once");
  assert.strictEqual(malformedIndex.photos.length, 1, "malformed PAS observation is retained for later review/retry");
  assert.notStrictEqual(malformedIndex.photos[0].source, "confirmed", "malformed PAS cannot create confirmed projection");
  assert.strictEqual(malformedSummary.count, 0, "malformed PAS cannot create current confirmed count");
  assert.strictEqual(malformedSummary.total, 0, "malformed PAS cannot create current financial credit");
  assert.ok(!malformed.publishedMessages.some((item) => /✅ Чек|✅ ЧЕК ПРИНЯТ|🧾 ИТОГО/.test(String(item.text || ""))), "malformed PAS cannot publish accepted-success UX");

  // W1 A3: seed the durable archive_failed observation, then replay its real
  // direct-room upload. Object Storage is an existing external boundary stub;
  // PAS is the authority under test. Every non-allowing outcome must leave the
  // repaired archive non-financial and must not produce accepted UI or credit.
  for (const pasCase of [
    ["AUTHORITY_UNAVAILABLE", "unavailable"],
    ["REJECTED", { status: "REJECTED", canonicalPaymentId: null, reasonCode: "SYNTHETIC_REJECT" }],
    ["CONFLICT", { status: "CONFLICT", canonicalPaymentId: null, reasonCode: "SYNTHETIC_CONFLICT" }]
  ]) {
    const [label, outcome] = pasCase;
    const archiveGuard = loadTrackedAppWithGuard().__testGuard;
    // Do not put the literal word "archive" in the direct-room slug: that
    // would deliberately route the synthetic room into the archive-room
    // safety exclusion before the A3 receipt path is reached.
    const archive = runtimeScenario(archiveGuard, "accepted", `a3-${label.toLowerCase()}`);
    archive.config.archiveEnabled = true;
    archive.config.archiveBucket = "synthetic-receipts";
    archive.config.archiveAccessKey = "synthetic-access-key";
    archive.config.archiveSecretKey = "synthetic-secret-key";
    archive.setPasOutcome(outcome);
    const archiveExact = archiveGuard.exactHash(archive.sourceContent);
    const archiveEntry = {
      exact: archiveExact,
      source: "archive_failed",
      archiveStatus: "failed",
      receiptDate: archive.requiredDate,
      receiptAmount: 1200,
      receiptIdentity: `txn:${archive.requiredDate}|12:00|1200`,
      validationVersion: 10,
      messageId: "previous-archive-failed-message",
      uploadId: archive.message.file.id,
      roomId: archive.message.room.id,
      userId: archive.owner.id,
      username: archive.owner.username
    };
    await archiveGuard.writeIndex(archive.persistence, archiveGuard.PROTECTED_ROOMS.kassa.index, { photos: [archiveEntry] });
    const archiveLogs = [];
    const archiveResult = await archiveGuard.processPersonalMediaV2(
      archive.message, archive.read, archive.persistence, archive.modify,
      { info(message) { archiveLogs.push(`INFO ${message}`); }, warn(message) { archiveLogs.push(`WARN ${message}`); }, error(message) { archiveLogs.push(`ERROR ${message}`); } }, archive.http, archive.config, "receipt"
    );
    await archiveGuard.flushReceiptCaseV1ForTests();
    const archiveIndex = await receiptIndex(archiveGuard, archive);
    const archivePersisted = archiveIndex.photos[0];
    const archiveSummary = await archiveGuard.confirmedTransferSummaryForUser(
      archive.read, archive.config, archive.owner.id, archive.requiredDate, [], undefined, archive.message.room.id
    );
    assert.strictEqual(archiveResult.handled, true, `A3 ${label}: archive-failed replay is handled by the real receipt path; logs=${archiveLogs.join(" | ")}`);
    assert.strictEqual(archive.pasCalls.length, 1, `A3 ${label}: repaired observation reaches PAS; logs=${archiveLogs.join(" | ")}`);
    assert.notStrictEqual(archivePersisted.source, "confirmed", `A3 ${label}: non-allowing PAS cannot confirm archive repair`);
    assert.strictEqual(archiveSummary.count, 0, `A3 ${label}: no current confirmed count`);
    assert.strictEqual(archiveSummary.total, 0, `A3 ${label}: no current financial credit`);
    assert.ok(!archive.publishedMessages.some((item) => /✅ Чек|✅ ЧЕК ПРИНЯТ|🧾 ИТОГО/.test(String(item.text || ""))), `A3 ${label}: no accepted-success UX`);
  }

  // W1 housekeeping B1: the ordinary summary-repair path may fill missing
  // receipt metadata, but an existing pre observation has no PAS authority and
  // must stay non-financial. This calls sendTodayTransferSummary(), which calls
  // the production repairTodayReceiptIndex() path.
  const repairGuard = loadTrackedAppWithGuard().__testGuard;
  const repair = runtimeScenario(repairGuard, "accepted", "housekeeping-pre");
  const repairEntry = {
    exact: repairGuard.exactHash(repair.sourceContent),
    source: "pre",
    validationVersion: 2,
    receiptDate: repair.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${repair.requiredDate}|12:00|1200`,
    messageId: repair.message.id,
    uploadId: repair.message.file.id,
    roomId: repair.message.room.id,
    userId: repair.owner.id,
    username: repair.owner.username
  };
  repair.roomMessages.push(repair.message);
  await repairGuard.writeIndex(repair.persistence, repairGuard.PROTECTED_ROOMS.kassa.index, { photos: [repairEntry] });
  await repairGuard.sendTodayTransferSummary(
    { id: "summary-housekeeping-pre", room: repair.message.room, sender: repair.owner, text: "сумма переводов", createdAt: new Date() },
    repair.read, repair.persistence, repair.modify, { info() {}, warn() {}, error() {} }, repair.http, repair.config
  );
  const repairIndex = await receiptIndex(repairGuard, repair);
  const repairSummary = await repairGuard.confirmedTransferSummaryForUser(
    repair.read, repair.config, repair.owner.id, repair.requiredDate, [], undefined, repair.message.room.id
  );
  assert.strictEqual(repairIndex.photos[0].source, "pre", "summary repair cannot promote a pre observation without PAS");
  assert.strictEqual(repair.pasCalls.length, 0, "summary repair has no PAS authority context to promote a pre observation");
  assert.strictEqual(repairSummary.count, 0, "summary repair pre observation cannot enter confirmed count");
  assert.strictEqual(repairSummary.total, 0, "summary repair pre observation cannot create financial credit");

  // W2 F1/F2: an existing legacy observation may receive ordinary room and
  // archive-pending metadata repair, but housekeeping must preserve its source
  // rather than restamping it as financial authority.
  const legacyRepairGuard = loadTrackedAppWithGuard().__testGuard;
  const legacyRepair = runtimeScenario(legacyRepairGuard, "accepted", "summary-legacy-repair");
  const legacyRepairEntry = {
    exact: legacyRepairGuard.exactHash(legacyRepair.sourceContent),
    source: "legacy",
    validationVersion: 2,
    receiptDate: legacyRepair.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${legacyRepair.requiredDate}|12:00|1200`,
    messageId: legacyRepair.message.id,
    uploadId: legacyRepair.message.file.id,
    roomId: "stale-room",
    userId: legacyRepair.owner.id,
    username: legacyRepair.owner.username
  };
  legacyRepair.roomMessages.push(legacyRepair.message);
  await legacyRepairGuard.writeIndex(legacyRepair.persistence, legacyRepairGuard.PROTECTED_ROOMS.kassa.index, { photos: [legacyRepairEntry] });
  const legacyRepairBaseline = await legacyRepairGuard.confirmedTransferSummaryForUser(
    legacyRepair.read, legacyRepair.config, legacyRepair.owner.id, legacyRepair.requiredDate, [], undefined, legacyRepair.message.room.id
  );
  await legacyRepairGuard.sendTodayTransferSummary(
    { id: "summary-legacy-repair", room: legacyRepair.message.room, sender: legacyRepair.owner, text: "сумма переводов", createdAt: new Date() },
    legacyRepair.read, legacyRepair.persistence, legacyRepair.modify, { info() {}, warn() {}, error() {} }, legacyRepair.http, legacyRepair.config
  );
  const legacyRepairIndex = await receiptIndex(legacyRepairGuard, legacyRepair);
  const legacyRepairSummary = await legacyRepairGuard.confirmedTransferSummaryForUser(
    legacyRepair.read, legacyRepair.config, legacyRepair.owner.id, legacyRepair.requiredDate, [], undefined, legacyRepair.message.room.id
  );
  assert.strictEqual(legacyRepairIndex.photos[0].source, "legacy", "metadata/archive-pending repair must preserve a legacy source exactly");
  assert.strictEqual(legacyRepairIndex.photos.length, 1, "metadata/archive-pending repair must not create a duplicate projection");
  assert.strictEqual(legacyRepairIndex.photos[0].roomId, legacyRepair.message.room.id, "legacy metadata repair must retain its baseline room repair");
  assert.strictEqual(legacyRepair.pasCalls.length, 0, "legacy summary housekeeping has no PAS authority");
  assert.strictEqual(legacyRepairSummary.count, legacyRepairBaseline.count, "legacy summary repair cannot increase the pre-existing financial count");
  assert.strictEqual(legacyRepairSummary.total, legacyRepairBaseline.total, "legacy summary repair cannot increase the pre-existing financial credit");
  assert.ok(!legacyRepair.publishedMessages.some((item) => /✅ Чек|✅ ЧЕК ПРИНЯТ/.test(String(item.text || ""))), "legacy summary repair cannot publish accepted-success UX");

  // W2 F3: a fresh date-valid image discovered only by summary repair is an
  // observation for later authority handling, never a confirmed projection.
  const freshRepairGuard = loadTrackedAppWithGuard().__testGuard;
  const freshRepair = runtimeScenario(freshRepairGuard, "repair-accepted", "summary-fresh-observation");
  freshRepair.roomMessages.push(freshRepair.message);
  await freshRepairGuard.sendTodayTransferSummary(
    { id: "summary-fresh-observation", room: freshRepair.message.room, sender: freshRepair.owner, text: "сумма переводов", createdAt: new Date() },
    freshRepair.read, freshRepair.persistence, freshRepair.modify, { info() {}, warn() {}, error() {} }, freshRepair.http, freshRepair.config
  );
  const freshRepairIndex = await receiptIndex(freshRepairGuard, freshRepair);
  const freshRepairSummary = await freshRepairGuard.confirmedTransferSummaryForUser(
    freshRepair.read, freshRepair.config, freshRepair.owner.id, freshRepair.requiredDate, [], undefined, freshRepair.message.room.id
  );
  assert.strictEqual(freshRepair.receiptCalls() > 0, true, "fresh summary observation must reach date validation");
  assert.strictEqual(freshRepairIndex.photos.length, 1, "fresh summary observation is retained");
  assert.strictEqual(freshRepairIndex.photos[0].source, "pre", "fresh summary observation must be non-authoritative pre");
  assert.strictEqual(freshRepair.pasCalls.length, 0, "fresh summary observation has no PAS authority");
  assert.strictEqual(freshRepairSummary.count, 0, "fresh summary observation cannot enter confirmed count");
  assert.strictEqual(freshRepairSummary.total, 0, "fresh summary observation cannot create financial credit");
  assert.ok(!freshRepair.publishedMessages.some((item) => /✅ Чек|✅ ЧЕК ПРИНЯТ/.test(String(item.text || ""))), "fresh summary observation cannot publish accepted-success UX");

  // W2 F3: an existing rejected observation is evidence, not an invitation for
  // the weaker summary validator to rewrite its source.
  const rejectedRepairGuard = loadTrackedAppWithGuard().__testGuard;
  const rejectedRepair = runtimeScenario(rejectedRepairGuard, "repair-accepted", "summary-rejected-observation");
  const rejectedRepairEntry = {
    exact: rejectedRepairGuard.exactHash(rejectedRepair.sourceContent),
    source: "rejected",
    invalidReason: "synthetic prior rejection",
    validationVersion: 2,
    receiptDate: rejectedRepair.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${rejectedRepair.requiredDate}|12:00|1200`,
    messageId: rejectedRepair.message.id,
    uploadId: rejectedRepair.message.file.id,
    roomId: rejectedRepair.message.room.id,
    userId: rejectedRepair.owner.id,
    username: rejectedRepair.owner.username
  };
  rejectedRepair.roomMessages.push(rejectedRepair.message);
  await rejectedRepairGuard.writeIndex(rejectedRepair.persistence, rejectedRepairGuard.PROTECTED_ROOMS.kassa.index, { photos: [rejectedRepairEntry] });
  await rejectedRepairGuard.sendTodayTransferSummary(
    { id: "summary-rejected-observation", room: rejectedRepair.message.room, sender: rejectedRepair.owner, text: "сумма переводов", createdAt: new Date() },
    rejectedRepair.read, rejectedRepair.persistence, rejectedRepair.modify, { info() {}, warn() {}, error() {} }, rejectedRepair.http, rejectedRepair.config
  );
  const rejectedRepairIndex = await receiptIndex(rejectedRepairGuard, rejectedRepair);
  const rejectedRepairSummary = await rejectedRepairGuard.confirmedTransferSummaryForUser(
    rejectedRepair.read, rejectedRepair.config, rejectedRepair.owner.id, rejectedRepair.requiredDate, [], undefined, rejectedRepair.message.room.id
  );
  assert.strictEqual(rejectedRepairIndex.photos[0].source, "rejected", "summary repair must preserve rejected evidence");
  assert.strictEqual(rejectedRepair.pasCalls.length, 0, "rejected summary repair has no PAS authority");
  assert.strictEqual(rejectedRepairSummary.count, 0, "rejected summary repair cannot enter confirmed count");
  assert.strictEqual(rejectedRepairSummary.total, 0, "rejected summary repair cannot create financial credit");

  // W1 repair fallback: archive_failed intentionally misses the summary repair
  // fast gate, so this real sendTodayTransferSummary() scenario must execute
  // fresh receipt validation rather than passing by a skipped OCR path.
  const archiveRepairGuard = loadTrackedAppWithGuard().__testGuard;
  const archiveRepair = runtimeScenario(archiveRepairGuard, "repair-accepted", "summary-archive-failed-ocr");
  const archiveRepairEntry = {
    exact: archiveRepairGuard.exactHash(archiveRepair.sourceContent),
    source: "archive_failed",
    archiveStatus: "failed",
    validationVersion: 10,
    receiptDate: archiveRepair.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${archiveRepair.requiredDate}|12:00|1200`,
    messageId: archiveRepair.message.id,
    uploadId: archiveRepair.message.file.id,
    roomId: archiveRepair.message.room.id,
    userId: archiveRepair.owner.id,
    username: archiveRepair.owner.username
  };
  archiveRepair.roomMessages.push(archiveRepair.message);
  await archiveRepairGuard.writeIndex(archiveRepair.persistence, archiveRepairGuard.PROTECTED_ROOMS.kassa.index, { photos: [archiveRepairEntry] });
  await archiveRepairGuard.sendTodayTransferSummary(
    { id: "summary-archive-failed-ocr", room: archiveRepair.message.room, sender: archiveRepair.owner, text: "сумма переводов", createdAt: new Date() },
    archiveRepair.read, archiveRepair.persistence, archiveRepair.modify, { info() {}, warn() {}, error() {} }, archiveRepair.http, archiveRepair.config
  );
  const archiveRepairIndex = await receiptIndex(archiveRepairGuard, archiveRepair);
  const archiveRepairSummary = await archiveRepairGuard.confirmedTransferSummaryForUser(
    archiveRepair.read, archiveRepair.config, archiveRepair.owner.id, archiveRepair.requiredDate, [], undefined, archiveRepair.message.room.id
  );
  assert.ok(archiveRepair.receiptCalls() > 0, "archive_failed summary repair must reach fresh OCR revalidation");
  assert.strictEqual(archiveRepairIndex.photos[0].source, "archive_failed", "fresh OCR repair cannot confirm archive_failed without PAS");
  assert.strictEqual(archiveRepair.pasCalls.length, 0, "summary OCR repair has no PAS authority context");
  assert.strictEqual(archiveRepairSummary.count, 0, "summary OCR repair cannot create confirmed count");
  assert.strictEqual(archiveRepairSummary.total, 0, "summary OCR repair cannot create financial credit");
  assert.ok(!archiveRepair.publishedMessages.some((item) => /✅ Чек|✅ ЧЕК ПРИНЯТ|🧾 ИТОГО/.test(String(item.text || ""))), "summary OCR repair cannot publish accepted-success UX");

  // W1 housekeeping B2: a successful retention archive is storage evidence,
  // not PAS confirmation. Exercise the exported production cleanup path with
  // an archive_failed receipt and an Object Storage boundary stub.
  const cleanupGuard = loadTrackedAppWithGuard().__testGuard;
  const cleanup = runtimeScenario(cleanupGuard, "accepted", "housekeeping-archive-failed");
  cleanup.config.archiveEnabled = true;
  cleanup.config.archiveBucket = "synthetic-receipts";
  cleanup.config.archiveAccessKey = "synthetic-access-key";
  cleanup.config.archiveSecretKey = "synthetic-secret-key";
  cleanup.message.createdAt = new Date();
  cleanup.messagesById.set(cleanup.message.id, cleanup.message);
  const cleanupEntry = {
    exact: cleanupGuard.exactHash(cleanup.sourceContent),
    source: "archive_failed",
    archiveStatus: "failed",
    archiveDueAt: Date.now() - 1,
    receiptDate: cleanup.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${cleanup.requiredDate}|12:00|1200`,
    validationVersion: 10,
    messageId: cleanup.message.id,
    uploadId: cleanup.message.file.id,
    roomId: cleanup.message.room.id,
    userId: cleanup.owner.id,
    username: cleanup.owner.username
  };
  await cleanupGuard.writeIndex(cleanup.persistence, cleanupGuard.PROTECTED_ROOMS.kassa.index, { photos: [cleanupEntry] });
  await cleanupGuard.cleanupArchivedReceiptMessages(
    cleanup.message.room, cleanup.read, cleanup.persistence, cleanup.modify,
    { info() {}, warn() {}, error() {} }, cleanup.config, cleanup.http
  );
  const cleanupIndex = await receiptIndex(cleanupGuard, cleanup);
  const cleanupSummary = await cleanupGuard.confirmedTransferSummaryForUser(
    cleanup.read, cleanup.config, cleanup.owner.id, cleanup.requiredDate, [], undefined, cleanup.message.room.id
  );
  assert.strictEqual(cleanupIndex.photos[0].archiveStatus, "stored", "cleanup may preserve successful archive metadata");
  assert.strictEqual(cleanupIndex.photos[0].source, "archive_failed", "archive success alone cannot confirm an archive_failed receipt");
  assert.strictEqual(cleanup.pasCalls.length, 0, "archive cleanup has no PAS authority context to promote an archive_failed receipt");
  assert.strictEqual(cleanupSummary.count, 0, "archive cleanup cannot create confirmed count");
  assert.strictEqual(cleanupSummary.total, 0, "archive cleanup cannot create financial credit");
  assert.ok(!cleanup.publishedMessages.some((item) => /✅ Чек|✅ ЧЕК ПРИНЯТ|🧾 ИТОГО/.test(String(item.text || ""))), "archive cleanup cannot publish accepted-success UX");

  // W2 G1: successful storage is allowed to repair archive metadata for a
  // reachable legacy receipt, but cannot reclassify it as confirmed.
  const legacyCleanupGuard = loadTrackedAppWithGuard().__testGuard;
  const legacyCleanup = runtimeScenario(legacyCleanupGuard, "accepted", "housekeeping-legacy-archive");
  legacyCleanup.config.archiveEnabled = true;
  legacyCleanup.config.archiveBucket = "synthetic-receipts";
  legacyCleanup.config.archiveAccessKey = "synthetic-access-key";
  legacyCleanup.config.archiveSecretKey = "synthetic-secret-key";
  legacyCleanup.messagesById.set(legacyCleanup.message.id, legacyCleanup.message);
  const legacyCleanupEntry = {
    exact: legacyCleanupGuard.exactHash(legacyCleanup.sourceContent),
    source: "legacy",
    archiveStatus: "failed",
    archiveDueAt: Date.now() - 1,
    receiptDate: legacyCleanup.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${legacyCleanup.requiredDate}|12:00|1200`,
    validationVersion: 10,
    messageId: legacyCleanup.message.id,
    uploadId: legacyCleanup.message.file.id,
    roomId: legacyCleanup.message.room.id,
    userId: legacyCleanup.owner.id,
    username: legacyCleanup.owner.username
  };
  await legacyCleanupGuard.writeIndex(legacyCleanup.persistence, legacyCleanupGuard.PROTECTED_ROOMS.kassa.index, { photos: [legacyCleanupEntry] });
  const legacyCleanupBaseline = await legacyCleanupGuard.confirmedTransferSummaryForUser(
    legacyCleanup.read, legacyCleanup.config, legacyCleanup.owner.id, legacyCleanup.requiredDate, [], undefined, legacyCleanup.message.room.id
  );
  await legacyCleanupGuard.cleanupArchivedReceiptMessages(
    legacyCleanup.message.room, legacyCleanup.read, legacyCleanup.persistence, legacyCleanup.modify,
    { info() {}, warn() {}, error() {} }, legacyCleanup.config, legacyCleanup.http
  );
  const legacyCleanupIndex = await receiptIndex(legacyCleanupGuard, legacyCleanup);
  const legacyCleanupSummary = await legacyCleanupGuard.confirmedTransferSummaryForUser(
    legacyCleanup.read, legacyCleanup.config, legacyCleanup.owner.id, legacyCleanup.requiredDate, [], undefined, legacyCleanup.message.room.id
  );
  assert.strictEqual(legacyCleanupIndex.photos[0].archiveStatus, "stored", "legacy archive retry may store archive metadata");
  assert.strictEqual(legacyCleanupIndex.photos[0].source, "legacy", "legacy archive retry must preserve source exactly");
  assert.strictEqual(legacyCleanupIndex.photos.length, 1, "legacy archive retry must not create a duplicate projection");
  assert.strictEqual(legacyCleanup.pasCalls.length, 0, "legacy archive cleanup has no PAS authority");
  assert.strictEqual(legacyCleanupSummary.count, legacyCleanupBaseline.count, "legacy archive cleanup cannot increase the pre-existing financial count");
  assert.strictEqual(legacyCleanupSummary.total, legacyCleanupBaseline.total, "legacy archive cleanup cannot increase the pre-existing financial credit");

  // W1 housekeeping B2 backfill: the first entry.messageId loop cannot resolve
  // this receipt. The matching room message is deliberately discoverable only
  // through getMessages() → exactHash() → findExactDuplicate() in the second
  // cleanup backfill loop.
  const backfillGuard = loadTrackedAppWithGuard().__testGuard;
  const backfill = runtimeScenario(backfillGuard, "accepted", "housekeeping-archive-backfill");
  backfill.config.archiveEnabled = true;
  backfill.config.archiveBucket = "synthetic-receipts";
  backfill.config.archiveAccessKey = "synthetic-access-key";
  backfill.config.archiveSecretKey = "synthetic-secret-key";
  const backfillMessage = {
    ...backfill.message,
    id: "room-message-archive-backfill",
    createdAt: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000)
  };
  backfill.roomMessages.push(backfillMessage);
  const backfillEntry = {
    exact: backfillGuard.exactHash(backfill.sourceContent),
    source: "archive_failed",
    archiveStatus: "failed",
    archiveDueAt: Date.now() - 1,
    receiptDate: backfill.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${backfill.requiredDate}|12:00|1200`,
    validationVersion: 10,
    messageId: "missing-first-loop-message",
    uploadId: backfill.message.file.id,
    roomId: backfill.message.room.id,
    userId: backfill.owner.id,
    username: backfill.owner.username
  };
  await backfillGuard.writeIndex(backfill.persistence, backfillGuard.PROTECTED_ROOMS.kassa.index, { photos: [backfillEntry] });
  await backfillGuard.cleanupArchivedReceiptMessages(
    backfill.message.room, backfill.read, backfill.persistence, backfill.modify,
    { info() {}, warn() {}, error() {} }, backfill.config, backfill.http
  );
  const backfillIndex = await receiptIndex(backfillGuard, backfill);
  const backfillSummary = await backfillGuard.confirmedTransferSummaryForUser(
    backfill.read, backfill.config, backfill.owner.id, backfill.requiredDate, [], undefined, backfill.message.room.id
  );
  assert.strictEqual(backfillIndex.photos[0].messageId, backfillMessage.id, "room-message hash backfill must associate the discovered source message");
  assert.strictEqual(backfillIndex.photos[0].archiveStatus, "stored", "backfill loop must complete the archive retry");
  assert.strictEqual(backfillIndex.photos[0].source, "archive_failed", "backfill archive success alone cannot confirm an archive_failed receipt");
  assert.strictEqual(backfill.pasCalls.length, 0, "backfill housekeeping must not contact PAS");
  assert.strictEqual(backfillSummary.count, 0, "backfill archive cleanup cannot create confirmed count");
  assert.strictEqual(backfillSummary.total, 0, "backfill archive cleanup cannot create financial credit");
  assert.ok(!backfill.publishedMessages.some((item) => /✅ Чек|✅ ЧЕК ПРИНЯТ|🧾 ИТОГО/.test(String(item.text || ""))), "backfill archive cleanup cannot publish accepted-success UX");

  // W2 G2: the real room-message/hash backfill may bind a legacy record to its
  // source upload and complete storage, while preserving the legacy source.
  const legacyBackfillGuard = loadTrackedAppWithGuard().__testGuard;
  const legacyBackfill = runtimeScenario(legacyBackfillGuard, "accepted", "housekeeping-legacy-backfill");
  legacyBackfill.config.archiveEnabled = true;
  legacyBackfill.config.archiveBucket = "synthetic-receipts";
  legacyBackfill.config.archiveAccessKey = "synthetic-access-key";
  legacyBackfill.config.archiveSecretKey = "synthetic-secret-key";
  const legacyBackfillMessage = {
    ...legacyBackfill.message,
    id: "room-message-legacy-backfill",
    createdAt: new Date(Date.now() - 61 * 24 * 60 * 60 * 1000)
  };
  legacyBackfill.roomMessages.push(legacyBackfillMessage);
  const legacyBackfillEntry = {
    exact: legacyBackfillGuard.exactHash(legacyBackfill.sourceContent),
    source: "legacy",
    archiveStatus: "failed",
    archiveDueAt: Date.now() - 1,
    receiptDate: legacyBackfill.requiredDate,
    receiptAmount: 1200,
    receiptIdentity: `txn:${legacyBackfill.requiredDate}|12:00|1200`,
    validationVersion: 10,
    messageId: "missing-first-loop-legacy-message",
    uploadId: legacyBackfill.message.file.id,
    roomId: legacyBackfill.message.room.id,
    userId: legacyBackfill.owner.id,
    username: legacyBackfill.owner.username
  };
  await legacyBackfillGuard.writeIndex(legacyBackfill.persistence, legacyBackfillGuard.PROTECTED_ROOMS.kassa.index, { photos: [legacyBackfillEntry] });
  const legacyBackfillBaseline = await legacyBackfillGuard.confirmedTransferSummaryForUser(
    legacyBackfill.read, legacyBackfill.config, legacyBackfill.owner.id, legacyBackfill.requiredDate, [], undefined, legacyBackfill.message.room.id
  );
  await legacyBackfillGuard.cleanupArchivedReceiptMessages(
    legacyBackfill.message.room, legacyBackfill.read, legacyBackfill.persistence, legacyBackfill.modify,
    { info() {}, warn() {}, error() {} }, legacyBackfill.config, legacyBackfill.http
  );
  const legacyBackfillIndex = await receiptIndex(legacyBackfillGuard, legacyBackfill);
  const legacyBackfillSummary = await legacyBackfillGuard.confirmedTransferSummaryForUser(
    legacyBackfill.read, legacyBackfill.config, legacyBackfill.owner.id, legacyBackfill.requiredDate, [], undefined, legacyBackfill.message.room.id
  );
  assert.strictEqual(legacyBackfillIndex.photos[0].messageId, legacyBackfillMessage.id, "legacy hash backfill must bind the discovered source message");
  assert.strictEqual(legacyBackfillIndex.photos[0].archiveStatus, "stored", "legacy hash backfill may complete archive storage");
  assert.strictEqual(legacyBackfillIndex.photos[0].source, "legacy", "legacy hash backfill must preserve source exactly");
  assert.strictEqual(legacyBackfillIndex.photos.length, 1, "legacy hash backfill must not create a duplicate projection");
  assert.strictEqual(legacyBackfill.pasCalls.length, 0, "legacy hash backfill has no PAS authority");
  assert.strictEqual(legacyBackfillSummary.count, legacyBackfillBaseline.count, "legacy hash backfill cannot increase the pre-existing financial count");
  assert.strictEqual(legacyBackfillSummary.total, legacyBackfillBaseline.total, "legacy hash backfill cannot increase the pre-existing financial credit");

  // E. Symmetric three-upload identity registry over the same fallback path.
  // Registry-A is the receipt already confirmed above (1200 RUB). Registry-B
  // is a distinct upload of the SAME payment (same strictly extracted stable
  // identity) and must take the real direct-room identity-duplicate branch
  // without inflating the confirmed running total (M1 oracle: removing
  // duplicate detection lets registry-B through as a second confirmed
  // receipt). Registry-C is a genuinely different, later payment (1300 RUB)
  // and must be independently confirmed and added to the running total
  // (overblock oracle: removing identity equality wrongly rejects registry-C
  // as a duplicate of registry-A).
  const registryA = index.photos.find((entry) => entry.source === "confirmed");
  assert.ok(registryA, "registry-A receipt must establish a confirmed identity");
  assert.match(registryA.receiptIdentity, /^(id:|txn:|text:)/, "registry-A must have a stable production identity");

  // F. Exact-hash M2 oracle. Receipt A2 is a NEW message/upload of the SAME
  // bytes as registry-A. The receipt findExactDuplicate path must reject it
  // before receipt/OCR analysis. Confirmed count/total/identity alone are
  // not sufficient: with exact-hash removed, the later stable-identity
  // guard (registry-B / M1) could still reject A2 and hide the gap.
  //
  // Same-bytes personal re-uploads are intercepted first by findDuplicate on
  // personal-image-duplicate-index-v1 ("ПОВТОР ФОТО/ЧЕКА"). That is a different
  // function than findExactDuplicate, so it cannot kill historical M2. Drop
  // A's personal-image fingerprint and force receipt intent so A2 reaches the
  // kassa exact-hash branch without a new production path.
  const personalImageIndexName = "personal-image-duplicate-index-v1";
  const personalImageIndex = await acceptedGuard.readIndex(accepted.read, personalImageIndexName);
  personalImageIndex.photos = (personalImageIndex.photos || []).filter((entry) => {
    if (!entry) return false;
    if (entry.exact && entry.exact === registryA.exact) return false;
    if (registryA.visual && entry.visual && entry.visual === registryA.visual) return false;
    return true;
  });
  await acceptedGuard.writeIndex(accepted.persistence, personalImageIndexName, personalImageIndex);

  const registryA2Content = Buffer.from(accepted.sourceContent);
  const registryA2File = {
    _id: "upload-valid-fallback-exact-repeat",
    id: "upload-valid-fallback-exact-repeat",
    name: "exact-repeat.jpg",
    type: "image/jpeg"
  };
  const registryA2Message = {
    ...accepted.message,
    id: "message-valid-fallback-exact-repeat",
    file: registryA2File,
    files: [registryA2File]
  };
  accepted.sourceContents.set(registryA2File.id, registryA2Content);
  accepted.uploadFiles.set(registryA2File.id, registryA2File);
  function receiptAnalysisCalls(calls) {
    return calls.filter((call) => /^(openai:primary|openai:date-focus|openai:amount-focus|openai:vision-engine|yandex:)/.test(call));
  }
  const beforeA2ReceiptCalls = accepted.receiptCalls();
  const beforeA2ReceiptProviderCalls = receiptAnalysisCalls(accepted.providerCalls).length;
  const beforeA2Confirmed = index.photos.filter((entry) => entry.source === "confirmed").length;
  const beforeA2Summary = await acceptedGuard.confirmedTransferSummaryForUser(
    accepted.read, accepted.config, accepted.owner.id, accepted.requiredDate, [], undefined, accepted.message.room.id
  );
  const registryA2Exact = acceptedGuard.exactHash(registryA2Content);
  assert.strictEqual(registryA2Exact, registryA.exact, "M2 oracle: A2 must have the same exact hash as A");
  assert.notStrictEqual(registryA2Message.id, accepted.message.id, "M2 oracle: A2 must use a new messageId");
  assert.notStrictEqual(registryA2File.id, String(accepted.message.file.id || accepted.message.file._id || ""), "M2 oracle: A2 must use a new uploadId");
  const a2Logs = [];
  const a2Logger = {
    info(message) { a2Logs.push(String(message || "")); },
    warn(message) { a2Logs.push(String(message || "")); },
    error(message) { a2Logs.push(String(message || "")); }
  };
  const registryA2Result = await acceptedGuard.processPersonalMediaV2(
    registryA2Message, accepted.read, accepted.persistence, accepted.modify,
    a2Logger, accepted.http, accepted.config, "receipt"
  );
  await acceptedGuard.flushReceiptCaseV1ForTests();
  index = await receiptIndex(acceptedGuard, accepted);
  assert.strictEqual(registryA2Result.handled, true, "M2 oracle: same-bytes repeat must be handled by the receipt path");
  assert.ok(
    a2Logs.some((line) => /Deleted posted exact duplicate receipt/.test(line)),
    "M2 oracle: A2 must take the posted exact-duplicate path"
  );
  assert.ok(
    !a2Logs.some((line) => /stage=strict_validation_done/.test(line)),
    "M2 oracle: exact-hash duplicate must not enter strict receipt/OCR validation"
  );
  assert.strictEqual(accepted.receiptCalls(), beforeA2ReceiptCalls, "M2 oracle: exact-hash duplicate must not re-invoke receipt/OCR analysis");
  assert.strictEqual(
    receiptAnalysisCalls(accepted.providerCalls).length,
    beforeA2ReceiptProviderCalls,
    "M2 oracle: exact-hash duplicate must not invoke receipt providers again"
  );
  assert.strictEqual(
    index.photos.find((entry) => String(entry.uploadId || "") === registryA2File.id),
    undefined,
    "M2 oracle: exact-hash path must not write a new index row for A2"
  );
  assert.strictEqual(
    index.photos.filter((entry) => entry.source === "confirmed").length,
    beforeA2Confirmed,
    "M2 oracle: A2 must not create a second confirmed receipt"
  );
  const afterA2Summary = await acceptedGuard.confirmedTransferSummaryForUser(
    accepted.read, accepted.config, accepted.owner.id, accepted.requiredDate, [], undefined, accepted.message.room.id
  );
  assert.strictEqual(afterA2Summary.count, beforeA2Summary.count, "M2 oracle (financial invariant): A2 must not increase confirmed count");
  assert.strictEqual(afterA2Summary.total, beforeA2Summary.total, "M2 oracle (financial invariant): A2 must not inflate the running total");
  assert.ok(
    accepted.privateNotifications.some((item) => String(item.notification && item.notification.text || "") === "🚫 ПОВТОР ЧЕКА"),
    "M2 oracle: exact duplicate must use the existing duplicate notification"
  );
  assert.ok(
    accepted.deletedMessages.includes(registryA2Message.id),
    "M2 oracle: posted exact-duplicate receipt must be deleted"
  );

  // Registry-B: same payment (1200 RUB), same strictly-extracted identity.
  const registryBContent = Buffer.from("personal-receipt-identity-duplicate-second-bytes");
  const registryBFile = { _id: "upload-valid-fallback-identity-second", id: "upload-valid-fallback-identity-second", name: "identity-second.jpg", type: "image/jpeg" };
  const registryBMessage = {
    ...accepted.message,
    id: "message-valid-fallback-identity-second",
    file: registryBFile,
    files: [registryBFile]
  };
  accepted.sourceContents.set(registryBFile.id, registryBContent);
  accepted.uploadFiles.set(registryBFile.id, registryBFile);
  const registryBResult = await acceptedGuard.processPersonalMediaV2(
    registryBMessage, accepted.read, accepted.persistence, accepted.modify,
    { info() {}, warn() {}, error() {} }, accepted.http, accepted.config
  );
  await acceptedGuard.flushReceiptCaseV1ForTests();
  index = await receiptIndex(acceptedGuard, accepted);
  const registryBExact = acceptedGuard.exactHash(registryBContent);
  const registryBEntry = index.photos.find((entry) => entry.exact === registryBExact);
  assert.strictEqual(registryBResult.handled, true, "registry-B identity duplicate must be handled by the receipt path");
  assert.ok(registryBEntry, "registry-B upload must be recorded in the receipt index");
  assert.notStrictEqual(registryBEntry.exact, registryA.exact, "registry-A/B uploads must have different exact hashes");
  assert.strictEqual(registryBEntry.receiptIdentity, registryA.receiptIdentity, "controlled Vision/fallback must build the same stable receipt identity for registry-B");
  assert.strictEqual(registryBEntry.source, "duplicate", "M1 oracle: matching stable identity must reject registry-B");
  assert.strictEqual(index.photos.filter((entry) => entry.source === "confirmed").length, 1, "M1 oracle: registry-B identity duplicate must not create a second confirmed receipt");
  const afterBSummary = await acceptedGuard.confirmedTransferSummaryForUser(
    accepted.read, accepted.config, accepted.owner.id, accepted.requiredDate, [], undefined, accepted.message.room.id
  );
  assert.strictEqual(afterBSummary.count, 1, "M1 oracle (financial invariant): registry-B must not be counted in the running total");
  assert.strictEqual(afterBSummary.total, 1200, "M1 oracle (financial invariant): registry-B must not inflate the running total");

  // Registry-C: a genuinely different, later payment (1300 RUB instead of
  // 1200 RUB) -> a genuinely different production-built stable identity.
  const registryCContent = Buffer.from("personal-receipt-identity-distinct-third-bytes");
  const registryCFile = { _id: "upload-valid-fallback-identity-third", id: "upload-valid-fallback-identity-third", name: "identity-third.jpg", type: "image/jpeg" };
  accepted.amountOverrides.set(registryCFile.id, 1300);
  const registryCMessage = {
    ...accepted.message,
    id: "message-valid-fallback-identity-third",
    file: registryCFile,
    files: [registryCFile]
  };
  accepted.sourceContents.set(registryCFile.id, registryCContent);
  accepted.uploadFiles.set(registryCFile.id, registryCFile);
  const registryCResult = await acceptedGuard.processPersonalMediaV2(
    registryCMessage, accepted.read, accepted.persistence, accepted.modify,
    { info() {}, warn() {}, error() {} }, accepted.http, accepted.config
  );
  await acceptedGuard.flushReceiptCaseV1ForTests();
  index = await receiptIndex(acceptedGuard, accepted);
  const registryCExact = acceptedGuard.exactHash(registryCContent);
  const registryCEntry = index.photos.find((entry) => entry.exact === registryCExact);
  assert.strictEqual(registryCResult.handled, true, "registry-C distinct payment must be handled by the receipt path");
  assert.ok(registryCEntry, "registry-C upload must be recorded in the receipt index");
  assert.strictEqual(registryCEntry.receiptAmount, 1300, "registry-C must be recognized as its own 1300 RUB payment");
  assert.match(registryCEntry.receiptIdentity, /^(id:|txn:|text:)/, "registry-C must have a stable production identity");
  assert.notStrictEqual(registryCEntry.receiptIdentity, registryA.receiptIdentity, "overblock oracle: a different payment must build a genuinely different stable identity");
  assert.strictEqual(registryCEntry.source, "confirmed", "overblock oracle: a genuinely different stable identity must not be rejected as a duplicate");
  assert.strictEqual(index.photos.filter((entry) => entry.source === "confirmed").length, 2, "overblock oracle: registry-C must be a second confirmed receipt");
  const afterCSummary = await acceptedGuard.confirmedTransferSummaryForUser(
    accepted.read, accepted.config, accepted.owner.id, accepted.requiredDate, [], undefined, accepted.message.room.id
  );
  assert.strictEqual(afterCSummary.count, 2, "overblock oracle (financial invariant): registry-C must be counted in the running total");
  assert.strictEqual(afterCSummary.total, 2500, "overblock oracle (financial invariant): registry-C must add its own 1300 RUB to the running total");

  console.log("PASS: personal fallback keeps rejected receipts private without affecting unknown images or accepted totals");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
