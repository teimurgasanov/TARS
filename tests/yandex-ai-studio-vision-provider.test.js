"use strict";

const assert = require("assert");
const fs = require("fs");
const {
  loadTrackedAppWithGuard,
  readReceiptOcrConfigFromCanonicalBundle
} = require("./helpers/canonical-tars-runtime");

const loaded = loadTrackedAppWithGuard();
const api = loaded.__testGuard;
assert(api, "TARS test guard is unavailable");

const YANDEX_URL = "https://ai.api.cloud.yandex.net/v1/responses";
const folderId = "b1gvbvcq3d88ftip6rfq";
const yandexConfig = {
  yandexAiStudioApiKey: "yandex-test-secret",
  yandexAiStudioFolderId: folderId,
  yandexAiStudioModel: "qwen3.6-35b-a3b",
  openaiApiKey: "openai-test-secret",
  openaiReceiptModel: "gpt-4.1-mini",
  timeZone: "Europe/Samara",
  cutoffHour: 0
};

function responseFor(value, statusCode = 200) {
  return {
    statusCode,
    data: { output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }
  };
}

function requestReceiptVisionCheck(file, content, http, config, requiredDate, logger, retryAttempt = 0) {
  return api.requestOpenAiReceiptCheck(
    file,
    content,
    http,
    config,
    requiredDate,
    logger,
    retryAttempt,
    false,
    false,
    undefined,
    "receipt"
  );
}

const imageClassification = {
  schema_version: "personal-image-classification-v1",
  kind: "work_photo",
  confidence: 0.96,
  work_photo: { category: "hair", client_type: "female", service: "styling" },
  safety: { is_banking: false, is_document: false, has_payment_ui: false, has_receipt_text: false },
  reason_code: "WORK_PHOTO_HAIR"
};

const primaryWorkPhoto = {
  kind: "work_photo",
  confidence: "high",
  service_kind: "hair",
  has_payment_ui: false,
  has_receipt_layout: false,
  has_financial_document: false,
  has_document_layout: false,
  has_visible_client: true,
  has_visible_service_result: true,
  has_visible_hair_result: true,
  has_visible_nail_result: false,
  has_visible_brow_lash_result: false,
  has_salon_context: true,
  has_messaging_ui: false,
  is_receipt: false,
  is_banking: false,
  is_document: false,
  has_receipt_text: false,
  is_mailing_proof: false,
  is_screenshot_of_chat: false,
  visual_type: "hair_work_photo",
  service_type: "haircut",
  date: null,
  amount: null,
  amount_text: null,
  amount_label: null,
  status: "unknown",
  bank: null
};

const dedicatedWorkPhoto = {
  is_work_photo: true,
  is_document_or_screen: false,
  is_receipt_or_banking: false,
  has_visible_client: true,
  has_visible_service_area: true,
  kind: "hair",
  confidence: 0.97,
  evidence: ["visible hair result"]
};

const receipt = {
  is_receipt: true,
  has_readable_text: true,
  visual_type: "bank_receipt",
  is_mailing_proof: false,
  service_type: "unknown",
  is_screenshot_of_chat: false,
  date: "2026-09-03",
  amount: 1300,
  amount_text: "1 300 RUB",
  amount_label: "Amount",
  status: "success",
  bank: "TEST BANK"
};

const receiptEngine = {
  is_receipt: true,
  bank_or_provider: "TEST BANK",
  operation_date: "2026-09-03",
  operation_time: "18:20",
  amount: 1300,
  currency: "RUB",
  status: "success",
  amount_label: "Сумма операции",
  confidence: 0.97,
  ambiguity_reason: null
};

