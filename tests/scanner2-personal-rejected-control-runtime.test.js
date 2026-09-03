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

function runtimeScenario(guard, mode, suffix, options = {}) {
  const consensusMode = mode === "rejected-consensus";
  const records = new Map();
  const sourceContent = Buffer.from(`personal-receipt-control-${mode}-${suffix}`);
  const personalRoom = { id: `personal-${suffix}`, type: "d", slugifiedName: options.unresolvedOwner ? `tars-unresolved-${suffix}` : `tars-master-${suffix}` };
  const controlRoom = { id: "control-room", type: "p", slugifiedName: "cheki-kontrol", displayName: "Контроль чеков" };
  const owner = { id: `owner-${suffix}`, username: `master-${suffix}`, name: `Master ${suffix}` };
  const appUser = { id: "tars-id", username: "tars", name: "TARS" };
  const teimur = { id: "teimur-id", username: "teimur", name: "Teimur" };
  const shura = { id: "shura-id", username: "shura", name: "Shura" };
  const messageFile = { _id: `upload-${suffix}`, id: `upload-${suffix}`, name: `image-${suffix}.jpg`, type: "image/jpeg" };
  const uploader = options.uploader === "teimur" ? teimur : options.uploader === "shura" ? shura : owner;
  const message = {
    id: `message-${suffix}`,
    room: personalRoom,
    sender: uploader,
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
      providerCalls.push(prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ") ? "openai:date-focus" : prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА:") ? "openai:amount-focus" : "openai:primary");
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
          assert.strictEqual(uploadId, messageFile.id);
          return sourceContent;
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
          if (roomId === controlRoom.id) return [appUser, owner, teimur, shura];
          return options.unresolvedOwner ? [appUser, teimur, shura] : [appUser, owner, teimur, shura];
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
          return {
            setSender() { return this; },
            setRoom() { return this; },
            setText() { return this; },
            getMessage() { return {}; }
          };
        },
        async notifyUser() {}
      };
    },
    getUpdater() {
      return {
        async message(id) {
          return { getMessage() { return publishedMessageById.get(String(id)); } };
        }
      };
    }
  };
  const logger = { info() {}, warn() {}, error() {} };
  return {
    appUser,
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
    providerCalls,
    publishedMessages,
    read,
    receiptCalls: () => receiptCalls,
    records,
    requiredDate,
    shura,
    teimur,
    uploader
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
  const rejectedResult = await rejectedGuard.processPersonalMediaV2(
    rejected.message, rejected.read, rejected.persistence, rejected.modify,
    { info() {}, warn() {}, error() {} }, rejected.http, rejected.config
  );
  assert.strictEqual(rejectedResult.handled, true);
  let index = await receiptIndex(rejectedGuard, rejected);
  assert.strictEqual(index.photos.length, 1);
  assert.strictEqual(index.photos[0].source, "rejected");
  assert.match(index.photos[0].invalidReason, /ДАТА ЧЕКА/);
  assert.strictEqual(rejected.controlUploads.length, 1, "date reject must be published once to control");
  assert.strictEqual(rejected.controlUploads[0].room.id, rejected.controlRoom.id);
  assert.strictEqual(index.photos.filter((entry) => entry.source === "confirmed").length, 0);
  const rejectedSummary = await rejectedGuard.confirmedTransferSummaryForUser(
    rejected.read, rejected.config, rejected.owner.id, rejected.requiredDate, [], undefined, rejected.message.room.id
  );
  assert.strictEqual(rejectedSummary.count, 0);
  assert.strictEqual(rejectedSummary.total, 0);
  assert.strictEqual(rejected.receiptCalls(), 4, "an inconclusive classifier must preserve the legacy strict primary plus focused checks");
  assert.strictEqual(rejected.dedicatedCalls(), 2);
  const rejectedStatuses = rejected.publishedMessages.filter((item) => item.text === "⏳ Чек проверяется…");
  assert.strictEqual(rejectedStatuses.length, 1, "rejected receipt must publish one processing status");
  assert.ok(rejected.deletedMessages.includes(rejectedStatuses[0].id), "rejected result must clear its processing status");

  // D. A repeated event for the same rejected message must be idempotent.
  await rejectedGuard.processPersonalMediaV2(
    rejected.message, rejected.read, rejected.persistence, rejected.modify,
    { info() {}, warn() {}, error() {} }, rejected.http, rejected.config
  );
  index = await receiptIndex(rejectedGuard, rejected);
  assert.strictEqual(index.photos.length, 1);
  assert.strictEqual(rejected.controlUploads.length, 1, "the same rejected receipt must not be republished");
  assert.strictEqual(rejected.receiptCalls(), 4, "repeat event must not call providers again");
  assert.strictEqual(rejected.publishedMessages.filter((item) => item.text === "⏳ Чек проверяется…").length, 1, "repeat event must not duplicate the status");

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
  assert.strictEqual(consensus.controlUploads.length, 1);
  assert.strictEqual(consensus.controlUploads[0].room.id, consensus.controlRoom.id);
  assert.ok(consensus.deletedMessages.includes(consensus.message.id), "existing rejected route must preserve source-chat deletion behavior");
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
  assert.strictEqual(unknown.publishedMessages.filter((item) => item.text === "⏳ Чек проверяется…").length, 0, "ordinary unknown images must not publish receipt status");

  // C. A valid receipt through the same fallback keeps the existing accepted
  // index and 1 / 1200 RUB running-total path.
  const acceptedGuard = loadTrackedAppWithGuard().__testGuard;
  const accepted = runtimeScenario(acceptedGuard, "accepted", "valid-fallback");
  const acceptedResult = await acceptedGuard.processPersonalMediaV2(
    accepted.message, accepted.read, accepted.persistence, accepted.modify,
    { info() {}, warn() {}, error() {} }, accepted.http, accepted.config
  );
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
  const acceptedStatuses = accepted.publishedMessages.filter((item) => item.text === "⏳ Чек проверяется…");
  assert.strictEqual(acceptedStatuses.length, 1, "accepted receipt must publish one processing status");
  assert.ok(accepted.deletedMessages.includes(acceptedStatuses[0].id), "accepted result must clear its processing status");

  const assertRejectedOwner = async (uploader, suffix) => {
    const loaded = loadTrackedAppWithGuard();
    const guard = loaded.__testGuard;
    const scenario = runtimeScenario(guard, "rejected", suffix, { uploader });
    const result = await guard.processPersonalMediaV2(
      scenario.message, scenario.read, scenario.persistence, scenario.modify,
      { info() {}, warn() {}, error() {} }, scenario.http, scenario.config
    );
    assert.strictEqual(result.handled, true);
    const ownerIndex = await receiptIndex(guard, scenario);
    assert.strictEqual(ownerIndex.photos.length, 1);
    assert.strictEqual(ownerIndex.photos[0].source, "rejected");
    assert.strictEqual(ownerIndex.photos[0].userId, scenario.owner.id, `${uploader} upload must be indexed for the room owner`);
    assert.strictEqual(ownerIndex.photos[0].username, scenario.owner.username);
    const controlText = scenario.publishedMessages.map((item) => String(item.text || "")).find((text) => text.startsWith("👁️ ЧЕК НА КОНТРОЛЬ"));
    assert.ok(controlText && controlText.includes(`Мастер: @${scenario.owner.username}`), `${uploader} upload must name the room owner in control`);
    if (scenario.uploader.id !== scenario.owner.id) {
      assert.ok(!controlText.includes(`Мастер: @${scenario.uploader.username}`), "control must not name an admin uploader as master");
    }
    assert.ok(scenario.deletedMessages.includes(scenario.message.id), "owner attribution must preserve source-message deletion after the control copy");
  };

  await assertRejectedOwner("teimur", "owner-teimur");
  await assertRejectedOwner("shura", "owner-shura");
  await assertRejectedOwner("owner", "owner-self");

  const unresolvedLoaded = loadTrackedAppWithGuard();
  const unresolvedGuard = unresolvedLoaded.__testGuard;
  const unresolved = runtimeScenario(unresolvedGuard, "rejected", "owner-unresolved", { uploader: "teimur", unresolvedOwner: true });
  await unresolvedGuard.processPersonalMediaV2(
    unresolved.message, unresolved.read, unresolved.persistence, unresolved.modify,
    { info() {}, warn() {}, error() {} }, unresolved.http, unresolved.config
  );
  const unresolvedIndex = await receiptIndex(unresolvedGuard, unresolved);
  assert.strictEqual(unresolvedIndex.photos[0].source, "rejected");
  assert.strictEqual(unresolvedIndex.photos[0].userId, "");
  assert.strictEqual(unresolvedIndex.photos[0].username, "");
  const unresolvedControlText = unresolved.publishedMessages.map((item) => String(item.text || "")).find((text) => text.startsWith("👁️ ЧЕК НА КОНТРОЛЬ"));
  assert.ok(unresolvedControlText && unresolvedControlText.includes("Мастер: мастер"));
  assert.ok(!unresolvedControlText.includes("@teimur"));

  console.log("PASS: personal fallback routes confirmed rejected receipts once to control without affecting unknown images or accepted totals");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
