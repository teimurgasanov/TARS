const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf('const IMAGE_CLASSIFICATION_SCHEMA_VERSION = "personal-image-classification-v1"');
const end = source.indexOf("const RECEIPT_VISUAL_CRITERIA", start);
assert(start >= 0 && end > start, "ImageClassificationV1 implementation block not found");

const implementation = source.slice(start, end);
const loadImplementation = new Function(
  "exactHash",
  "receiptImageMimeType",
  "bytesToBase64",
  "openAiReceiptOutputText",
  `${implementation}
  return {
    IMAGE_CLASSIFICATION_SCHEMA_VERSION,
    IMAGE_CLASSIFICATION_MODEL,
    IMAGE_CLASSIFICATION_V1_SCHEMA,
    parseImageClassification,
    requestOpenAiImageClassification
  };`
);

const api = loadImplementation(
  (content) => Buffer.from(content).toString("hex"),
  (file) => String(file && file.type || "").toLowerCase().includes("png") ? "image/png" : "image/jpeg",
  (content) => Buffer.from(content).toString("base64"),
  (payload) => {
    if (payload && payload.output_text) return String(payload.output_text);
    const values = [];
    for (const item of payload && payload.output || []) {
      for (const part of item && item.content || []) {
        if (part && part.text) values.push(String(part.text));
      }
    }
    return values.join("\n");
  }
);

const safety = (overrides = {}) => ({
  is_banking: false,
  is_document: false,
  has_payment_ui: false,
  has_receipt_text: false,
  ...overrides
});

const classification = (overrides = {}) => ({
  schema_version: "personal-image-classification-v1",
  kind: "other",
  confidence: 0.5,
  work_photo: null,
  safety: safety(),
  reason_code: "OTHER_IMAGE",
  ...overrides
});

const validCases = [
  classification({ kind: "receipt", confidence: 0.98, safety: safety({ is_banking: true, has_payment_ui: true, has_receipt_text: true }), reason_code: "RECEIPT_OR_PAYMENT" }),
  classification({ kind: "work_photo", confidence: 0.94, work_photo: { category: "hair", client_type: "female", service: "coloring" }, reason_code: "WORK_PHOTO_HAIR" }),
  classification({ kind: "work_photo", confidence: 0.91, work_photo: { category: "hair", client_type: "male", service: "haircut" }, reason_code: "WORK_PHOTO_HAIR" }),
  classification({ kind: "work_photo", confidence: 0.9, work_photo: { category: "nails", client_type: "unknown", service: "nails" }, reason_code: "WORK_PHOTO_NAILS" }),
  classification({ kind: "work_photo", confidence: 0.89, work_photo: { category: "brows", client_type: "female", service: "brows" }, reason_code: "WORK_PHOTO_BROWS" }),
  classification({ kind: "mailing_proof", confidence: 0.93, reason_code: "MAILING_PROOF" }),
  classification({ kind: "report_or_screenshot", confidence: 0.88, reason_code: "REPORT_OR_SCREENSHOT" }),
  classification({ kind: "other", confidence: 0.8, reason_code: "OTHER_IMAGE" }),
  classification({ confidence: 0 }),
  classification({ confidence: 1 })
];

for (const value of validCases) {
  const parsedObject = api.parseImageClassification(value);
  assert.strictEqual(parsedObject.valid, true, `valid object rejected: ${value.kind}`);
  const parsedJson = api.parseImageClassification(JSON.stringify(value));
  assert.strictEqual(parsedJson.valid, true, `valid JSON rejected: ${value.kind}`);
}

const invalidCases = [
  classification({ confidence: -0.01 }),
  classification({ confidence: 1.01 }),
  classification({ kind: "portrait" }),
  "{not-json",
  classification({ kind: "work_photo", work_photo: null, reason_code: "WORK_PHOTO_OTHER" }),
  classification({ kind: "receipt", work_photo: { category: "hair", client_type: "female", service: "coloring" }, reason_code: "RECEIPT_OR_PAYMENT" }),
  { ...classification(), unexpected: true },
  classification({ kind: "work_photo", work_photo: { category: "hair", client_type: "female", service: "airtouch" }, reason_code: "WORK_PHOTO_HAIR" })
];

for (const value of invalidCases) {
  assert.strictEqual(api.parseImageClassification(value).valid, false, "invalid classification was accepted");
}

assert.strictEqual(api.IMAGE_CLASSIFICATION_MODEL, "gpt-5.4-nano-2026-03-17");
assert.strictEqual(api.IMAGE_CLASSIFICATION_V1_SCHEMA.additionalProperties, false);
assert.strictEqual(api.IMAGE_CLASSIFICATION_V1_SCHEMA.properties.work_photo.anyOf[1].additionalProperties, false);
assert.strictEqual(api.IMAGE_CLASSIFICATION_V1_SCHEMA.properties.safety.additionalProperties, false);

