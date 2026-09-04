"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const root = path.resolve(__dirname, "..");
const fixedNow = Date.parse("2026-09-04T12:00:00+04:00");
const historicalUploadTime = new Date("2026-09-03T18:24:00+04:00");

function engineResult(date, amount, confidence = 0.98) {
  return {
    is_receipt: true,
    bank_or_provider: "test-bank",
    operation_date: date,
    operation_time: "18:24",
    amount,
    currency: "RUB",
    status: "success",
    amount_label: "Сумма операции",
    confidence,
    ambiguity_reason: null
  };
}

function focusedResult(date, amount) {
  return {
    date,
    time: "18:24",
    amount,
    amount_text: `${amount} RUB`,
    amount_label: "Сумма операции",
    currency: "RUB",
    confidence: 0.98,
    ambiguity_reason: null
  };
}

function ocrText(date, amount) {
  return [
    "Банк",
    "Чек по операции",
    `Дата операции ${date.split("-").reverse().join(".")}`,
    `Сумма операции ${amount} ₽`,
    "Статус операции Исполнено"
  ].join("\n");
}

function requestKind(options) {
  const format = options && options.data && options.data.text && options.data.text.format;
  if (format && format.name === "receipt_vision_engine_v1") return "engine";
  const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ")) return "date-focus";
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА СУММЫ")) return "amount-focus";
  return "primary";
}

function configValues() {
  return {
    yandex_ocr_api_key: "private-ocr-key",
    yandex_ocr_folder_id: "test-folder",
    yandex_ai_studio_api_key: "private-studio-key",
    yandex_ai_studio_folder_id: "test-studio-folder",
    yandex_ai_studio_model: "qwen3.6-35b-a3b",
    openai_receipt_api_key: "private-openai-key",
    openai_receipt_model: "gpt-4.1-mini",
    receipt_timezone: "Europe/Samara",
    receipt_workday_cutoff: 0,
    receipt_owner_username: "owner-user",
    receipt_admin_username: "admin-user"
  };
}

function makeRead(values, counters, uploadOverrides = {}) {
  const upload = {
    id: "private-upload-id",
    name: "receipt.jpg",
    type: "image/jpeg",
    size: 31,
    complete: true,
    uploading: false,
    uploadedAt: historicalUploadTime,
    room: { id: "private-room" },
    user: { id: "private-user" },
    ...uploadOverrides
  };
  const settings = configValues();
  return {
    getEnvironmentReader() {
      return {
        getSettings() {
          return {
            async getValueById(id) {
              return Object.prototype.hasOwnProperty.call(settings, id) ? settings[id] : undefined;
            }
          };
        }
      };
    },
    getUploadReader() {
      return {
        async getById() {
          counters.uploadMetadataReads += 1;
          return upload;
        },
        async getBufferById() {
          counters.uploadBufferReads += 1;
          return Buffer.from("canonical-original-receipt-bytes");
        }
      };
    },
    getPersistenceReader() {
      counters.productionWrites += 1;
      throw new Error("replay must never access persistence");
    },
    getNotifier() {
      counters.productionWrites += 1;
      throw new Error("replay must never access notifier");
    },
    getScheduler() {
      counters.productionWrites += 1;
      throw new Error("replay must never access scheduler");
    }
  };
}

function makeCounters() {
  return { uploadMetadataReads: 0, uploadBufferReads: 0, productionWrites: 0, providerCalls: 0 };
}

function makeHttp(scenario, counters) {
  return {
    async post(url, options) {
      counters.providerCalls += 1;
      if (String(url).includes("ocr.api.cloud.yandex.net")) {
        return { statusCode: 200, data: { result: { textAnnotation: { fullText: ocrText(scenario.ocrDate, scenario.ocrAmount), blocks: [] } } } };
      }
      const kind = requestKind(options);
      const result = kind === "engine" ? scenario.engine : kind === "date-focus" ? scenario.dateFocus : kind === "amount-focus" ? scenario.amountFocus : focusedResult(scenario.ocrDate, scenario.ocrAmount);
      return { statusCode: 200, data: { output_text: JSON.stringify(result) } };
    }
  };
}

function makeApp(loaded, logs) {
  const app = Object.create(loaded.TarsReportApp.prototype);
  app.getLogger = () => ({
    info(value) { logs.push(String(value)); },
    warn(value) { logs.push(String(value)); }
  });
  return app;
}

