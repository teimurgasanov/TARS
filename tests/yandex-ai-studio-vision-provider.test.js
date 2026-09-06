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

const yandexPrimaryWorkPhoto = Object.fromEntries(
  Object.entries(primaryWorkPhoto).filter(([key]) => !["date", "amount", "amount_text", "amount_label", "status", "bank"].includes(key))
);

function yandexPrimary(overrides) {
  return { ...yandexPrimaryWorkPhoto, ...overrides };
}

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

  assert.strictEqual(typeof api.primaryImageVisionProviderForConfig, "function", "primary classification must have its own provider selector");
  const primaryProvider = api.primaryImageVisionProviderForConfig(yandexConfig);
  assert.strictEqual(primaryProvider.id, "yandex_ai_studio", "Yandex must replace OpenAI as production primary classification provider");
  assert.strictEqual(primaryProvider.url, YANDEX_URL);
  assert.strictEqual(primaryProvider.model, `gpt://${folderId}/qwen3.6-35b-a3b/latest`);

  const calls = [];
  const http = {
    post: async (url, request) => {
      calls.push({ url, request });
      if (request.data.text && request.data.text.format && request.data.text.format.name === "personal_image_classification_v1") {
        return responseFor(imageClassification);
      }
      if (request.data.text && request.data.text.format && request.data.text.format.name === "tars_primary_image_vision_v1") {
        return responseFor(yandexPrimaryWorkPhoto);
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

  const primaryCall = calls.find((call) => call.request.data.text && call.request.data.text.format && call.request.data.text.format.name === "tars_primary_image_vision_v1");
  assert(primaryCall, "primary Yandex request must be observable");
  assert.strictEqual(primaryCall.url, YANDEX_URL);
  assert.strictEqual(primaryCall.request.headers.Authorization, "Api-Key yandex-test-secret");
  assert.strictEqual(primaryCall.request.data.model, `gpt://${folderId}/qwen3.6-35b-a3b/latest`);
  assert.strictEqual(primaryCall.request.data.store, false);
  assert.strictEqual(primaryCall.request.data.text.format.strict, true);
  assert.strictEqual(primaryCall.request.data.text.format.schema.additionalProperties, false);
  for (const forbidden of ["date", "amount", "amount_text", "amount_label", "status", "bank"]) {
    assert(!primaryCall.request.data.text.format.schema.required.includes(forbidden), `primary classification must not request financial field ${forbidden}`);
    assert(!Object.prototype.hasOwnProperty.call(primaryCall.request.data.text.format.schema.properties, forbidden), `primary classification schema must omit ${forbidden}`);
  }
  const primaryImage = primaryCall.request.data.input[0].content.find((part) => part.type === "input_image");
  assert(primaryImage && primaryImage.image_url.startsWith("data:image/png;base64,"));
  assert.strictEqual(Object.prototype.hasOwnProperty.call(primaryImage, "detail"), false, "Yandex primary image input must use its compatible shape");

  const regionRegressionCalls = [];
  const regionRegression = await api.primaryVisionDecisionForImage(
    { id: "region-regression", name: "region.png", type: "image/png" },
    Buffer.from([34, 35, 36]),
    { post: async (url, request) => {
      regionRegressionCalls.push(url);
      if (/openai\.com/.test(url)) {
        return { statusCode: 403, data: { error: { type: "request_forbidden", code: "unsupported_country_region_territory" } } };
      }
      return responseFor(yandexPrimaryWorkPhoto);
    } },
    yandexConfig
  );
  assert.strictEqual(regionRegression.kind, "work_photo");
  assert.deepStrictEqual(regionRegressionCalls, [YANDEX_URL], "known OpenAI region failure must be avoided when Yandex primary is configured");

  const openAiRegionDiagnostic = {};
  const openAiRegionCalls = [];
  await assert.rejects(() => api.primaryVisionDecisionForImage(
    { id: "openai-region-proof", name: "region-proof.png", type: "image/png" },
    Buffer.from([37, 38, 39]),
    { post: async (url) => {
      openAiRegionCalls.push(url);
      return { statusCode: 403, data: { error: { type: "request_forbidden", code: "unsupported_country_region_territory" } } };
    } },
    { openaiApiKey: "openai-test-secret" },
    undefined,
    openAiRegionDiagnostic
  ), /HTTP 403/);
  assert.deepStrictEqual(openAiRegionCalls, ["https://api.openai.com/v1/responses"]);
  assert.strictEqual(openAiRegionDiagnostic.primary_provider, "openai");
  assert.strictEqual(openAiRegionDiagnostic.primary_error_class, "provider_4xx");
  assert.strictEqual(openAiRegionDiagnostic.primary_reason_code, "PRIMARY_OPENAI_REGION_UNAVAILABLE");

  const routeCases = [
    ["receipt", yandexPrimary({ kind: "receipt", service_kind: "none", has_payment_ui: true, has_receipt_layout: true, has_financial_document: true, has_document_layout: true, has_visible_client: false, has_visible_service_result: false, has_visible_hair_result: false, has_salon_context: false, is_receipt: true, is_banking: true, is_document: true, has_receipt_text: true, visual_type: "bank_receipt", service_type: "unknown" }), "receipt"],
    ["mailing", yandexPrimary({ kind: "mailing", service_kind: "none", has_visible_client: false, has_visible_service_result: false, has_visible_hair_result: false, has_salon_context: false, has_messaging_ui: true, is_mailing_proof: true, is_screenshot_of_chat: true, visual_type: "mailing_proof_screenshot", service_type: "unknown" }), "mailing"],
    ["unknown", yandexPrimary({ kind: "unknown", confidence: "low", service_kind: "none", has_visible_client: false, has_visible_service_result: false, has_visible_hair_result: false, has_salon_context: false, visual_type: "unknown", service_type: "unknown" }), ""]
  ];
  for (let index = 0; index < routeCases.length; index += 1) {
    const [name, payload, expectedRoute] = routeCases[index];
    const decision = await api.primaryVisionDecisionForImage(
      { id: `route-${name}`, name: `${name}.png`, type: "image/png" },
      Buffer.from([101 + index, 111 + index, 121 + index]),
      { post: async () => responseFor(payload) },
      yandexConfig
    );
    assert.strictEqual(api.primaryVisionDominantKind(decision), expectedRoute, `${name} routing must preserve the existing decision contract`);
  }

  const invalidCalls = [];
  const invalidDiagnostic = {};
  await assert.rejects(() => api.primaryVisionDecisionForImage(
    { id: "invalid-primary", name: "invalid.png", type: "image/png" },
    Buffer.from([131, 132, 133]),
    { post: async (url) => {
      invalidCalls.push(url);
      return responseFor({ ...yandexPrimaryWorkPhoto, amount: 1300 });
    } },
    yandexConfig,
    undefined,
    invalidDiagnostic
  ), /invalid response/);
  assert.deepStrictEqual(invalidCalls, [YANDEX_URL], "schema failure must not invoke OpenAI or retry a full Vision request");
  assert.strictEqual(invalidDiagnostic.primary_provider, "yandex_ai_studio");
  assert.strictEqual(invalidDiagnostic.primary_error_class, "parse");
  assert.strictEqual(invalidDiagnostic.primary_reason_code, "PRIMARY_PROVIDER_INVALID_RESPONSE");

  const retryCases = [
    ["429", () => ({ statusCode: 429, data: {} })],
    ["5xx", () => ({ statusCode: 503, data: {} })],
    ["timeout", () => { throw new Error("request timed out"); }]
  ];
  for (let index = 0; index < retryCases.length; index += 1) {
    const [name, firstResponse] = retryCases[index];
    const urls = [];
    const diagnostic = {};
    const decision = await api.primaryVisionDecisionForImage(
      { id: `retry-${name}`, name: `${name}.png`, type: "image/png" },
      Buffer.from([141 + index, 151 + index, 161 + index]),
      { post: async (url) => {
        urls.push(url);
        return urls.length === 1 ? firstResponse() : responseFor(yandexPrimaryWorkPhoto);
      } },
      yandexConfig,
      undefined,
      diagnostic
    );
    assert.strictEqual(decision.kind, "work_photo");
    assert.deepStrictEqual(urls, [YANDEX_URL, YANDEX_URL], `${name} must retry Yandex once and never invoke OpenAI`);
    assert.strictEqual(diagnostic.primary_attempt, 2);
  }

  const deniedCalls = [];
  const deniedDiagnostic = {};
  await assert.rejects(() => api.primaryVisionDecisionForImage(
    { id: "denied-primary", name: "denied.png", type: "image/png" },
    Buffer.from([171, 172, 173]),
    { post: async (url) => {
      deniedCalls.push(url);
      return { statusCode: 403, data: { error: { type: "permission_denied", code: "permission_denied" } } };
    } },
    yandexConfig,
    undefined,
    deniedDiagnostic
  ), /HTTP 403/);
  assert.deepStrictEqual(deniedCalls, [YANDEX_URL], "Yandex 4xx must fail open without retrying or invoking OpenAI");
  assert.strictEqual(deniedDiagnostic.primary_error_class, "provider_4xx");
  assert.strictEqual(deniedDiagnostic.primary_reason_code, "PRIMARY_PROVIDER_4XX");

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

  const receiptCall = calls[calls.length - 1];
  assert.strictEqual(receiptCall.request.data.text.format.type, "json_schema");
  assert.strictEqual(receiptCall.request.data.text.format.name, "tars_receipt_fields_v1");
  assert.strictEqual(receiptCall.request.data.text.format.strict, true);
  assert.strictEqual(receiptCall.request.data.text.format.schema.additionalProperties, false);
  assert.strictEqual(receiptCall.request.data.max_output_tokens, 4096, "Yandex receipt Vision must leave room for its default reasoning before strict JSON");
  assert(receiptCall.request.data.text.format.schema.required.includes("amount"));
  assert(receiptCall.request.data.text.format.schema.required.includes("date"));

  assert.strictEqual(calls.length, 4, "each isolated Vision path must make one provider call");
  for (const call of calls.filter((call) => call !== primaryCall && call !== receiptCall)) {
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
  const primaryProviderSource = sourceSection("async function requestPrimaryImageTypeVision", "function logReceiptStage");
  assert(primaryProviderSource.includes("primaryImageVisionProviderForConfig"), "primary classification must use its dedicated provider selector");
  assert(!primaryProviderSource.includes("receiptVisionProviderForConfig"), "primary classification must not reuse receipt provider routing");
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
