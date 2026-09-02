"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const root = path.resolve(__dirname, "..");
const requiredDate = "2026-09-02";
const fixedNow = Date.parse("2026-09-02T12:00:00+04:00");

function primaryReceipt(date, amount) {
  return {
    is_receipt: true,
    visual_type: "bank_receipt",
    date,
    amount,
    amount_text: amount ? `${amount} RUB` : null,
    amount_label: amount ? "Сумма операции" : null,
    status: "success",
    bank: "test-bank"
  };
}

function targeted(date, amount, confidence = 0.98) {
  return {
    operation_date: date,
    operation_time: "11:00",
    amount,
    currency: "RUB",
    confidence
  };
}

function requestKind(options) {
  const format = options && options.data && options.data.text && options.data.text.format;
  if (format && format.name === "receipt_targeted_date_amount_v1") return "targeted";
  const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ")) return "date-focus";
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА:")) return "amount-focus";
  return "primary";
}

function httpFor(scenario, calls) {
  const attempts = {};
  return {
    async post(url, options) {
      assert(url.includes("api.openai.com"), `unexpected provider: ${url}`);
      const kind = requestKind(options);
      calls.push(kind);
      attempts[kind] = (attempts[kind] || 0) + 1;
      const failure = scenario.failure;
      if (kind === "targeted" && failure === "timeout") throw new Error("request timeout");
      if (kind === "targeted" && [429, 500, 503].includes(failure)) return { statusCode: failure, data: {} };
      if (kind === "targeted" && failure === "invalid") return { statusCode: 200, data: { output_text: "not-json" } };
      const value = kind === "targeted" ? scenario.targeted : scenario.existing(kind);
      return { statusCode: 200, data: { output_text: JSON.stringify(value) } };
    }
  };
}

async function run(scenario) {
  const guard = loadTrackedAppWithGuard().__testGuard;
  const calls = [];
  const originalNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  Date.now = () => fixedNow;
  global.setTimeout = (resolve) => {
    resolve();
    return 0;
  };
  try {
    const result = await guard.validateReceiptDate(
      { _id: `targeted-${Math.random()}`, name: "fixture.jpg", type: "image/jpeg" },
      Buffer.from([255, 216, 255, 224, 1, 2, 3]),
      httpFor(scenario, calls),
      { openaiApiKey: "test-key", openaiReceiptModel: "gpt-4.1-mini", timeZone: "Europe/Samara" },
      { info() {}, warn() {} }
    );
    return { result, calls };
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;
  }
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert.deepStrictEqual(guard.parseReceiptTargetedDateAmount(targeted("2 сентября 2026 в 11:00", "1 300 ₽"), requiredDate), {
    operationDate: requiredDate,
    operationTime: "11:00",
    amount: 1300,
    currency: "RUB",
    confidence: 0.98
  });
  assert.strictEqual(guard.parseReceiptTargetedDateAmount(targeted(requiredDate, "1,300 ₽"), requiredDate).amount, 1300);
  assert.strictEqual(guard.parseReceiptTargetedDateAmount(targeted(requiredDate, "1300 руб"), requiredDate).amount, 1300);
  assert.strictEqual(guard.parseReceiptTargetedDateAmount(targeted(requiredDate, "1300 RUB"), requiredDate).amount, 1300);

  const dateFallback = await run({
    existing: () => primaryReceipt(null, 1300),
    targeted: targeted(requiredDate, 1300)
  });
  assert.strictEqual(dateFallback.result.ok, true, "A: targeted Vision must fill a missing date");
  assert.strictEqual(dateFallback.result.receiptDate, requiredDate);
  assert.strictEqual(dateFallback.result.receiptAmount, 1300);
  assert.strictEqual(dateFallback.calls.filter((kind) => kind === "targeted").length, 1);

  const amountFallback = await run({
    existing: () => primaryReceipt(requiredDate, 0),
    targeted: targeted(requiredDate, 1300)
  });
  assert.strictEqual(amountFallback.result.ok, true, "B: targeted Vision must fill a zero/missing amount");
  assert.strictEqual(amountFallback.result.receiptAmount, 1300);

  const confidentExisting = await run({
    existing: () => primaryReceipt(requiredDate, 1300),
    targeted: targeted(requiredDate, 9999)
  });
  assert.strictEqual(confidentExisting.result.ok, true, "C: the existing confident route must remain authoritative");
  assert.strictEqual(confidentExisting.result.receiptAmount, 1300);
  assert.strictEqual(confidentExisting.calls.includes("targeted"), false, "C: targeted fallback must not run for complete evidence");

  const conflictingTargeted = await run({
    existing: () => primaryReceipt(null, 1300),
    targeted: targeted(requiredDate, 9999)
  });
  assert.strictEqual(conflictingTargeted.result.ok, false, "C: conflicting targeted data must not override a confident existing amount");
  assert.match(conflictingTargeted.result.reason, /ДАТА ЧЕКА НЕ РАСПОЗНАНА/);
  assert.strictEqual(conflictingTargeted.result.receiptAmount, undefined);

  for (const failure of ["timeout", 429, 500, 503, "invalid"]) {
    const failedFallback = await run({
      existing: () => primaryReceipt(requiredDate, 0),
      targeted: targeted(requiredDate, 1300),
      failure
    });
    assert.strictEqual(failedFallback.result.ok, false, `D: ${failure} must preserve the old rejection path`);
    assert.match(failedFallback.result.reason, /СУММА ЧЕКА НЕ РАСПОЗНАНА/);
    const expectedAttempts = failure === "invalid" ? 1 : 2;
    assert.strictEqual(failedFallback.calls.filter((kind) => kind === "targeted").length, expectedAttempts);
  }

  const lowConfidence = await run({
    existing: () => primaryReceipt(requiredDate, 0),
    targeted: targeted(requiredDate, 1300, 0.7)
  });
  assert.strictEqual(lowConfidence.result.ok, false, "low-confidence fallback must fail closed");
  assert.match(lowConfidence.result.reason, /СУММА ЧЕКА НЕ РАСПОЗНАНА/);

  const source = fs.readFileSync(path.join(root, "TarsReportApp.js"), "utf8");
  const duplicateStart = source.indexOf("async function rejectDuplicateMessage");
  const duplicateEnd = source.indexOf("async function seedRoom", duplicateStart);
  const workPhotoStart = source.indexOf("async function shouldForwardConfirmedWorkPhoto");
  const workPhotoEnd = source.indexOf("async function", workPhotoStart + 40);
  assert(!source.slice(duplicateStart, duplicateEnd).includes("requestOpenAiReceiptDateAmountFallback"), "E: duplicate protection must not use targeted fallback");
  assert(!source.slice(workPhotoStart, workPhotoEnd).includes("requestOpenAiReceiptDateAmountFallback"), "F: work-photo routing must not use targeted fallback");

  console.log("PASS: targeted receipt date/amount fallback fills only missing high-confidence fields and fails closed");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
