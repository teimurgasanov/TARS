"use strict";
const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");
const adapter = require("../vision/openrouter-vision-v1");
const reply = (value, finish = "stop") => ({ statusCode: 200, data: { choices: [{ finish_reason: finish, message: { content: JSON.stringify(value) } }] } });
const primaryPhoto = {
  kind: "work_photo", confidence: "high", service_kind: "hair",
  has_payment_ui: false, has_receipt_layout: false, has_financial_document: false,
  has_document_layout: false, has_visible_client: true, has_visible_service_result: true,
  has_visible_hair_result: true, has_visible_nail_result: false, has_visible_brow_lash_result: false,
  has_salon_context: true, has_messaging_ui: false, is_receipt: false, is_banking: false,
  is_document: false, has_receipt_text: false, is_mailing_proof: false,
  is_screenshot_of_chat: false, visual_type: "hair_work_photo", service_type: "haircut"
};

(async () => {
  const api = loadTrackedAppWithGuard().__testGuard;
  const config = {
    openRouterVisionEnabled: true, openRouterApiKey: "synthetic-router-key",
    openaiApiKey: "synthetic-openai-key", yandexAiStudioApiKey: "synthetic-yandex-key",
    yandexAiStudioFolderId: "testfolder", openaiReceiptModel: "gpt-4.1-mini"
  };
  const provider = api.receiptVisionProviderForConfig(config);
  assert.strictEqual(provider.id, "openrouter", "enabled migration must choose OpenRouter before Yandex");
  assert.strictEqual(provider.model, "google/gemini-3.5-flash");
  assert.strictEqual(provider.headers.Authorization, "Bearer synthetic-router-key");
  assert.strictEqual(api.receiptVisionProviderForConfig({ ...config, openRouterApiKey: "" }), undefined,
    "missing OpenRouter key must not borrow a credential or silently switch providers");
  assert.strictEqual(api.receiptVisionProviderForConfig({ ...config, openRouterVisionEnabled: false }).id, "yandex_ai_studio");
  assert.strictEqual(api.receiptVisionProviderForConfig({ ...config, openRouterApiKey: "bad key" }), undefined);
  const file = { id: "synthetic-file", name: "synthetic.png", type: "image/png" };
  const content = Buffer.from("synthetic non-financial bytes");
  const logger = { info() {}, warn() {}, error() {} };
  const original = {
    headers: provider.headers, timeout: 14000,
    data: { input: [{ role: "user", content: [{ type: "input_text", text: "synthetic prompt" }, { type: "input_image", image_url: "data:image/png;base64,c3ludGhldGlj" }] }],
      text: { format: { name: "synthetic", schema: { type: "object", additionalProperties: false, properties: {}, required: [] } } } }
  };
  const snapshot = JSON.stringify(original);
  let calls = 0;
  await adapter.post({ post: async (url, options) => {
    calls++;
    assert.strictEqual(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.strictEqual(options.headers.Authorization, "Bearer synthetic-router-key");
    assert.strictEqual(options.strictSSL, true);
    assert.strictEqual(options.rejectUnauthorized, true);
    assert.strictEqual(options.timeout, 14000);
    assert.strictEqual(options.data.model, adapter.MODEL);
    assert.deepStrictEqual(options.data.provider, { require_parameters: true, data_collection: "deny", zdr: true, allow_fallbacks: false });
    assert.strictEqual(options.data.response_format.json_schema.strict, true);
    assert.deepStrictEqual(options.data.response_format.json_schema.schema, original.data.text.format.schema);
    assert.strictEqual(options.data.messages[0].content[1].image_url.url, original.data.input[0].content[1].image_url);
    assert(!JSON.stringify(options).includes("synthetic-openai-key"));
    return reply({});
  } }, provider, original);
  assert.strictEqual(calls, 1);
  assert.strictEqual(JSON.stringify(original), snapshot, "request conversion must not mutate input objects");
  for (const budgetField of ["max_tokens", "max_completion_tokens", "max_output_tokens"]) {
    let observedBudget;
    await adapter.post({ post: async (url, options) => {
      observedBudget = options.data.max_tokens;
      return reply({});
    } }, provider, { ...original, data: { ...original.data, [budgetField]: 320 } });
    assert.strictEqual(observedBudget, 320, "transport must preserve the caller's token budget");
  }
  const chatRequest = {
    ...original,
    data: {
      messages: [{ role: "user", content: [{ type: "text", text: "synthetic prompt" }] }],
      response_format: { type: "json_schema", json_schema: { name: "synthetic", strict: true, schema: original.data.text.format.schema } },
      max_tokens: 512
    }
  };
  const chatSnapshot = JSON.stringify(chatRequest);
  await adapter.post({ post: async (url, options) => {
    assert.deepStrictEqual(options.data.messages, chatRequest.data.messages);
    assert.deepStrictEqual(options.data.response_format, chatRequest.data.response_format);
    assert.strictEqual(options.data.max_tokens, 512);
    return reply({});
  } }, provider, chatRequest);
  assert.strictEqual(JSON.stringify(chatRequest), chatSnapshot);
  const legacyProvider = api.receiptVisionProviderForConfig({ openaiApiKey: "legacy-key" });
  const legacyOptions = { data: {}, headers: {}, timeout: 123 };
  const legacyResponse = { statusCode: 200, data: { output_text: "{}" } };
  assert.strictEqual(await adapter.post({ post: async (url, options) => {
    assert.strictEqual(url, legacyProvider.url); assert.strictEqual(options, legacyOptions); return legacyResponse;
  } }, legacyProvider, legacyOptions), legacyResponse, "disabled transport keeps request/response identity");
  for (const statusCode of [301, 401, 403, 429, 500, 503]) {
    let count = 0;
    const response = await adapter.post({ post: async () => { count++; return { statusCode, data: { secret: "RAW_SECRET_SENTINEL" } }; } }, provider, original);
    assert.strictEqual(count, 1, "transport must not add retries or swap credentials");
    assert.deepStrictEqual(response, { statusCode, data: {} });
  }
  await assert.rejects(adapter.post({ post: async () => { throw new Error("ETIMEDOUT RAW_SECRET_SENTINEL"); } }, provider, original), error => error.message === "Vision timeout");
  await assert.rejects(adapter.post({ post: async () => { throw new Error("RAW_SECRET_SENTINEL"); } }, provider, original), error => error.message === "Vision transport unavailable");
  for (const payload of [null, {}, { error: { message: "RAW_SECRET_SENTINEL" } }, reply({}, "length").data,
    { choices: [reply({}).data.choices[0], reply({}).data.choices[0]] },
    { choices: [{ finish_reason: "stop", message: { content: "{}", tool_calls: [{}] } }] },
    reply({}, "content_filter").data, { choices: [{ finish_reason: "stop", message: { content: "{}", refusal: "refused" } }] },
    { choices: [{ finish_reason: "stop", message: { content: "x".repeat(32001) } }] }]) {
    assert.strictEqual(adapter.responseText(payload), "", "incomplete/refused/invalid responses cannot become authority");
  }
  const invalidEnvelope = await adapter.post({ post: async () => ({
    statusCode: 200, data: { ...reply({}, "length").data, output_text: "{\"injected\":true}" }
  }) }, provider, original);
  assert.deepStrictEqual(invalidEnvelope, { statusCode: 200, data: { output_text: "" } }, "alternate fields cannot bypass finish validation");
  // Financial fields are prohibited in primary classification. Routing stays
  // identical to the current Yandex classification for the same valid verdict.
  for (const [value, expected] of [
    [primaryPhoto, "photo"],
    [{ ...primaryPhoto, kind: "receipt", is_receipt: true, is_banking: true, has_payment_ui: true, has_receipt_layout: true, visual_type: "bank_receipt" }, "receipt"],
    [{ ...primaryPhoto, kind: "mailing", is_mailing_proof: true, has_messaging_ui: true, visual_type: "mailing_proof_screenshot" }, "mailing"],
    [{ ...primaryPhoto, kind: "unknown", confidence: "low", visual_type: "unknown" }, ""]
  ]) {
    const routerDiagnostic = {};
    const scenarioContent = Buffer.from("synthetic-" + value.kind);
    const router = await api.primaryVisionDecisionForImage(file, scenarioContent, { post: async (url, options) => {
      assert.strictEqual(url, provider.url);
      const schema = options.data.response_format.json_schema.schema;
      assert.strictEqual(schema.additionalProperties, false);
      assert(!schema.properties.amount && !schema.properties.date);
      return reply(value);
    } }, config, logger, routerDiagnostic);
    const yandex = await api.primaryVisionDecisionForImage(file, scenarioContent, { post: async () => ({ statusCode: 200, data: { output_text: JSON.stringify(value) } }) }, { ...config, openRouterVisionEnabled: false }, logger, {});
    assert.strictEqual(api.primaryVisionDominantKind(router), expected);
    assert.strictEqual(api.primaryVisionDominantKind(router), api.primaryVisionDominantKind(yandex));
    assert.strictEqual(routerDiagnostic.primary_provider, "openrouter");
  }
  const photo = await api.requestOpenAiWorkPhotoCheck(file, content, { post: async () => reply({
    is_work_photo: true, is_document_or_screen: false, is_receipt_or_banking: false,
    has_visible_client: true, has_visible_service_area: true, kind: "hair", confidence: 0.98, evidence: []
  }) }, config, logger, {});
  assert.strictEqual(photo, "work", "valid photo must not hit the archive's undefined-variable failure");

  const date = api.expectedReceiptDate(config);
  const engine = { is_receipt: true, bank_or_provider: "synthetic-bank", operation_date: date, operation_time: "12:30",
    amount: 1900, currency: "RUB", status: "success", amount_label: "Итого", confidence: 0.98, ambiguity_reason: null };
  const result = await api.requestOpenAiReceiptVisionEngineV1(file, content, { post: async () => reply(engine) }, config, logger);
  assert.strictEqual(result.amount, 1900);
  assert.strictEqual(result.providerId, "openrouter");
  assert.strictEqual(api.normalizeReceiptAmount("1 900 руб."), 1900);
  assert.strictEqual(await api.requestOpenAiReceiptVisionEngineV1(file, content, { post: async () => reply(engine, "length") }, config, logger), undefined);
  assert.strictEqual(await api.requestOpenAiReceiptVisionEngineV1(file, content, { post: async () => reply({ ...engine, injected: "RAW_SECRET_SENTINEL" }) }, config, logger), undefined);
  const realSetTimeout = global.setTimeout;
  global.setTimeout = fn => { fn(); return 0; };
  try {
    for (const failure of [401, 403, 429, 500, "timeout"]) {
      let attempts = 0;
      const value = await api.requestOpenAiReceiptVisionEngineV1(file, content, { post: async url => {
        assert.strictEqual(url, provider.url); attempts++;
        if (failure === "timeout") throw new Error("timeout RAW_SECRET_SENTINEL");
        return { statusCode: failure, data: {} };
      } }, config, logger);
      assert.strictEqual(value, undefined);
      assert.strictEqual(attempts, [401, 403].includes(failure) ? 1 : 2, "existing engine retry bounds, no OpenAI fallback");
    }
  } finally { global.setTimeout = realSetTimeout; }
  async function extraction(routerEnabled, scenario) {
    const guard = loadTrackedAppWithGuard().__testGuard;
    const calls = [];
    const cfg = { ...config, openRouterVisionEnabled: routerEnabled, apiKey: "synthetic-ocr-key", folderId: "synthetic-folder" };
    const http = { post: async (url, options) => {
      if (url.includes("ocr.api.cloud.yandex.net")) {
        calls.push("ocr:" + options.data.model);
        const ocrDate = scenario.ocrDate || date;
        return { statusCode: 200, data: { result: { textAnnotation: {
          fullText: `Банк\nЧек по операции\nДата операции ${ocrDate.split("-").reverse().join(".")}\nСумма операции ${scenario.ocrAmount} ₽\nСтатус операции Исполнено`, blocks: []
        } } } };
      }
      const format = options.data.text ? options.data.text.format : options.data.response_format.json_schema;
      const parts = options.data.input || options.data.messages;
      const prompt = parts[0].content[0].text;
      const kind = format.name === "receipt_vision_engine_v1" ? "engine" : prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ") ? "date" : prompt.includes("ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА СУММЫ") ? "amount" : "legacy";
      calls.push(kind);
      const amount = kind === "engine" ? scenario.visionAmount : scenario.focusAmount;
      const operationDate = kind === "engine" ? scenario.visionDate || date : scenario.focusDate || date;
      const payload = format.schema.properties.operation_date
        ? { ...engine, amount, operation_date: operationDate, status: scenario.status || "success" }
        : { date: operationDate, time: "12:30", amount, amount_text: amount == null ? null : `${amount} RUB`,
            amount_label: amount == null ? null : "Итого", currency: amount == null ? "unknown" : "RUB", confidence: .98, ambiguity_reason: null };
      return url === provider.url ? reply(payload) : { statusCode: 200, data: { output_text: JSON.stringify(payload) } };
    } };
    const value = await guard.validateReceiptDate(file, content, http, cfg, logger);
    return { value, calls };
  }
  const wrongDate = (Number(date.slice(0, 4)) - 2) + date.slice(4);
  for (const scenario of [
    { name: "agreement", visionAmount: 1900, ocrAmount: 1900, focusAmount: 1900, ok: true },
    { name: "amount-targeted", visionAmount: 600, ocrAmount: 2600, focusAmount: 600, ok: true },
    { name: "amount-control", visionAmount: 600, ocrAmount: 2600, focusAmount: null, ok: false },
    { name: "date-targeted", visionAmount: 900, ocrAmount: 900, focusAmount: 900, visionDate: wrongDate, focusDate: date, ok: true },
    { name: "wrong-date", visionAmount: 900, ocrAmount: 900, focusAmount: 900, visionDate: wrongDate, ocrDate: wrongDate, focusDate: wrongDate, ok: false },
    { name: "failed-status", visionAmount: 900, ocrAmount: 900, focusAmount: 900, status: "failed", ok: false }
  ]) {
    const before = await extraction(false, scenario);
    const after = await extraction(true, scenario);
    const fields = value => ({ ok: value.ok, amount: value.receiptAmount, date: value.receiptDate, time: value.receiptTime, reason: value.reason });
    assert.deepStrictEqual(fields(after.value), fields(before.value), scenario.name + ": production extraction outcome parity");
    assert.deepStrictEqual(after.calls, before.calls, scenario.name + ": provider/OCR call order and count parity");
    assert.strictEqual(after.value.ok, scenario.ok, scenario.name);
    if (scenario.name === "amount-control") assert.strictEqual(after.value.receiptAmount, undefined);
  }
  const fs = require("fs"), crypto = require("crypto");
  const source = fs.readFileSync(require("path").join(__dirname, "..", "TarsReportApp.js"), "utf8");
  // Exact function hashes from develop 20643ddbd5b392232a1e84ce828e91d304f3f189.
  // Do not require historical Git objects in shallow CI checkouts.
  const baselineHashes = {
    normalizeReceiptAmount: "a64e44d3b386a37e3531c59b6911874b97ddfb09b46e00714dfb38a8b3572b07",
    extractReceiptIdentity: "cfebc334b040a5039ad99b3059a8f0b74edb5ddaa14436d3af4ab56947251b94",
    findReceiptIdentityDuplicate: "e2318f161e36dbe654d065e6027d42fac5bebda26a2b606e6fb4e77172c0d0b2",
    writeIndex: "d8457c8972446ae4c7a77a21d6c3915f7971e7af08d89501de539950e7401a91",
    receiptAmountHasIndependentConfirmation: "46a02549467dd40b098d2787daa6ee10bb68a66b294fdbca04b87b49a36c9753",
    confirmedReceiptAmount: "7bce1c6d8e5e9884b8d27aad1c849c247dca5c5ab6fa3633c4aee140cea09887",
    validateReceiptStrict: "0134b13c57a0862d9de4820fdd0a08b05e05006eb477b7c8b018356d2d422ada",
    confirmedTransferSummaryForUser: "6a062eb2499a53c5d0d97d04565b6e6ec2b3d00678762d7614bc08f8868dbdbc",
    receiptLedgerSummaryForUser: "44171c9092994c0adf4acd4004d1a690ee873d54759fc77083d80a165afcdc3d"
  };
  function functionText(text, name) {
    const start = text.indexOf("function " + name + "(");
    assert(start >= 0, name);
    const end = text.indexOf("\n    function ", start + 1);
    const asyncEnd = text.indexOf("\n    async function ", start + 1);
    return text.slice(start, Math.min(...[end, asyncEnd].filter(v => v >= 0)));
  }
  for (const [name, expected] of Object.entries(baselineHashes)) {
    assert.strictEqual(crypto.createHash("sha256").update(functionText(source, name)).digest("hex"), expected, name + ": financial/duplicate rules must not change");
  }
  assert(!source.includes("DEBUG parse") && !source.includes("DEBUG responseText"));
  console.log("PASS: OpenRouter credential/privacy isolation, strict handling, routing/photo parity, extraction/OCR/targeted parity and immutable financial guards");
})().catch(error => { console.error(error); process.exitCode = 1; });
