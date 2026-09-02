"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const root = path.resolve(__dirname, "..");
const requiredDate = "2026-09-02";
const fixedNow = Date.parse("2026-09-02T18:00:00+04:00");

function visionFields(amount, confidence = 0.98, overrides = {}) {
  return {
    is_receipt: true,
    operation_date: requiredDate,
    operation_time: "17:14",
    amount,
    currency: "RUB",
    confidence,
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
    amount_text: amount > 0 ? `${amount} RUB` : null,
    amount_label: amount > 0 ? "Сумма операции" : null,
    status: "success",
    bank: "test-bank",
    ...overrides
  };
}

function yandexReceipt(amount) {
  return [
    "Банк",
    "Чек по операции",
    "Дата операции 02.09.2026",
    `Сумма операции ${amount} ₽`,
    "Статус операции Исполнено"
  ].join("\n");
}

function requestKind(options) {
  const format = options && options.data && options.data.text && options.data.text.format;
  if (format && format.name === "receipt_vision_fields_v1") return "vision-fields";
  const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ")) return "date-focus";
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА:")) return "amount-focus";
  return "primary";
}

function provider(scenario, calls) {
  let visionAttempt = 0;
  return {
    async post(url, options) {
      if (String(url).includes("ocr.api.cloud.yandex.net")) {
        calls.push(`yandex:${String(options.data.model)}`);
        return { statusCode: 200, data: { result: { textAnnotation: { fullText: yandexReceipt(scenario.ocrAmount), blocks: [] } } } };
      }
      assert(String(url).includes("api.openai.com"), `unexpected provider URL: ${url}`);
      const kind = requestKind(options);
      calls.push(kind);
      if (kind === "vision-fields") {
        visionAttempt += 1;
        if (scenario.visionFailure === "timeout") throw new Error("request timeout");
        if ([429, 500, 503].includes(scenario.visionFailure)) return { statusCode: scenario.visionFailure, data: {} };
        if (scenario.visionFailure === "invalid") return { statusCode: 200, data: { output_text: "not-json" } };
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
  const originalNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  Date.now = () => fixedNow;
  global.setTimeout = (resolve) => {
    resolve();
    return 0;
  };
  try {
    const result = await guard.validateReceiptDate(
      { _id: `vision-first-${label}`, name: `${label}.jpg`, type: "image/jpeg" },
      Buffer.from(`vision-first-${label}`),
      provider(scenario, calls),
      {
        apiKey: "test-yandex-key",
        folderId: "test-folder",
        openaiApiKey: "test-openai-key",
        openaiReceiptModel: "gpt-4.1-mini",
        timeZone: "Europe/Samara"
      },
      { info(value) { logs.push(String(value)); }, warn(value) { logs.push(String(value)); } }
    );
    return { result, calls, logs };
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;
  }
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert.strictEqual(guard.RECEIPT_VISION_FIELDS_MIN_CONFIDENCE, 0.9);
  assert.deepStrictEqual(guard.parseReceiptVisionFields(visionFields(900)), {
    isReceipt: true,
    operationDate: requiredDate,
    operationTime: "17:14",
    amount: 900,
    currency: "RUB",
    confidence: 0.98
  });
  assert.strictEqual(guard.parseReceiptVisionFields(visionFields(1e3, 0.98, { operation_time: "16:19:22", currency: "RUR" })).currency, "RUB");
  assert.strictEqual(guard.parseReceiptVisionFields({ ...visionFields(900), extra: true }), undefined, "unexpected structured fields must fail open to OCR");

  const vtb = await run("vtb", { vision: visionFields(900), ocrAmount: 900 });
  assert.strictEqual(vtb.result.ok, true, "A: VTB receipt must be accepted");
  assert.strictEqual(vtb.result.receiptDate, requiredDate);
  assert.strictEqual(vtb.result.receiptAmount, 900);
  assert.strictEqual(vtb.calls.filter((call) => call === "vision-fields").length, 1, "A: receipt fields must use one structured Vision call");

  const alfa = await run("alfa", { vision: visionFields(1e3, 0.98, { operation_time: "16:19:22", currency: "RUR" }), ocrAmount: 1e3 });
  assert.strictEqual(alfa.result.ok, true, "B: Alfa receipt must be accepted");
  assert.strictEqual(alfa.result.receiptDate, requiredDate);
  assert.strictEqual(alfa.result.receiptAmount, 1e3);

  const ocrSeven = await run("ocr-seven", { vision: visionFields(1e3), ocrAmount: 7 });
  assert.strictEqual(ocrSeven.result.ok, true, "C: high-confidence Vision must remain authoritative over an OCR outlier");
  assert.strictEqual(ocrSeven.result.receiptAmount, 1e3);
  assert(ocrSeven.logs.some((line) => /RECEIPT_VISION_FIELDS_V1 authority=high .*amount_disagreement=true/.test(line)), "C: disagreement must be telemetry-only");

  const sber = await run("sber-angled-glare", {
    vision: visionFields(1300, 0.98, { operation_time: "11:00" }),
    ocrAmount: 1
  });
  assert.strictEqual(sber.result.ok, true, "H: Sber receipt must be accepted");
  assert.strictEqual(sber.result.receiptDate, "2026-09-02", "H: high-confidence Vision date must remain authoritative");
  assert.strictEqual(sber.result.receiptAmount, 1300, "H: high-confidence Vision amount must remain authoritative");
  assert(![0, 1, 300].includes(sber.result.receiptAmount), "H: OCR fragments must never replace Vision amount 1300");
  assert.strictEqual(sber.calls.filter((call) => call === "vision-fields").length, 1, "H: receipt fields must use one structured Vision call");
  assert(sber.logs.some((line) => /RECEIPT_VISION_FIELDS_V1 authority=high .*amount_disagreement=true/.test(line)), "H: OCR amount 1 disagreement must be telemetry-only");

  const ocrZero = await run("ocr-zero", { vision: visionFields(900), ocrAmount: 0 });
  assert.strictEqual(ocrZero.result.ok, true, "D: Vision must supply the amount when OCR returns zero");
  assert.strictEqual(ocrZero.result.receiptAmount, 900);

  const lowConfidence = await run("low-confidence", { vision: visionFields(900, 0.89), ocrAmount: 700 });
  assert.strictEqual(lowConfidence.result.ok, true, "E: low confidence must retain the old accepting OCR path");
  assert.strictEqual(lowConfidence.result.receiptAmount, 700);

  for (const failure of ["timeout", 429, 500, 503, "invalid"]) {
    const unavailable = await run(`unavailable-${failure}`, { vision: visionFields(900), visionFailure: failure, ocrAmount: 700 });
    assert.strictEqual(unavailable.result.ok, true, `F: ${failure} must fail open to the old OCR path`);
    assert.strictEqual(unavailable.result.receiptAmount, 700);
    const expectedAttempts = failure === "invalid" ? 1 : 2;
    assert.strictEqual(unavailable.calls.filter((call) => call === "vision-fields").length, expectedAttempts);
  }

  const source = fs.readFileSync(path.join(root, "TarsReportApp.js"), "utf8");
  const duplicateStart = source.indexOf("async function rejectDuplicateMessage");
  const duplicateEnd = source.indexOf("async function seedRoom", duplicateStart);
  const workPhotoStart = source.indexOf("async function shouldForwardConfirmedWorkPhoto");
  const workPhotoEnd = source.indexOf("async function", workPhotoStart + 40);
  assert(!source.slice(duplicateStart, duplicateEnd).includes("requestOpenAiReceiptVisionFields"), "G: duplicate protection must remain unchanged");
  assert(!source.slice(workPhotoStart, workPhotoEnd).includes("requestOpenAiReceiptVisionFields"), "G: work-photo routing must remain unchanged");

  console.log("PASS: high-confidence receipt Vision owns date/amount while OCR remains a fail-open verifier and fallback");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