async function run() {
  const yandex = api.receiptVisionProviderForConfig(yandexConfig, "gpt-5.6-sol");
  assert.strictEqual(yandex.id, "yandex_ai_studio");
  assert.strictEqual(yandex.url, YANDEX_URL);
  assert.strictEqual(yandex.model, `gpt://${folderId}/qwen3.6-35b-a3b/latest`);
  assert.strictEqual(yandex.headers.Authorization, "Api-Key yandex-test-secret");
  assert.strictEqual(yandex.includeImageDetail, false);

  const openai = api.receiptVisionProviderForConfig({ openaiApiKey: "openai-test-secret" }, "gpt-5.6-sol");
  assert.strictEqual(openai.id, "openai");
  assert.strictEqual(openai.url, "https://api.openai.com/v1/responses");
  assert.strictEqual(openai.model, "gpt-5.6-sol");
  assert.strictEqual(openai.headers.Authorization, "Bearer openai-test-secret");
  assert.strictEqual(openai.includeImageDetail, true);

  const incompleteYandex = api.receiptVisionProviderForConfig({
    yandexAiStudioApiKey: "yandex-test-secret",
    openaiApiKey: "openai-test-secret"
  }, "gpt-4.1-mini");
  assert.strictEqual(incompleteYandex.id, "openai", "incomplete Yandex settings must preserve the OpenAI fallback");
  assert.strictEqual(api.normalizedYandexAiStudioModel("bad/model"), "qwen3.6-35b-a3b");

  const calls = [];
  const http = {
    post: async (url, request) => {
      calls.push({ url, request });
      if (request.data.text && request.data.text.format && request.data.text.format.name === "personal_image_classification_v1") {
        return responseFor(imageClassification);
      }
      if (request.data.text && request.data.text.format && request.data.text.format.name === "tars_primary_image_vision_v1") {
        return responseFor(primaryWorkPhoto);
      }
      const prompt = request.data.input[0].content.find((part) => part.type === "input_text").text;
      return responseFor(prompt.includes("is_work_photo") ? dedicatedWorkPhoto : receipt);
    }
  };

  const classification = await api.requestOpenAiImageClassification(
    { name: "classification.png", type: "image/png" },
    Buffer.from([21, 22, 23]),
    http,
    yandexConfig
  );
  assert.strictEqual(classification.valid, true);
  assert.strictEqual(classification.value.kind, "work_photo");

  const primary = await api.primaryVisionDecisionForImage(
    { id: "primary-upload", name: "primary.png", type: "image/png" },
    Buffer.from([31, 32, 33]),
    http,
    yandexConfig
  );
  assert.strictEqual(primary.kind, "work_photo");
  assert.strictEqual(primary.confidence, "high");

  const dedicated = await api.requestOpenAiWorkPhotoCheck(
    { name: "dedicated.png", type: "image/png" },
    Buffer.from([41, 42, 43]),
    http,
    yandexConfig
  );
  assert.strictEqual(dedicated, "work");

  const receiptCandidate = await requestReceiptVisionCheck(
    { name: "receipt.png", type: "image/png" },
    Buffer.from([51, 52, 53]),
    http,
    yandexConfig,
    "2026-09-03"
  );
  assert.strictEqual(receiptCandidate.receiptDate, "2026-09-03");
  assert.strictEqual(receiptCandidate.receiptAmount, 1300);
  assert.match(receiptCandidate.receiptAmountSource, /^yandex_ai_studio:/, "Yandex results must not be mislabeled as OpenAI evidence");

  const receiptCall = calls[calls.length - 1];
  assert.strictEqual(receiptCall.request.data.text.format.type, "json_schema");
  assert.strictEqual(receiptCall.request.data.text.format.name, "tars_receipt_fields_v1");
  assert.strictEqual(receiptCall.request.data.text.format.strict, true);
  assert.strictEqual(receiptCall.request.data.text.format.schema.additionalProperties, false);
  assert.strictEqual(receiptCall.request.data.max_output_tokens, 4096, "Yandex receipt Vision must leave room for its default reasoning before strict JSON");
  assert(receiptCall.request.data.text.format.schema.required.includes("amount"));
  assert(receiptCall.request.data.text.format.schema.required.includes("date"));

  assert.strictEqual(calls.length, 4, "each isolated Vision path must make one provider call");
  for (const call of calls.slice(0, 3)) {
    assert.strictEqual(call.url, "https://api.openai.com/v1/responses", "non-receipt Vision must preserve the base OpenAI provider");
    assert.strictEqual(call.request.headers.Authorization, "Bearer openai-test-secret");
    const image = call.request.data.input[0].content.find((part) => part.type === "input_image");
    assert(image && image.image_url.startsWith("data:image/png;base64,"));
    assert.strictEqual(image.detail, "high", "non-receipt OpenAI image input must preserve base detail=high");
  }
  assert.strictEqual(receiptCall.url, YANDEX_URL);
  assert.strictEqual(receiptCall.request.headers.Authorization, "Api-Key yandex-test-secret");
  assert.strictEqual(receiptCall.request.data.model, `gpt://${folderId}/qwen3.6-35b-a3b/latest`);
  assert.strictEqual(receiptCall.request.data.store, false);
  const receiptImage = receiptCall.request.data.input[0].content.find((part) => part.type === "input_image");
  assert(receiptImage && receiptImage.image_url.startsWith("data:image/png;base64,"));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(receiptImage, "detail"), false, "Yandex receipt image input must use its compatible shape");

  const engineRecoveryCalls = [];
  const recoveredEngine = await api.requestOpenAiReceiptVisionEngineV1(
    { name: "engine-recovery.png", type: "image/png" },
    Buffer.from([57, 58, 59]),
    { post: async (url, request) => {
      engineRecoveryCalls.push({ url, request });
      if (engineRecoveryCalls.length === 1) {
        return { statusCode: 200, data: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] } };
      }
      return responseFor(receiptEngine);
    } },
    yandexConfig,
    { warn: () => {} }
  );
  assert.strictEqual(recoveredEngine.amount, 1300, "one bounded Yandex recovery attempt must rescue an incomplete structured response");
  assert.deepStrictEqual(engineRecoveryCalls.map((call) => call.url), [YANDEX_URL, YANDEX_URL], "Yandex recovery must run before the unavailable OpenAI fallback");
  assert.deepStrictEqual(engineRecoveryCalls.map((call) => call.request.data.max_output_tokens), [4096, 8192]);
  assert.strictEqual(api.receiptVisionResponseIssue({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }, "", undefined), "incomplete_max_output_tokens");

  const personalGuardCalls = [];
  const personalGuardCandidate = await api.requestOpenAiReceiptCheck(
    { name: "personal-guard.png", type: "image/png" },
    Buffer.from([54, 55, 56]),
    { post: async (url, request) => {
      personalGuardCalls.push({ url, request });
      return responseFor(receipt);
    } },
    yandexConfig,
    "2026-09-03"
  );
  assert.strictEqual(personalGuardCandidate.receiptAmount, 1300);
  assert.deepStrictEqual(personalGuardCalls.map((call) => call.url), ["https://api.openai.com/v1/responses"], "personal-image receipt guard must never select Yandex");

  const fallbackCalls = [];
  const fallbackCandidate = await requestReceiptVisionCheck(
    { name: "fallback.png", type: "image/png" },
    Buffer.from([61, 62, 63]),
    {
      post: async (url, request) => {
        fallbackCalls.push({ url, request });
        if (url === YANDEX_URL) {
          return { statusCode: 200, data: { output: [{ content: [{ type: "output_text", text: "not-json" }] }] } };
        }
        return responseFor(receipt);
      }
    },
    yandexConfig,
    "2026-09-03",
    { warn: () => {} }
  );
  assert.strictEqual(fallbackCandidate.receiptAmount, 1300);
  assert.deepStrictEqual(fallbackCalls.map((call) => call.url), [YANDEX_URL, YANDEX_URL, "https://api.openai.com/v1/responses"], "malformed Yandex output must retry Yandex once before OpenAI fallback");
  assert.deepStrictEqual(fallbackCalls.slice(0, 2).map((call) => call.request.data.max_output_tokens), [4096, 8192], "the bounded retry must use the recovery output budget");
  assert.strictEqual(fallbackCalls[2].request.headers.Authorization, "Bearer openai-test-secret");
  assert.strictEqual(fallbackCalls[2].request.data.text.format.name, "tars_receipt_fields_v1");
  assert.strictEqual(fallbackCalls[2].request.data.max_output_tokens, 800, "OpenAI fallback keeps the existing bounded output budget");

  const schemaFallbackCalls = [];
  const schemaFallbackCandidate = await requestReceiptVisionCheck(
    { name: "schema-fallback.png", type: "image/png" },
    Buffer.from([64, 65, 66]),
    {
      post: async (url, request) => {
        schemaFallbackCalls.push({ url, request });
        return url === YANDEX_URL ? responseFor({ is_receipt: true }) : responseFor(receipt);
      }
    },
    yandexConfig,
    "2026-09-03",
    { warn: () => {} }
  );
  assert.strictEqual(schemaFallbackCandidate.receiptAmount, 1300);
  assert.deepStrictEqual(schemaFallbackCalls.map((call) => call.url), [YANDEX_URL, YANDEX_URL, "https://api.openai.com/v1/responses"], "schema-mismatched Yandex output must retry Yandex once before OpenAI fallback");

  const transportFallbackCalls = [];
  const transportFallbackCandidate = await requestReceiptVisionCheck(
    { name: "transport-fallback.png", type: "image/png" },
    Buffer.from([71, 72, 73]),
    {
      post: async (url, request) => {
        transportFallbackCalls.push({ url, request });
        return url === YANDEX_URL ? { statusCode: 500, data: {} } : responseFor(receipt);
      }
    },
    yandexConfig,
    "2026-09-03",
    { warn: () => {} },
    1
  );
  assert.strictEqual(transportFallbackCandidate.receiptDate, "2026-09-03");
  assert.deepStrictEqual(transportFallbackCalls.map((call) => call.url), [YANDEX_URL, "https://api.openai.com/v1/responses"], "exhausted Yandex transport retry must fall back once to OpenAI");

  const noOpenAiCalls = [];
  const noOpenAiCandidate = await requestReceiptVisionCheck(
    { name: "no-openai.png", type: "image/png" },
    Buffer.from([81, 82, 83]),
    { post: async (url) => {
      noOpenAiCalls.push(url);
      return { statusCode: 200, data: { output: [{ content: [{ type: "output_text", text: "not-json" }] }] } };
    } },
    { ...yandexConfig, openaiApiKey: "" },
    "2026-09-03",
    { warn: () => {} }
  );
  assert.strictEqual(noOpenAiCandidate, void 0, "without an OpenAI key malformed Yandex output must preserve the previous inconclusive result");
  assert.deepStrictEqual(noOpenAiCalls, [YANDEX_URL, YANDEX_URL]);

  const deniedFallbackCalls = [];
  const deniedFallbackCandidate = await requestReceiptVisionCheck(
    { name: "denied-fallback.png", type: "image/png" },
    Buffer.from([91, 92, 93]),
    { post: async (url) => {
      deniedFallbackCalls.push(url);
      return url === YANDEX_URL
        ? { statusCode: 200, data: { output: [{ content: [{ type: "output_text", text: "not-json" }] }] } }
        : { statusCode: 403, data: {} };
    } },
    yandexConfig,
    "2026-09-03",
    { warn: () => {} }
  );
  assert.strictEqual(deniedFallbackCandidate, void 0, "an unavailable OpenAI fallback must fail open to the unchanged OCR path");
  assert.deepStrictEqual(deniedFallbackCalls, [YANDEX_URL, YANDEX_URL, "https://api.openai.com/v1/responses"]);

  const config = await readReceiptOcrConfigFromCanonicalBundle({
    yandex_ai_studio_api_key: "runtime-yandex-key",
    yandex_ai_studio_folder_id: folderId,
    yandex_ai_studio_model: "qwen3.6-35b-a3b",
    openai_receipt_api_key: "runtime-openai-key"
  });
  assert.strictEqual(config.yandexAiStudioApiKey, "runtime-yandex-key");
  assert.strictEqual(config.yandexAiStudioFolderId, folderId);
  assert.strictEqual(config.yandexAiStudioModel, "qwen3.6-35b-a3b");
  assert.strictEqual(config.openaiApiKey, "runtime-openai-key");

  const source = fs.readFileSync("TarsReportApp.js", "utf8");
  const sourceSection = (startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert(start >= 0 && end > start, `source section not found: ${startMarker}`);
    return source.slice(start, end);
  };
  const nonReceiptVisionSections = [
    ["async function requestOpenAiImageClassificationUncached", "const imageClassificationCache"],
    ["async function requestOpenAiWorkPhotoCheckUncached", "const workPhotoCheckCache"],
    ["async function shouldForwardConfirmedWorkPhoto", "async function detectPersonalMailingProof"],
    ["async function isBlockedPersonalPhotoImage", "const personalImageKindCache"],
    ["async function requestPrimaryImageTypeVision", "async function primaryVisionDecisionForImage"],
    ["async function primaryVisionDecisionForImage", "function logReceiptStage"],
    ["async function personalImageKindForPreUploadUncached", "async function personalImageKindForPreUpload"],
    ["async function personalImageKindForPreUpload", "async function primaryVisionDecisionForPersonalMessage"],
  ];
  for (const [startMarker, endMarker] of nonReceiptVisionSections) {
    const section = sourceSection(startMarker, endMarker);
    assert(!section.includes("receiptVisionProviderForConfig"), `${startMarker} must not use the receipt/Yandex provider selector`);
    assert(!section.includes("receiptVisionProviderConfigured"), `${startMarker} must not use receipt/Yandex provider availability`);
    assert(!section.includes("receiptVisionProviderCacheKey"), `${startMarker} must not use receipt/Yandex provider cache identity`);
    assert(!section.includes("receiptVisionImageInput"), `${startMarker} must not use receipt/Yandex image request shaping`);
    assert(!section.includes("yandexAiStudioApiKey"), `${startMarker} must not read Yandex AI Studio credentials`);
    assert(!section.includes("YANDEX_AI_STUDIO_RESPONSES_URL"), `${startMarker} must not call Yandex AI Studio`);
  }
  const receiptCheckSource = sourceSection("async function requestOpenAiReceiptCheck", "function normalizedDate");
  assert.match(receiptCheckSource, /receiptProviderAllowed = diagnosticRole === "receipt" \|\| diagnosticRole === "receipt_dispute"/, "Yandex selection must be explicitly receipt-scoped");
  assert.match(receiptCheckSource, /receiptProviderAllowed \? receiptVisionProviderForConfig\(config, openAiModel\) : openAiVisionProviderForConfig\(config, openAiModel\)/, "non-receipt callers must retain OpenAI-only provider selection");
  assert(sourceSection("async function requestOpenAiReceiptVisionEngineV1", "function normalizeOpenAiStatus").includes("receiptVisionProviderForConfig"), "Receipt Vision Engine must retain the Yandex-first receipt selector");
  for (const id of ["yandex_ai_studio_api_key", "yandex_ai_studio_folder_id", "yandex_ai_studio_model"]) {
    const start = source.indexOf(`id: "${id}"`);
    const end = source.indexOf("});", start);
    assert(start >= 0 && end > start, `setting not found: ${id}`);
    const setting = source.slice(start, end);
    assert.match(setting, /public:\s*false/, `${id} must remain private`);
  }
  assert(!source.includes("yandex-test-secret"), "test secret must not enter production source");

  console.log("PASS: Yandex AI Studio is an isolated private Vision provider with unchanged OpenAI fallback");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
