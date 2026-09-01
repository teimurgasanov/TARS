"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { withRocketChatStubs } = require("./helpers/canonical-tars-runtime");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "TarsReportApp.js");
const requiredDate = "2026-09-01";
const fixedNow = Date.parse("2026-09-01T12:00:00+04:00");

function loadValidationGuard() {
  const instrumentedPath = path.join(root, `.tars-date-mismatch-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  const source = fs.readFileSync(sourcePath, "utf8");
  const exportMarker = "module2.exports = {\n      exactHash,";
  assert(source.includes(exportMarker), "internal receipt guard export marker must exist");
  const instrumented = source.replace(exportMarker, "module2.exports = {\n      validateReceiptDate,\n      exactHash,");
  fs.writeFileSync(instrumentedPath, `${instrumented}\nmodule.exports.__dateMismatchGuard = G;\n`, "utf8");
  try {
    delete require.cache[require.resolve(instrumentedPath)];
    const loaded = withRocketChatStubs(() => require(instrumentedPath));
    assert(loaded.__dateMismatchGuard && typeof loaded.__dateMismatchGuard.validateReceiptDate === "function");
    return loaded.__dateMismatchGuard.validateReceiptDate;
  } finally {
    delete require.cache[instrumentedPath];
    fs.unlinkSync(instrumentedPath);
  }
}

function successfulReceiptText(date) {
  return [
    "Сбербанк",
    "Чек по операции",
    `Дата операции ${date}`,
    "Сумма 1200 ₽",
    "Статус операции Исполнено"
  ].join("\n");
}

function undatedReceiptText() {
  return [
    "Сбербанк",
    "Чек по операции",
    "Сумма 1200 ₽",
    "Статус операции Исполнено"
  ].join("\n");
}

function openAiResult(date, overrides = {}) {
  return {
    is_receipt: true,
    visual_type: "bank_receipt",
    is_mailing_proof: false,
    is_screenshot_of_chat: false,
    date,
    amount: 1200,
    amount_text: "1200 ₽",
    amount_label: "Сумма",
    status: "success",
    bank: "test-bank",
    ...overrides
  };
}

function openAiPass(options) {
  const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ")) return "date-focus";
  if (prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА:")) return "amount-focus";
  return "primary";
}

function createHttp(scenario, calls) {
  const attemptCounts = {};
  return {
    async post(url, options) {
      if (url.includes("ocr.api.cloud.yandex.net")) {
        const model = String(options.data.model);
        calls.push(`yandex:${model}`);
        const text = typeof scenario.yandex === "function" ? scenario.yandex(model) : scenario.yandex;
        return {
          statusCode: 200,
          data: { result: { textAnnotation: { fullText: text || "", blocks: [] } } }
        };
      }
      if (url.includes("api.openai.com")) {
        const pass = openAiPass(options);
        calls.push(`openai:${pass}`);
        attemptCounts[pass] = (attemptCounts[pass] || 0) + 1;
        if (scenario.openAi429Once === pass && attemptCounts[pass] === 1) {
          return { statusCode: 429, data: {} };
        }
        const value = typeof scenario.openai === "function" ? scenario.openai(pass) : scenario.openai;
        return { statusCode: 200, data: { output_text: JSON.stringify(value) } };
      }
      throw new Error(`unexpected provider URL: ${url}`);
    }
  };
}

async function runScenario(scenario) {
  const validateReceiptDate = loadValidationGuard();
  const calls = [];
  const delays = [];
  const originalNow = Date.now;
  const originalSetTimeout = global.setTimeout;
  Date.now = () => fixedNow;
  global.setTimeout = (resolve, delay) => {
    delays.push(Number(delay || 0));
    resolve();
    return 0;
  };
  try {
    const result = await validateReceiptDate(
      { name: "receipt.jpg", type: "image/jpeg" },
      Buffer.from([1, 2, 3, 4]),
      createHttp(scenario, calls),
      {
        apiKey: "test-yandex-key",
        folderId: "test-folder",
        openaiApiKey: "test-openai-key",
        openaiReceiptModel: "gpt-4.1-mini",
        timeZone: "Europe/Astrakhan"
      },
      { warn() {}, info() {} }
    );
    return { result, calls, delays, fakeElapsedMs: delays.reduce((sum, delay) => sum + delay, 0) };
  } finally {
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;
  }
}

function assertDateMismatch(result, date) {
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.receiptDate, date);
  assert.strictEqual(result.reason, `🚫 ДАТА ЧЕКА ${date.split("-").reverse().join(".")}, НУЖНА 01.09.2026`);
}

(async () => {
  const agreedMismatch = await runScenario({
    yandex: successfulReceiptText("31.08.2026"),
    openai: () => openAiResult("2026-08-31")
  });
  assertDateMismatch(agreedMismatch.result, "2026-08-31");
  assert.deepStrictEqual(agreedMismatch.calls, [
    "yandex:page",
    "yandex:page-column-sort",
    "yandex:table",
    "yandex:markdown",
    "openai:primary"
  ]);
  assert(!agreedMismatch.calls.includes("openai:amount-focus"));
  assert(!agreedMismatch.calls.includes("openai:date-focus"));
  assert.strictEqual(agreedMismatch.fakeElapsedMs, 1050, "fake clock must see only existing Yandex queue spacing");

  const onlyYandex = await runScenario({
    yandex: successfulReceiptText("31.08.2026"),
    openai: () => openAiResult(null)
  });
  assertDateMismatch(onlyYandex.result, "2026-08-31");
  assert(onlyYandex.calls.includes("openai:amount-focus"));
  assert(onlyYandex.calls.includes("openai:date-focus"));

  const onlyOpenAi = await runScenario({
    yandex: undatedReceiptText(),
    openai: () => openAiResult("2026-08-31")
  });
  assertDateMismatch(onlyOpenAi.result, "2026-08-31");
  assert(onlyOpenAi.calls.includes("openai:amount-focus"));
  assert(onlyOpenAi.calls.includes("openai:date-focus"));

  const conflictingProviders = await runScenario({
    yandex: successfulReceiptText("31.08.2026"),
    openai: () => openAiResult(requiredDate)
  });
  assert(conflictingProviders.calls.includes("openai:amount-focus"));
  assert(!conflictingProviders.calls.includes("openai:date-focus"), "existing route skips date-focus once requiredDate is present");

  const agreedToday = await runScenario({
    yandex: successfulReceiptText("01.09.2026"),
    openai: () => openAiResult(requiredDate)
  });
  assert.strictEqual(agreedToday.result.ok, true);
  assert.deepStrictEqual(agreedToday.calls, ["yandex:page", "openai:primary", "openai:amount-focus"]);

  const retriedPrimary = await runScenario({
    yandex: successfulReceiptText("31.08.2026"),
    openai: () => openAiResult("2026-08-31"),
    openAi429Once: "primary"
  });
  assertDateMismatch(retriedPrimary.result, "2026-08-31");
  assert.deepStrictEqual(retriedPrimary.calls.slice(-2), ["openai:primary", "openai:primary"]);
  assert(retriedPrimary.delays.includes(900), "existing OpenAI 429 retry delay must remain active");

  const unknownImage = await runScenario({
    yandex: "человек волосы лицо затылок",
    openai: () => openAiResult(null, {
      is_receipt: false,
      visual_type: "hair_work_photo",
      amount: null,
      amount_text: null,
      amount_label: null,
      status: "unknown",
      bank: null
    })
  });
  assert.strictEqual(unknownImage.result.ok, false);
  assert(!unknownImage.result.reason.includes("ДАТА ЧЕКА 31.08.2026"));
  assert(unknownImage.calls.includes("openai:amount-focus"));
  assert(unknownImage.calls.includes("openai:date-focus"));

  const internallyAmbiguousYandex = await runScenario({
    yandex: (model) => successfulReceiptText(model === "page-column-sort" ? "30.08.2026" : "31.08.2026"),
    openai: () => openAiResult("2026-08-31")
  });
  assert(internallyAmbiguousYandex.calls.includes("openai:amount-focus"));
  assert(internallyAmbiguousYandex.calls.includes("openai:date-focus"));

  const source = fs.readFileSync(sourcePath, "utf8");
  const validationBlock = source.slice(source.indexOf("async function validateReceiptDate"), source.indexOf("async function validateReceiptStrict"));
  for (const forbiddenCall of ["evaluateRules(", "resolveConflicts(", "makeDecision(", "runOfflineComparison(", "runOfflineDataset("]) {
    assert(!validationBlock.includes(forbiddenCall), `legacy receipt validation must not call Scanner 2.0 decision runtime: ${forbiddenCall}`);
  }

  console.log("PASS: independent Yandex + primary OpenAI date mismatch exits early without changing fallback or accepted paths");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