async function invokeReplay(loaded, scenario, sender, uploadOverrides) {
  const counters = makeCounters();
  const logs = [];
  const app = makeApp(loaded, logs);
  const read = makeRead(configValues(), counters, uploadOverrides);
  const result = await app.handleReceiptReplayCommand(read, makeHttp(scenario, counters), sender, ["private-upload-id"]);
  return { result, counters, logs };
}

(async () => {
  const originalNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  Date.now = () => fixedNow;
  global.setTimeout = (resolve) => {
    resolve();
    return 0;
  };
  try {
    const loaded = loadTrackedAppWithGuard();
    const guard = loaded.__testGuard;
    guard.resetReceiptReplayRuntimeForTests();

    const replay = await invokeReplay(loaded, {
      engine: engineResult("2024-09-03", 800),
      ocrDate: "2026-09-03",
      ocrAmount: 800,
      dateFocus: focusedResult("2026-09-03", 800)
    }, { username: "owner-user" });

    assert.strictEqual(replay.result.schema_version, "receipt-replay-v1");
    assert.strictEqual(replay.result.normalized_date, "2026-09-03", "historical upload date must drive replay extraction only");
    assert.strictEqual(replay.result.normalized_amount, 800);
    assert.strictEqual(replay.result.replay_outcome, "fields_resolved");
    assert.strictEqual(replay.result.strict_production_result, "date_mismatch", "historical replay outcome must remain separate from today's strict result");
    assert.strictEqual(replay.result.disagreement.date, true);
    assert.strictEqual(replay.result.selected_authority, "ocr_confirmed");
    assert.strictEqual(replay.result.container_veto_source, "none");
    assert.strictEqual(replay.result.provider, "yandex_ocr");
    assert.strictEqual(replay.result.reason_code, "focused_confirms_ocr");
    assert(replay.result.targeted_pass_result.some((entry) => entry.pass === "date_focus" && entry.date === "2026-09-03"));
    assert.strictEqual(replay.counters.productionWrites, 0, "replay must have zero production state access");
    assert(replay.counters.providerCalls > 0);
    assert.strictEqual(replay.counters.uploadMetadataReads, 1);
    assert.strictEqual(replay.counters.uploadBufferReads, 1);

    const replayLogs = replay.logs.filter((line) => line.startsWith("RECEIPT_REPLAY_V1 "));
    assert.strictEqual(replayLogs.length, 1, "only the privacy-safe final replay record may be logged");
    const logged = JSON.parse(replayLogs[0].slice("RECEIPT_REPLAY_V1 ".length));
    assert.deepStrictEqual(logged, replay.result);
    const serialized = JSON.stringify(logged);
    for (const forbidden of [
      "private-upload-id", "private-room", "private-user", "receipt.jpg", "canonical-original-receipt-bytes",
      "private-ocr-key", "private-studio-key", "private-openai-key", "Чек по операции"
    ]) {
      assert(!serialized.includes(forbidden), `privacy-safe replay output must exclude ${forbidden}`);
    }

    guard.resetReceiptReplayRuntimeForTests();
    const unauthorizedCounters = makeCounters();
    const unauthorizedLogs = [];
    const unauthorizedApp = makeApp(loaded, unauthorizedLogs);
    const unauthorized = await unauthorizedApp.handleReceiptReplayCommand(
      makeRead(configValues(), unauthorizedCounters),
      makeHttp({ engine: engineResult("2026-09-03", 800), ocrDate: "2026-09-03", ocrAmount: 800 }, unauthorizedCounters),
      { username: "ordinary-user" },
      ["private-upload-id"]
    );
    assert.strictEqual(unauthorized.replay_outcome, "forbidden");
    assert.strictEqual(unauthorizedCounters.uploadMetadataReads, 0, "access must be checked before reading upload metadata");
    assert.strictEqual(unauthorizedCounters.uploadBufferReads, 0);
    assert.strictEqual(unauthorizedCounters.providerCalls, 0);

    guard.resetReceiptReplayRuntimeForTests();
    const preview = await invokeReplay(loaded, {
      engine: engineResult("2026-09-03", 800),
      ocrDate: "2026-09-03",
      ocrAmount: 800
    }, { username: "owner-user" }, { name: "thumb-receipt.jpg" });
    assert.strictEqual(preview.result.reason_code, "canonical_original_unresolved");
    assert.strictEqual(preview.counters.uploadBufferReads, 0, "preview must be rejected before bytes are read");
    assert.strictEqual(preview.counters.providerCalls, 0);

    guard.resetReceiptReplayRuntimeForTests();
    const blockingCounters = makeCounters();
    let releaseProvider;
    let providerStarted;
    const providerStartedPromise = new Promise((resolve) => { providerStarted = resolve; });
    const blockingHttp = {
      async post() {
        blockingCounters.providerCalls += 1;
        providerStarted();
        return new Promise((resolve) => { releaseProvider = () => resolve({ statusCode: 200, data: { output_text: JSON.stringify(engineResult("2026-09-03", 800)) } }); });
      }
    };
    const productionPromise = guard.validateReceiptDate(
      { _id: "production-file", name: "production.jpg", type: "image/jpeg" },
      Buffer.from("production-canonical-bytes"),
      blockingHttp,
      { yandexAiStudioApiKey: "key", yandexAiStudioFolderId: "folder", yandexAiStudioModel: "qwen3.6-35b-a3b", timeZone: "Europe/Samara" },
      { info() {}, warn() {} }
    );
    await providerStartedPromise;
    const priorityCounters = makeCounters();
    const blockedByProduction = await guard.runReceiptReplayV1(
      makeRead(configValues(), priorityCounters),
      makeHttp({ engine: engineResult("2026-09-03", 800), ocrDate: "2026-09-03", ocrAmount: 800 }, priorityCounters),
      { timeZone: "Europe/Samara" },
      { authorized: true, uploadId: "private-upload-id" },
      { productionWaitPolls: 0 }
    );
    assert.strictEqual(blockedByProduction.replay_outcome, "busy");
    assert.strictEqual(blockedByProduction.provider_error_code, "production_priority");
    assert.strictEqual(priorityCounters.uploadMetadataReads, 0, "production priority must be decided before upload access");
    releaseProvider();
    await productionPromise;

    guard.resetReceiptReplayRuntimeForTests();
    const deferredProductionCounters = makeCounters();
    let releaseDeferredProduction;
    let deferredProductionStarted;
    const deferredProductionStartedPromise = new Promise((resolve) => { deferredProductionStarted = resolve; });
    const deferredProductionPromise = guard.validateReceiptDate(
      { _id: "deferred-production-file", name: "production.jpg", type: "image/jpeg" },
      Buffer.from("deferred-production-canonical-bytes"),
      {
        async post() {
          deferredProductionStarted();
          return new Promise((resolve) => {
            releaseDeferredProduction = () => resolve({ statusCode: 200, data: { output_text: JSON.stringify(engineResult("2026-09-04", 702)) } });
          });
        }
      },
      { yandexAiStudioApiKey: "key", yandexAiStudioFolderId: "folder", yandexAiStudioModel: "qwen3.6-35b-a3b", timeZone: "Europe/Samara" },
      { info() {}, warn() {} }
    );
    await deferredProductionStartedPromise;
    const deferredReplayPromise = guard.runReceiptReplayV1(
      makeRead(configValues(), deferredProductionCounters),
      makeHttp({ engine: engineResult("2026-09-03", 800), ocrDate: "2026-09-03", ocrAmount: 800 }, deferredProductionCounters),
      {
        apiKey: "private-ocr-key",
        folderId: "test-folder",
        yandexAiStudioApiKey: "private-studio-key",
        yandexAiStudioFolderId: "test-studio-folder",
        yandexAiStudioModel: "qwen3.6-35b-a3b",
        openaiApiKey: "private-openai-key",
        openaiReceiptModel: "gpt-4.1-mini",
        timeZone: "Europe/Samara"
      },
      { authorized: true, uploadId: "private-upload-id" },
      { productionWaitPolls: 8 }
    );
    Promise.resolve().then(releaseDeferredProduction);
    await deferredProductionPromise;
    const deferredReplay = await deferredReplayPromise;
    assert.strictEqual(deferredReplay.replay_outcome, "fields_resolved", "replay must resume after the higher-priority production extraction finishes");
    assert.strictEqual(deferredReplay.provider_error_code, "none");
    assert.strictEqual(deferredReplay.normalized_amount, 800);
    assert.strictEqual(deferredProductionCounters.uploadMetadataReads, 1, "replay must not read the upload until production releases admission");
    assert(deferredProductionCounters.providerCalls > 0);

    guard.resetReceiptReplayRuntimeForTests();
    const overlapCounters = makeCounters();
    let releaseReplayOcr;
    let replayOcrStarted;
    let productionOcrStarted;
    const replayOcrStartedPromise = new Promise((resolve) => { replayOcrStarted = resolve; });
    const productionOcrStartedPromise = new Promise((resolve) => { productionOcrStarted = resolve; });
    const replayOcrHttp = {
      async post() {
        overlapCounters.providerCalls += 1;
        replayOcrStarted();
        return new Promise((resolve) => {
          releaseReplayOcr = () => resolve({ statusCode: 200, data: { result: { textAnnotation: { fullText: ocrText("2026-09-03", 700), blocks: [] } } } });
        });
      }
    };
    const replayWhileIdle = guard.runReceiptReplayV1(
      makeRead(configValues(), overlapCounters),
      replayOcrHttp,
      { apiKey: "ocr-key", folderId: "folder", timeZone: "Europe/Samara" },
      { authorized: true, uploadId: "private-upload-id" }
    );
    await replayOcrStartedPromise;
    const productionWhileReplay = guard.validateReceiptDate(
      { _id: "production-priority-file", name: "production.jpg", type: "image/jpeg" },
      Buffer.from("production-priority-bytes"),
      {
        async post() {
          productionOcrStarted();
          return { statusCode: 200, data: { result: { textAnnotation: { fullText: ocrText("2026-09-04", 701), blocks: [] } } } };
        }
      },
      { apiKey: "ocr-key", folderId: "folder", timeZone: "Europe/Samara" },
      { info() {}, warn() {} }
    );
    await productionOcrStartedPromise;
    releaseReplayOcr();
    const productionWhileReplayResult = await productionWhileReplay;
    await replayWhileIdle;
    assert.strictEqual(productionWhileReplayResult.ok, true, "production extraction must not wait behind the replay OCR queue");
    assert.strictEqual(productionWhileReplayResult.receiptAmount, 701);

    guard.resetReceiptReplayRuntimeForTests();
    const firstRate = await invokeReplay(loaded, {
      engine: engineResult("2026-09-03", 900),
      ocrDate: "2026-09-03",
      ocrAmount: 900
    }, { username: "owner-user" });
    assert.strictEqual(firstRate.result.replay_outcome, "fields_resolved");
    const rateCounters = makeCounters();
    const rateLimited = await guard.runReceiptReplayV1(
      makeRead(configValues(), rateCounters),
      makeHttp({ engine: engineResult("2026-09-03", 900), ocrDate: "2026-09-03", ocrAmount: 900 }, rateCounters),
      { timeZone: "Europe/Samara" },
      { authorized: true, uploadId: "private-upload-id" }
    );
    assert.strictEqual(rateLimited.replay_outcome, "rate_limited");
    assert.strictEqual(rateCounters.uploadMetadataReads, 0);
    assert.strictEqual(rateCounters.providerCalls, 0);

    guard.resetReceiptReplayRuntimeForTests();
    const parityHttp = {
      async post(url) {
        assert(String(url).includes("ocr.api.cloud.yandex.net"));
        return { statusCode: 200, data: { result: { textAnnotation: { fullText: ocrText("2026-09-04", 600), blocks: [] } } } };
      }
    };
    const productionResult = await guard.validateReceiptDate(
      { _id: "parity-file", name: "fixture.jpg", type: "image/jpeg" },
      Buffer.from("safe-production-parity-fixture"),
      parityHttp,
      { apiKey: "ocr-key", folderId: "folder", timeZone: "Europe/Samara" },
      { info() {}, warn() {} }
    );
    assert.deepStrictEqual(productionResult, {
      ok: true,
      receiptDate: "2026-09-04",
      receiptAmount: 600,
      receiptIdentity: "text:2026-09-04|600|c9ffabac",
      receiptWarning: "",
      financialDocumentConfirmed: true,
      shadowEvidence: {
        acceptedDates: ["2026-09-04"],
        legacyOcrResults: [{
          passType: "page",
          date: "2026-09-04",
          amount: { minorUnits: 60000, currency: "RUB" },
          documentType: "OTHER_FINANCIAL_DOCUMENT",
          status: "SUCCESS",
          qualitySignal: 1
        }],
        legacyVisionResults: []
      }
    }, "production extraction without diagnostic context must remain structurally identical");

    const source = fs.readFileSync(path.join(root, "TarsReportApp.js"), "utf8");
    const replayFunction = source.slice(source.indexOf("async function runReceiptReplayV1"), source.indexOf("function resetReceiptReplayRuntimeForTests"));
    for (const forbiddenCall of [
      "validateReceiptStrict(", "writeIndex(", "createReceiptArchive(", "notifyUser(", "getNotifier(", "getPersistenceReader(", "getScheduler("
    ]) {
      assert(!replayFunction.includes(forbiddenCall), `replay execution path must not call ${forbiddenCall}`);
    }
    assert(replayFunction.includes("validateReceiptDate("), "replay must reuse the production extraction function");

    console.log("PASS: Receipt Replay V1 is canonical-only, owner/admin-only, rate-limited, production-priority and zero-write");
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;
  }
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
