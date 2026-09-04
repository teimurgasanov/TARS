"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const requiredDate = "2026-09-03";
const fixedNow = Date.parse("2026-09-03T20:00:00+04:00");
let scenarioCounter = 0;

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

function primaryResult(date, amount) {
  return {
    is_receipt: true,
    has_readable_text: true,
    visual_type: "bank_receipt",
    is_mailing_proof: false,
    service_type: "unknown",
    is_screenshot_of_chat: false,
    date,
    amount,
    amount_text: amount === null ? null : `${amount} RUB`,
    amount_label: amount === null ? null : "Сумма операции",
    status: "success",
    bank: "test-bank"
  };
}

function focusedResult(date, amount, overrides = {}) {
  return {
    date,
    time: "18:24",
    amount,
    amount_text: amount === null ? null : `${amount} RUB`,
    amount_label: amount === null ? null : "Сумма операции",
    currency: amount === null ? "unknown" : "RUB",
    confidence: 0.98,
    ambiguity_reason: null,
    ...overrides
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

async function runScenario(scenario) {
  const guard = loadTrackedAppWithGuard().__testGuard;
  const calls = [];
  const requests = [];
  const logs = [];
  const originalNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  Date.now = () => fixedNow;
  global.setTimeout = (resolve) => {
    resolve();
    return 0;
  };
  const http = {
    async post(url, options) {
      if (String(url).includes("ocr.api.cloud.yandex.net")) {
        calls.push(`ocr:${String(options.data.model)}`);
        return { statusCode: 200, data: { result: { textAnnotation: { fullText: ocrText(scenario.ocrDate, scenario.ocrAmount), blocks: [] } } } };
      }
      const kind = requestKind(options);
      calls.push(kind);
      requests.push({ kind, format: options.data.text.format });
      let result = kind === "engine" ? scenario.engine : kind === "date-focus" ? scenario.dateFocus : kind === "amount-focus" ? scenario.amountFocus : scenario.primary || primaryResult(scenario.ocrDate, scenario.ocrAmount);
      if (result === "timeout") throw new Error("request timeout");
      if (result === "invalid") return { statusCode: 200, data: { output_text: "not-json" } };
      if ((kind === "date-focus" || kind === "amount-focus") && options.data.text.format.schema.properties.operation_date) {
        result = engineResult(result.date, result.amount, result.confidence);
        result.operation_time = result.time || "18:24";
        result.amount_label = result.amount_label || "Сумма операции";
        result.currency = result.currency || (result.amount === null ? "unknown" : "RUB");
        result.ambiguity_reason = result.ambiguity_reason || null;
      }
      return { statusCode: 200, data: { output_text: JSON.stringify(result) } };
    }
  };
  try {
    scenarioCounter += 1;
    const result = await guard.validateReceiptDate(
      { _id: `receipt-extraction-test-${scenarioCounter}`, name: "fixture.jpg", type: "image/jpeg" },
      Buffer.from(`safe-synthetic-receipt-${scenarioCounter}`),
      http,
      {
        apiKey: "test-ocr-key",
        folderId: "test-folder",
        openaiApiKey: "test-openai-key",
        openaiReceiptModel: "gpt-4.1-mini",
        yandexAiStudioApiKey: "test-studio-key",
        yandexAiStudioFolderId: "testfolder",
        yandexAiStudioModel: "qwen3.6-35b-a3b",
        timeZone: "Europe/Samara"
      },
      { info(value) { logs.push(String(value)); }, warn(value) { logs.push(String(value)); } }
    );
    return { result, calls, logs, requests };
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;
  }
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;

  assert.strictEqual(guard.normalizeReceiptAmount("1 900 руб."), 1900, "FAIL-3: currency suffix must not become a digit");
  assert.strictEqual(guard.normalizeReceiptAmount("1900 ₽"), 1900);
  assert.strictEqual(guard.normalizeReceiptAmount("1 900 RUB"), 1900);
  assert.strictEqual(guard.normalizeReceiptAmount("1,900 RUR"), 1900);
  assert.strictEqual(guard.normalizeReceiptAmount("1 9О0 руб."), 1900, "OCR-confusable O inside the numeric token must remain supported");
  assert.strictEqual(guard.normalizeReceiptAmount("6О0 ₽"), 600);
  for (const invalid of ["amount 1900 RUB", "1900 USD", "руб.", "not money", "1900 RUB extra", "-1900 ₽", "1.2.3 ₽", "19,00,0 ₽"]) {
    assert.strictEqual(guard.normalizeReceiptAmount(invalid), undefined, `non-money input must be rejected: ${invalid}`);
  }

  assert.deepStrictEqual(
    Object.keys(guard.RECEIPT_FIELD_FOCUS_SCHEMA.properties),
    ["date", "time", "amount", "amount_text", "amount_label", "currency", "confidence", "ambiguity_reason"],
    "a focused field pass must not request receipt classification or screenshot veto fields"
  );
  const isolatedFocusedAmount = guard.receiptFieldFocusCandidateFromJson(
    focusedResult(requiredDate, null, {
      amount_text: "1 900 руб.",
      amount_label: "Итого",
      currency: "RUB",
      confidence: 0.99,
      is_screenshot_of_chat: true,
      visual_type: "chat_screenshot"
    }),
    requiredDate
  );
  assert.strictEqual(isolatedFocusedAmount.receiptAmount, 1900, "FAIL-3: the focused transcription must reach safe amount normalization");
  assert.strictEqual(isolatedFocusedAmount.containerRejection, "", "a field-only pass must be physically unable to veto receipt classification");
  const lowConfidenceFocusedAmount = guard.receiptFieldFocusCandidateFromJson(
    focusedResult(requiredDate, 1900, { confidence: 0.6 }),
    requiredDate
  );
  assert.strictEqual(lowConfidenceFocusedAmount.receiptAmount, undefined, "a low-confidence focused pass must not guess an amount");
  const yandexCompatibleFocusedAmount = guard.receiptFieldFocusCandidateFromEngineJson(
    engineResult(requiredDate, 600),
    requiredDate,
    true,
    false,
    true
  );
  assert.strictEqual(yandexCompatibleFocusedAmount.receiptAmount, 600, "Yandex engine-compatible field response must project only the focused amount");
  assert.strictEqual(yandexCompatibleFocusedAmount.receiptDate, undefined, "amount focus must not reuse a date from the compatibility contract");
  assert.strictEqual(yandexCompatibleFocusedAmount.containerRejection, "", "engine-compatible field projection must not create a classification veto");

  const fail1Resolved = await runScenario({
    engine: engineResult("2024-09-03", 800),
    ocrDate: requiredDate,
    ocrAmount: 800,
    dateFocus: focusedResult(requiredDate, 800)
  });
  assert.strictEqual(fail1Resolved.result.ok, true, "FAIL-1: independently confirmed OCR date may resolve a wrong HIGH year");
  assert.strictEqual(fail1Resolved.result.receiptDate, requiredDate);
  assert.strictEqual(fail1Resolved.calls.filter((value) => value === "date-focus").length, 1, "FAIL-1: exactly one date-focused pass is allowed");
  assert(!fail1Resolved.calls.includes("amount-focus") && !fail1Resolved.calls.includes("primary"), "FAIL-1: unrelated passes must not run");

  const fail1Unresolved = await runScenario({
    engine: engineResult("2024-09-03", 800),
    ocrDate: requiredDate,
    ocrAmount: 800,
    dateFocus: focusedResult("2025-09-04", 800)
  });
  assert.strictEqual(fail1Unresolved.result.ok, false);
  assert.match(fail1Unresolved.result.reason, /ДАТЫ ЧЕКА НЕ СОВПАЛИ/);
  assert.strictEqual(fail1Unresolved.result.receiptDate, undefined, "unresolved date must not be presented as confirmed");

  const fail1ConfirmedWrong = await runScenario({
    engine: engineResult("2024-09-03", 800),
    ocrDate: requiredDate,
    ocrAmount: 800,
    dateFocus: focusedResult("2024-09-03", 800)
  });
  assert.strictEqual(fail1ConfirmedWrong.result.ok, false, "a focused pass confirming the old date must preserve strict date rejection");
  assert.strictEqual(fail1ConfirmedWrong.result.receiptDate, "2024-09-03");
  assert.match(fail1ConfirmedWrong.result.reason, /ДАТА ЧЕКА 03\.09\.2024/);

  const amountResolvedToQwen = await runScenario({
    engine: engineResult(requiredDate, 600),
    ocrDate: requiredDate,
    ocrAmount: 2600,
    amountFocus: focusedResult(requiredDate, 600)
  });
  assert.strictEqual(amountResolvedToQwen.result.ok, true);
  assert.strictEqual(amountResolvedToQwen.result.receiptAmount, 600);
  assert.strictEqual(amountResolvedToQwen.calls.filter((value) => value === "amount-focus").length, 1);
  const yandexAmountFocusRequest = amountResolvedToQwen.requests.find((entry) => entry.kind === "amount-focus");
  assert(yandexAmountFocusRequest, "a focused amount request must be observable");
  assert.strictEqual(yandexAmountFocusRequest.format.name, "tars_receipt_field_focus_yandex_v1");
  assert.deepStrictEqual(yandexAmountFocusRequest.format.schema, guard.RECEIPT_VISION_ENGINE_SCHEMA, "Yandex focused extraction must use its proven strict schema");

  const amountResolvedToOcr = await runScenario({
    engine: engineResult(requiredDate, 1300),
    ocrDate: requiredDate,
    ocrAmount: 600,
    amountFocus: focusedResult(requiredDate, 600)
  });
  assert.strictEqual(amountResolvedToOcr.result.ok, true);
  assert.strictEqual(amountResolvedToOcr.result.receiptAmount, 600, "focused confirmation may safely select the OCR value");

  const unresolvedAmount = await runScenario({
    engine: engineResult(requiredDate, 1300),
    ocrDate: requiredDate,
    ocrAmount: 2600,
    amountFocus: focusedResult(requiredDate, 700)
  });
  assert.strictEqual(unresolvedAmount.result.ok, false);
  assert.match(unresolvedAmount.result.reason, /СУММЫ ЧЕКА НЕ СОВПАЛИ/);
  assert.strictEqual(unresolvedAmount.result.receiptAmount, undefined, "FAIL-2: an arbitrary first conflicting amount must not be displayed");

  const legacyAmountConflict = await runScenario({
    engine: engineResult(requiredDate, 600, 0.5),
    ocrDate: requiredDate,
    ocrAmount: 2600,
    primary: primaryResult(requiredDate, 600),
    amountFocus: focusedResult(requiredDate, 600)
  });
  assert.strictEqual(legacyAmountConflict.result.ok, false);
  assert.match(legacyAmountConflict.result.reason, /СУММЫ ЧЕКА НЕ СОВПАЛИ/);
  assert.strictEqual(legacyAmountConflict.result.receiptAmount, undefined, "legacy conflict must not expose the first OCR candidate as a confirmed amount");

  const unavailableVisionAmount = await runScenario({
    engine: "invalid",
    ocrDate: requiredDate,
    ocrAmount: 2600,
    primary: "invalid",
    amountFocus: "invalid"
  });
  assert.strictEqual(unavailableVisionAmount.result.ok, false);
  assert.match(unavailableVisionAmount.result.reason, /СУММА ЧЕКА НЕ РАСПОЗНАНА/);
  assert.strictEqual(unavailableVisionAmount.result.receiptAmount, undefined, "an unconfirmed OCR candidate must not leak through amount-missing control output");

  const fail3FocusedRecovery = await runScenario({
    engine: "invalid",
    ocrDate: requiredDate,
    ocrAmount: null,
    primary: primaryResult(requiredDate, null),
    amountFocus: focusedResult(requiredDate, 1900, {
      amount_text: "1 900 руб.",
      amount_label: "Итого",
      currency: "RUB",
      confidence: 0.99,
      is_screenshot_of_chat: true,
      visual_type: "chat_screenshot"
    })
  });
  assert.strictEqual(fail3FocusedRecovery.result.ok, true, "FAIL-3: a high-confidence focused amount may complete an independently confirmed receipt");
  assert.strictEqual(fail3FocusedRecovery.result.receiptAmount, 1900);
  assert.strictEqual(fail3FocusedRecovery.calls.filter((value) => value === "amount-focus").length, 1, "FAIL-3: exactly one amount-focused pass is allowed");
  assert.doesNotMatch(String(fail3FocusedRecovery.result.reason || ""), /СКРИНШОТ|НЕ ПРИНЯТ/, "field extraction must not reclassify the receipt");

  for (const failedFocus of ["timeout", "invalid"]) {
    const result = await runScenario({
      engine: engineResult(requiredDate, 600),
      ocrDate: requiredDate,
      ocrAmount: 2600,
      amountFocus: failedFocus
    });
    assert.strictEqual(result.result.ok, false, `${failedFocus}: failed dispute resolution must fail closed to control`);
    assert.strictEqual(result.result.receiptAmount, undefined);
  }

  const safeTelemetry = guard.receiptFieldTelemetryPayload({
    provider: "secret-provider-value",
    pass: "amount_focus",
    amount: 1900,
    date: requiredDate,
    confidence: 0.98765,
    source: "focused",
    layout: "page",
    selectedAuthority: "yandex_qwen",
    disagreement: true,
    reasonCode: "focused_confirms_qwen",
    filename: "private.jpg",
    url: "https://private.invalid/file",
    rawText: "private OCR text",
    apiKey: "secret"
  });
  assert.deepStrictEqual(Object.keys(safeTelemetry), ["provider", "pass", "amount", "date", "confidence", "source", "layout", "selected_authority", "disagreement", "reason_code"]);
  const serializedTelemetry = JSON.stringify(safeTelemetry);
  for (const forbidden of ["private.jpg", "private.invalid", "private OCR text", "secret-provider-value", "secret"]) {
    assert(!serializedTelemetry.includes(forbidden), `telemetry must exclude ${forbidden}`);
  }
  assert.strictEqual(safeTelemetry.provider, "unknown");
  assert.strictEqual(safeTelemetry.confidence, 0.988);
  assert(fail1Resolved.logs.some((line) => line.startsWith("RECEIPT_FIELD_TRACE_V1 ")), "field telemetry must be emitted");
  for (const line of fail1Resolved.logs.filter((value) => value.startsWith("RECEIPT_FIELD_TRACE_V1 "))) {
    const payload = JSON.parse(line.slice("RECEIPT_FIELD_TRACE_V1 ".length));
    assert.deepStrictEqual(Object.keys(payload), ["provider", "pass", "amount", "date", "confidence", "source", "layout", "selected_authority", "disagreement", "reason_code"]);
  }

  console.log("PASS: receipt extraction fixes cover FAIL-1/2/3 and privacy-safe field telemetry");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
