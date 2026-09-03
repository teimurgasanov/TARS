"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const requiredDate = "2026-09-02";
const fixedNow = Date.parse("2026-09-02T18:00:00+04:00");

function engineResult(amount, overrides = {}) {
  return {
    is_receipt: true,
    bank_or_provider: "test-bank",
    operation_date: requiredDate,
    operation_time: "17:14",
    amount,
    currency: "RUB",
    status: "success",
    amount_label: "Сумма операции",
    confidence: 0.98,
    ambiguity_reason: null,
    ...overrides
  };
}

function legacyReceipt(amount, overrides = {}) {
  return {
    is_receipt: true,
    visual_type: "bank_receipt",
    is_mailing_proof: false,
    is_screenshot_of_chat: false,
    date: requiredDate,
    amount,
    amount_text: `${amount} RUB`,
    amount_label: "Сумма операции",
    status: "success",
    bank: "test-bank",
    ...overrides
  };
}

function yandexText(amount, extraText = "") {
  return [
    "Банк",
    "Чек по операции",
    "Дата операции 02.09.2026",
    `Сумма операции ${amount} ₽`,
    extraText,
    "Статус операции Исполнено"
  ].filter(Boolean).join("\n");
}

function requestKind(options) {
  const format = options && options.data && options.data.text && options.data.text.format;
  if (format && format.name === "receipt_vision_engine_v1") return "vision-engine";
  const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ")) return "date-focus";
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА:")) return "amount-focus";
  return "legacy-primary";
}

function provider(scenario, calls, engineRequests) {
  return {
    async post(url, options) {
      if (String(url).includes("ocr.api.cloud.yandex.net")) {
        calls.push(`yandex:${String(options.data.model)}`);
        return {
          statusCode: 200,
          data: { result: { textAnnotation: { fullText: scenario.ocrText || yandexText(scenario.ocrAmount), blocks: [] } } }
        };
      }
      assert(String(url).includes("api.openai.com") || String(url).includes("ai.api.cloud.yandex.net"), `unexpected provider URL: ${url}`);
      const kind = requestKind(options);
      calls.push(kind);
      if (kind === "vision-engine") {
        engineRequests.push(options.data);
        if (String(url).includes("ai.api.cloud.yandex.net") && scenario.yandexStudioFailure) {
          return { statusCode: scenario.yandexStudioFailure, data: {} };
        }
        if (scenario.visionFailure === "timeout") throw new Error("request timeout");
        if ([401, 403, 429, 500, 503].includes(scenario.visionFailure)) return { statusCode: scenario.visionFailure, data: {} };
        if (scenario.visionFailure === "invalid-json") return { statusCode: 200, data: { output_text: "not-json" } };
        if (scenario.visionFailure === "schema-mismatch") return { statusCode: 200, data: { output_text: JSON.stringify({ amount: scenario.ocrAmount }) } };
        return { statusCode: 200, data: { output_text: JSON.stringify(scenario.vision) } };
      }
      return { statusCode: 200, data: { output_text: JSON.stringify(legacyReceipt(scenario.ocrAmount)) } };
    }
  };
}

async function run(label, scenario) {
  const guard = loadTrackedAppWithGuard().__testGuard;
  const calls = [];
  const logs = [];
  const engineRequests = [];
  const originalNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  Date.now = () => fixedNow;
  global.setTimeout = (resolve) => {
    resolve();
    return 0;
  };
  try {
    const config = {
      apiKey: scenario.noYandex ? "" : "test-yandex-key",
      folderId: scenario.noYandex ? "" : "test-folder",
      openaiApiKey: "test-openai-key",
      openaiReceiptModel: "gpt-4.1-mini",
      yandexAiStudioApiKey: scenario.yandexStudio ? "test-yandex-studio-key" : "",
      yandexAiStudioFolderId: scenario.yandexStudio ? "testfolder" : "",
      yandexAiStudioModel: scenario.yandexStudio ? "qwen3.6-35b-a3b" : "",
      timeZone: "Europe/Samara"
    };
    const result = await guard.validateReceiptDate(
      { _id: `receipt-vision-engine-${label}`, name: `${label}.jpg`, type: "image/jpeg" },
      Buffer.from(`receipt-vision-engine-${label}`),
      provider(scenario, calls, engineRequests),
      config,
      { info(value) { logs.push(String(value)); }, warn(value) { logs.push(String(value)); } }
    );
    return { result, calls, logs, engineRequests };
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;
  }
}