function responseFor(value, statusCode = 200) {
  return {
    statusCode,
    data: { output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }
  };
}

const config = { openaiApiKey: "test-key" };
const file = { name: "canonical.png", type: "image/png" };

async function run() {
  let capturedRequest;
  let successCalls = 0;
  const successHttp = {
    post: async (_url, request) => {
      successCalls += 1;
      capturedRequest = request;
      return responseFor(validCases[0]);
    }
  };
  const imageBytes = Buffer.from([1, 2, 3, 4]);
  const result = await api.requestOpenAiImageClassification(file, imageBytes, successHttp, config);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(successCalls, 1);
  assert.strictEqual(capturedRequest.data.model, "gpt-5.4-nano-2026-03-17");
  assert.strictEqual(capturedRequest.data.store, false);
  assert.deepStrictEqual(capturedRequest.data.reasoning, { effort: "none" });
  assert.strictEqual(capturedRequest.data.text.format.type, "json_schema");
  assert.strictEqual(capturedRequest.data.text.format.strict, true);
  assert.strictEqual(capturedRequest.data.text.format.schema.additionalProperties, false);
  assert.strictEqual(capturedRequest.data.max_output_tokens, 220);
  const imageInput = capturedRequest.data.input[0].content.find((part) => part.type === "input_image");
  assert.strictEqual(imageInput.image_url, `data:image/png;base64,${imageBytes.toString("base64")}`);

  const cached = await api.requestOpenAiImageClassification({ name: "different-name.png", type: "image/png" }, Buffer.from(imageBytes), successHttp, config);
  assert.strictEqual(cached.valid, true);
  assert.strictEqual(successCalls, 1, "same exactHash must use the classification cache regardless of filename");

  let timeoutCalls = 0;
  const timeoutLogs = [];
  const timeoutResult = await api.requestOpenAiImageClassification(file, Buffer.from([5]), {
    post: async () => {
      timeoutCalls += 1;
      const error = new Error("request timed out");
      error.code = "ETIMEDOUT";
      throw error;
    }
  }, config, { warn: (value) => timeoutLogs.push(value) });
  assert.strictEqual(timeoutResult.valid, false);
  assert.strictEqual(timeoutResult.errorCode, "PROVIDER_TIMEOUT");
  assert.strictEqual(timeoutCalls, 2, "timeout must be retried exactly once");
  assert(timeoutLogs.every((line) => !line.includes("test-key") && !line.includes("base64")), "logs must not expose credentials or image data");

  for (const statusCode of [429, 500]) {
    let calls = 0;
    const retryResult = await api.requestOpenAiImageClassification(file, Buffer.from([statusCode % 251, 7]), {
      post: async () => {
        calls += 1;
        return calls === 1 ? responseFor({}, statusCode) : responseFor(validCases[7]);
      }
    }, config);
    assert.strictEqual(retryResult.valid, true, `HTTP ${statusCode} retry did not recover`);
    assert.strictEqual(calls, 2, `HTTP ${statusCode} must be retried exactly once`);
  }

  let badRequestCalls = 0;
  const badRequest = await api.requestOpenAiImageClassification(file, Buffer.from([8, 8]), {
    post: async () => {
      badRequestCalls += 1;
      return responseFor({}, 400);
    }
  }, config);
  assert.strictEqual(badRequest.valid, false);
  assert.strictEqual(badRequestCalls, 1, "non-retryable HTTP errors must not be retried");

  const productionBlocks = [
    ["async function personalImageKindForPreUpload(file", "async function personalImageIsReceiptForPreUpload"],
    ["async function shouldForwardConfirmedWorkPhoto", "async function detectPersonalMailingProof"],
    ["async function detectPersonalMailingProof", "async function fastForwardPersonalReportPhotos"],
    ["async function protectedRoomForPersonalFile", "function normalizedUsername"],
    ["async function validateReceiptStrict", "function personalArchiveMessageAssociation"]
  ];
  for (const [from, to] of productionBlocks) {
    const blockStart = source.indexOf(from);
    const blockEnd = source.indexOf(to, blockStart);
    assert(blockStart >= 0 && blockEnd > blockStart, `production block not found: ${from}`);
    const block = source.slice(blockStart, blockEnd);
    assert(!block.includes("requestOpenAiImageClassification"), `${from} unexpectedly uses the new classifier`);
    assert(!block.includes("parseImageClassification"), `${from} unexpectedly consumes the new classification result`);
  }

  const publicRequestOccurrences = source.match(/requestOpenAiImageClassification\s*\(/g) || [];
  assert.strictEqual(publicRequestOccurrences.length, 1, "new classifier must have no production call sites");

  console.log("PASS: ImageClassificationV1 contract, request retries, cache and routing isolation");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