function assertVisionAuthority(runResult, expectedAmount, label) {
  assert.strictEqual(runResult.result.ok, true, `${label}: receipt must be accepted`);
  assert.strictEqual(runResult.result.receiptDate, requiredDate, `${label}: Vision date must be authoritative`);
  assert.match(runResult.result.receiptTime, /^\d{2}:\d{2}(?::\d{2})?$/, `${label}: Vision time must be authoritative`);
  assert.strictEqual(runResult.result.receiptAmount, expectedAmount, `${label}: Vision total must be authoritative`);
  assert.strictEqual(runResult.calls[0], "vision-engine", `${label}: semantic Vision must run first`);
  assert.strictEqual(runResult.calls.filter((call) => call === "vision-engine").length, 1, `${label}: the image must receive one semantic Vision request`);
  assert(runResult.calls.slice(1).every((call) => call.startsWith("yandex:")), `${label}: only passive Yandex verification may follow authoritative Vision`);
  assert(!runResult.calls.includes("legacy-primary") && !runResult.calls.includes("amount-focus") && !runResult.calls.includes("date-focus"), `${label}: legacy OpenAI must not overwrite authoritative Vision`);
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert.strictEqual(guard.RECEIPT_VISION_ENGINE_MIN_CONFIDENCE, 0.9);
  assert.strictEqual(guard.RECEIPT_VISION_ENGINE_SCHEMA.additionalProperties, false);
  assert.deepStrictEqual(guard.RECEIPT_VISION_ENGINE_SCHEMA.properties.currency.enum, ["RUB", "unknown"]);

  const parsed = guard.parseReceiptVisionEngineV1(engineResult(900));
  assert.deepStrictEqual(parsed, {
    isReceipt: true,
    bankOrProvider: "test-bank",
    operationDate: requiredDate,
    operationTime: "17:14",
    amount: 900,
    currency: "RUB",
    status: "success",
    amountLabel: "Сумма операции",
    confidence: 0.98,
    ambiguityReason: undefined
  });
  assert.strictEqual(guard.receiptVisionEngineIsAuthoritative(parsed), true);
  const nonReceipt = guard.parseReceiptVisionEngineV1(engineResult(null, {
    is_receipt: false,
    bank_or_provider: null,
    operation_date: null,
    operation_time: null,
    currency: "unknown",
    status: "unknown",
    amount_label: null,
    confidence: 0.98
  }));
  assert.strictEqual(guard.receiptVisionEngineIsAuthoritativeNonReceipt(nonReceipt), true, "coherent high-confidence non-receipt classification must also be authoritative");
  assert.strictEqual(guard.parseReceiptVisionEngineV1({ ...engineResult(900), extra: true }), undefined, "unexpected fields must invalidate the structured response");
  assert.strictEqual(guard.parseReceiptVisionEngineV1({ ...engineResult(900), operation_date: "2026-02-30" }), undefined, "impossible dates must be invalid");
  assert.strictEqual(guard.parseReceiptVisionEngineV1({ ...engineResult(900), operation_time: "25:61" }), undefined, "impossible times must be invalid");
  assert.strictEqual(guard.parseReceiptVisionEngineV1({ ...engineResult(900), confidence: 1.01 }), undefined, "confidence above one must be invalid");

  const a = await run("vtb-900", { vision: engineResult(900), ocrAmount: 900 });
  assertVisionAuthority(a, 900, "A");
  assert.strictEqual(a.engineRequests[0].store, false);
  assert.deepStrictEqual(a.engineRequests[0].reasoning, { effort: "none" });
  assert.strictEqual(a.engineRequests[0].text.format.type, "json_schema");
  assert.strictEqual(a.engineRequests[0].text.format.strict, true);
  assert.strictEqual(a.engineRequests[0].input[0].content[1].type, "input_image");
  assert.strictEqual(a.engineRequests[0].input[0].content[1].detail, "high");

  const b = await run("alfa-1000", { vision: engineResult(1000, { operation_time: "16:19:22", amount_label: "Сумма перевода" }), ocrAmount: 1000 });
  assertVisionAuthority(b, 1000, "B");

  const c = await run("sber-1300", { vision: engineResult(1300, { operation_time: "11:00", amount_label: "Итого" }), ocrAmount: 1300 });
  assertVisionAuthority(c, 1300, "C");

  const yandexStudio = await run("yandex-studio-1300", {
    vision: engineResult(1300, { operation_time: "11:00", amount_label: "Итого" }),
    ocrAmount: 1,
    yandexStudio: true
  });
  assertVisionAuthority(yandexStudio, 1300, "Yandex AI Studio");
  assert.match(yandexStudio.engineRequests[0].model, /^gpt:\/\/testfolder\/qwen3\.6-35b-a3b\/latest$/);
  assert.strictEqual(yandexStudio.engineRequests[0].max_output_tokens, 4096, "Yandex reasoning output must have enough room for strict JSON");
  assert.strictEqual(yandexStudio.engineRequests[0].input[0].content[1].detail, undefined, "Yandex input_image must not receive OpenAI-only detail");

  const yandexStudioFallback = await run("yandex-studio-fallback", {
    vision: engineResult(1300, { operation_time: "11:00", amount_label: "Итого" }),
    ocrAmount: 1,
    yandexStudio: true,
    yandexStudioFailure: 503
  });
  assert.strictEqual(yandexStudioFallback.result.ok, true, "Yandex AI Studio failure must fall back to OpenAI Vision");
  assert.strictEqual(yandexStudioFallback.result.receiptAmount, 1300);
  assert.strictEqual(yandexStudioFallback.calls.filter((call) => call === "vision-engine").length, 3, "Yandex must retry once before one OpenAI fallback");
  assert.match(yandexStudioFallback.engineRequests[0].model, /^gpt:\/\//);
  assert.match(yandexStudioFallback.engineRequests[1].model, /^gpt:\/\//);
  assert.strictEqual(yandexStudioFallback.engineRequests[2].model, "gpt-4.1-mini");

  const d = await run("ocr-7", { vision: engineResult(1000, { amount_label: "Сумма платежа" }), ocrAmount: 7 });
  assertVisionAuthority(d, 1000, "D");
  assert(d.logs.some((line) => /RECEIPT_VISION_ENGINE_V1 authority=high .*amount_disagreement=true/.test(line)), "D: conflict must be telemetry-only");

  const e = await run("ocr-1", { vision: engineResult(1300, { amount_label: "Сумма списания" }), ocrAmount: 1 });
  assertVisionAuthority(e, 1300, "E");

  const f = await run("ocr-0", { vision: engineResult(900), ocrAmount: 0 });
  assert.strictEqual(f.result.ok, true, "F: Vision must supply a valid amount when OCR returns zero");
  assert.strictEqual(f.result.receiptAmount, 900);
  assert.strictEqual(f.calls.filter((call) => call === "vision-engine").length, 1);
  assert(!f.calls.includes("legacy-primary") && !f.calls.includes("amount-focus") && !f.calls.includes("date-focus"));

  const rejectedNonReceipt = await run("not-receipt", { vision: engineResult(null, {
    is_receipt: false,
    bank_or_provider: null,
    operation_date: null,
    operation_time: null,
    currency: "unknown",
    status: "unknown",
    amount_label: null,
    confidence: 0.98
  }), ocrAmount: 900 });
  assert.strictEqual(rejectedNonReceipt.result.ok, false);
  assert.match(rejectedNonReceipt.result.reason, /Vision не подтвердил финансовый документ/);
  assert.deepStrictEqual(rejectedNonReceipt.calls, ["vision-engine"], "authoritative non-receipt classification must not be overwritten by OCR");

  const failedReceipt = await run("failed-receipt", { vision: engineResult(900, { status: "failed" }), ocrAmount: 900 });
  assert.strictEqual(failedReceipt.result.ok, false, "a high-confidence failed operation must never be accepted");
  assert.match(failedReceipt.result.reason, /НЕ ПРОШЁЛ ПРОВЕРКУ/);
  assert.strictEqual(failedReceipt.result.receiptDate, requiredDate);
  assert.strictEqual(failedReceipt.result.receiptTime, "17:14");
  assert.strictEqual(failedReceipt.result.receiptAmount, 900);

  const adversarial = [
    ["phone-digits", 1300, 7, "Сумма операции", "Телефон +7 900 1000 000"],
    ["zero-commission", 1000, 0, "Сумма перевода", "Комиссия 0 ₽"],
    ["long-operation-id", 900, 1234567890, "Сумма платежа", "Номер операции 1234567890"],
    ["card-last-four", 1500, 1300, "Итого", "Карта *1300"],
    ["time-20-00", 2000, 20, "К оплате", "Время 20:00"],
    ["date-contains-07", 700, 7, "Сумма операции", "Дата 07.09.2026"],
    ["multiple-money-fields", 1000, 50, "Итого", "Комиссия 50 ₽ Баланс 12500 ₽"],
    ["second-phone-screen", 1300, 1, "Сумма операции", "Чек открыт на экране второго телефона"],
    ["angled", 900, 1, "Сумма операции", "Фото под углом"],
    ["glare", 1000, 1, "Сумма перевода", "Блики"],
    ["small-text", 1300, 300, "Сумма платежа", "Мелкий текст"],
    ["rotated", 700, 7, "Итого", "Чек повёрнут на 90 градусов"]
  ];
  for (const [label, expectedAmount, ocrAmount, amountLabel, extraText] of adversarial) {
    const outcome = await run(label, {
      vision: engineResult(expectedAmount, { amount_label: amountLabel }),
      ocrAmount,
      ocrText: yandexText(ocrAmount, extraText)
    });
    assertVisionAuthority(outcome, expectedAmount, `adversarial:${label}`);
  }

  for (const unsafe of [
    engineResult(1300, { amount_label: "Последние 4 цифры карты" }),
    engineResult(50, { amount_label: "Комиссия" }),
    engineResult(12500, { amount_label: "Баланс" }),
    engineResult(20, { amount_label: "Время" }),
    engineResult(1300, { ambiguity_reason: "Несколько возможных сумм" }),
    engineResult(1300, { confidence: 0.89 })
  ]) {
    assert.strictEqual(guard.receiptVisionEngineIsAuthoritative(guard.parseReceiptVisionEngineV1(unsafe)), false, "unsafe or ambiguous semantic amount must never become authoritative");
  }

  for (const failure of ["timeout", 401, 403, 429, 500, 503, "invalid-json", "schema-mismatch"]) {
    const fallback = await run(`fallback-${failure}`, {
      vision: engineResult(900),
      visionFailure: failure,
      ocrAmount: 700,
      noYandex: true
    });
    assert.strictEqual(fallback.result.ok, true, `${failure}: old receipt path must remain available`);
    assert.strictEqual(fallback.result.receiptAmount, 700, `${failure}: old path must remain authoritative after Vision failure`);
    assert(fallback.calls.includes("legacy-primary") && fallback.calls.includes("amount-focus"), `${failure}: existing OpenAI fallback must run`);
    const expectedAttempts = [401, 403, "invalid-json", "schema-mismatch"].includes(failure) ? 1 : 2;
    assert.strictEqual(fallback.calls.filter((call) => call === "vision-engine").length, expectedAttempts, `${failure}: retry policy must remain bounded`);
  }

  const prompt = a.engineRequests[0].input[0].content[0].text;
  for (const requiredPhrase of ["комиссию", "баланс", "телефон", "номер карты", "последние четыре цифры", "номер операции", "QR/СБП", "время", "дату", "второго телефона", "поворот", "блики", "мелкий текст"]) {
    assert(prompt.includes(requiredPhrase), `semantic prompt must guard against: ${requiredPhrase}`);
  }

  console.log("PASS: Receipt Vision Engine V1 owns coherent high-confidence fields and fails open without accepting semantic distractors");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
