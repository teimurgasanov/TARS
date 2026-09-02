"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const EVENT_NAME = "PERSONAL_IMAGE_PIPELINE_V2";
const EXPECTED_FIELDS = [
  "source_type",
  "extension_enum",
  "declared_mime_enum",
  "detected_mime_by_magic_bytes",
  "mime_match",
  "size_bucket",
  "primary_cache",
  "dedicated_cache",
  "strict_cache",
  "primary_transport",
  "primary_parser",
  "primary_normalized_result",
  "dedicated_transport",
  "dedicated_parser",
  "dedicated_normalized_result",
  "dedicated_has_visible_client",
  "dedicated_has_visible_service_area",
  "dedicated_kind",
  "dedicated_document_block",
  "dedicated_banking_block",
  "receipt_openai_transport",
  "receipt_openai_parser",
  "receipt_openai_result",
  "yandex_layout_result",
  "strict_result",
  "vision_class",
  "vision_confidence",
  "vision_service_kind",
  "vision_safety_override",
  "vision_source_original_or_preview",
  "fallback_required",
  "final_route",
  "final_classification",
  "final_reason"
];

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const jpegBytes = Buffer.from([255, 216, 255, 224, 1, 2, 3, 4]);
const webpBytes = Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const heicBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.from([0, 0, 0, 0]), Buffer.from("heicmif1")]);
const heifBytes = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheif"), Buffer.from([0, 0, 0, 0]), Buffer.from("heifmif1")]);

function dedicatedPayload(overrides = {}) {
  return {
    is_work_photo: true,
    is_document_or_screen: false,
    is_receipt_or_banking: false,
    has_visible_client: true,
    has_visible_service_area: true,
    kind: "hair",
    confidence: 0.9,
    evidence: ["must-not-be-logged"],
    ...overrides
  };
}

function primaryPayload(overrides = {}) {
  return {
    is_receipt: false,
    has_readable_text: false,
    visual_type: "hair_work_photo",
    is_mailing_proof: false,
    service_type: "haircut",
    is_screenshot_of_chat: false,
    date: null,
    amount: null,
    amount_text: null,
    amount_label: null,
    status: "unknown",
    bank: null,
    kind: "work_photo",
    confidence: "high",
    is_banking: false,
    is_document: false,
    has_visible_client: true,
    has_visible_service_result: true,
    has_payment_ui: false,
    has_receipt_text: false,
    ...overrides
  };
}

function provider(payload) {
  return {
    async post() {
      return { statusCode: 200, data: { output_text: typeof payload === "string" ? payload : JSON.stringify(payload) } };
    }
  };
}

function loggerFor(events) {
  return {
    info(message) {
      if (String(message).startsWith(EVENT_NAME + " ")) events.push(String(message));
    },
    warn() {},
    error() {}
  };
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert.ok(guard, "TARS test guard must be available");
  for (const name of [
    "messageImageFiles",
    "personalImageDiagnosticSourceType",
    "createPersonalImageClassificationDiagnostic",
    "capturePersonalImageSourceTelemetry",
    "detectedPersonalImageMimeByMagicBytes",
    "safePersonalImagePipelineTelemetryPayload",
    "emitPersonalImagePipelineTelemetry",
    "personalImageKindForPreUpload",
    "requestOpenAiWorkPhotoCheck",
    "validateReceiptStrict"
  ]) assert.strictEqual(typeof guard[name], "function", `${name} must be testable`);

  const config = {
    openaiApiKey: "test-key",
    openaiReceiptModel: "gpt-4.1-mini",
    timeZone: "Europe/Samara",
    cutoffHour: 0
  };
  const quietLogger = { info() {}, warn() {}, error() {} };

  // 1. A declared JPEG carrying PNG bytes is reported, without changing the
  // existing strict work-photo decision.
  const pngMismatch = guard.createPersonalImageClassificationDiagnostic("original");
  const pngAsJpeg = { _id: "private-png", name: "private.png", type: "image/jpeg" };
  guard.capturePersonalImageSourceTelemetry(pngMismatch, pngAsJpeg, pngBytes);
  assert.strictEqual(pngMismatch.extension_enum, "png");
  assert.strictEqual(pngMismatch.declared_mime_enum, "jpeg");
  assert.strictEqual(pngMismatch.detected_mime_by_magic_bytes, "png");
  assert.strictEqual(pngMismatch.mime_match, false);
  const unchangedWorkDecision = await guard.requestOpenAiWorkPhotoCheck(
    pngAsJpeg,
    pngBytes,
    provider(dedicatedPayload()),
    config,
    quietLogger,
    pngMismatch
  );
  assert.strictEqual(unchangedWorkDecision, "work", "telemetry must not alter classification behavior");

  // 2. Matching JPEG metadata and bytes remain a positive match.
  const jpegMatch = guard.createPersonalImageClassificationDiagnostic("original");
  guard.capturePersonalImageSourceTelemetry(jpegMatch, { name: "private.jpg", type: "image/jpeg" }, jpegBytes);
  assert.strictEqual(jpegMatch.detected_mime_by_magic_bytes, "jpeg");
  assert.strictEqual(jpegMatch.mime_match, true);

  // 3. WebP with a wrong declaration is detected from RIFF/WEBP magic.
  const webpMismatch = guard.createPersonalImageClassificationDiagnostic("original");
  guard.capturePersonalImageSourceTelemetry(webpMismatch, { name: "private.webp", type: "image/jpeg" }, webpBytes);
  assert.strictEqual(webpMismatch.detected_mime_by_magic_bytes, "webp");
  assert.strictEqual(webpMismatch.mime_match, false);

  // 4. ISO-BMFF brands distinguish HEIC and HEIF without decoding content.
  const heicMismatch = guard.createPersonalImageClassificationDiagnostic("original");
  guard.capturePersonalImageSourceTelemetry(heicMismatch, { name: "private.heic", type: "image/jpeg" }, heicBytes);
  assert.strictEqual(heicMismatch.detected_mime_by_magic_bytes, "heic");
  assert.strictEqual(heicMismatch.mime_match, false);
  assert.strictEqual(guard.detectedPersonalImageMimeByMagicBytes(heifBytes), "heif");

  // 5. The canonical original wins over a generated JPEG preview.
  const originalMessage = {
    file: { _id: "private-original", name: "private.png", type: "image/png" },
    attachments: [{
      title: { value: "private.png", link: "/file-upload/private-original/private.png" },
      imageUrl: "/file-upload/private-preview/private.png"
    }]
  };
  const originalFiles = guard.messageImageFiles(originalMessage);
  assert.strictEqual(originalFiles.length, 1);
  assert.strictEqual(originalFiles[0]._id, "private-original");
  assert.strictEqual(guard.personalImageDiagnosticSourceType(originalMessage), "original");

  // 6. Preview-only processing is explicitly marked as fallback.
  const previewFallback = {
    __mediaV2PreviewOnly: true,
    attachments: [{ title: { value: "private.png" }, imageUrl: "/file-upload/private-preview/private.png" }]
  };
  assert.strictEqual(guard.personalImageDiagnosticSourceType(previewFallback), "preview_fallback");

  // 7. A provider timeout is normalized and the existing fail-closed result remains UNKNOWN.
  const timeoutDiagnostic = guard.createPersonalImageClassificationDiagnostic("original");
  const timeoutResult = await guard.requestOpenAiWorkPhotoCheck(
    { _id: "private-timeout", name: "private.jpg", type: "image/jpeg" },
    Buffer.concat([jpegBytes, Buffer.from("timeout-case")]),
    { async post() { throw new Error("request timeout"); } },
    config,
    quietLogger,
    timeoutDiagnostic
  );
  assert.strictEqual(timeoutResult, "");
  assert.strictEqual(timeoutDiagnostic.dedicated_transport, "timeout");
  assert.strictEqual(timeoutDiagnostic.dedicated_normalized_result, "unknown");

  // 8. Parsed JSON with the wrong schema is reported without being promoted to work.
  const malformedDiagnostic = guard.createPersonalImageClassificationDiagnostic("original");
  const malformedResult = await guard.requestOpenAiWorkPhotoCheck(
    { _id: "private-malformed", name: "private.jpg", type: "image/jpeg" },
    Buffer.concat([jpegBytes, Buffer.from("malformed-case")]),
    provider({
      is_work_photo: "true",
      is_document_or_screen: "false",
      is_receipt_or_banking: "false",
      has_visible_client: "true",
      has_visible_service_area: "true",
      kind: "hair"
    }),
    config,
    quietLogger,
    malformedDiagnostic
  );
  assert.strictEqual(malformedResult, "", "schema telemetry must not relax strict boolean gates");
  assert.strictEqual(malformedDiagnostic.dedicated_transport, "2xx");
  assert.strictEqual(malformedDiagnostic.dedicated_parser, "schema_mismatch");
  assert.strictEqual(malformedDiagnostic.dedicated_normalized_result, "unknown");

  const primaryContent = Buffer.concat([jpegBytes, Buffer.from("primary-case")]);
  const primaryFile = { _id: "private-primary", name: "private.jpg", type: "image/jpeg" };
  const primaryDiagnostic = guard.createPersonalImageClassificationDiagnostic("original");
  const primaryResult = await guard.personalImageKindForPreUpload(primaryFile, primaryContent, provider(primaryPayload()), config, quietLogger, primaryDiagnostic);
  assert.strictEqual(primaryResult, "photo");
  assert.strictEqual(primaryDiagnostic.primary_cache, "miss");
  assert.strictEqual(primaryDiagnostic.primary_transport, "2xx");
  assert.strictEqual(primaryDiagnostic.primary_parser, "parsed");
  assert.strictEqual(primaryDiagnostic.primary_normalized_result, "work_photo");
  assert.strictEqual(primaryDiagnostic.vision_class, "work_photo");
  assert.strictEqual(primaryDiagnostic.vision_confidence, "high");
  assert.strictEqual(primaryDiagnostic.vision_service_kind, "hair");
  assert.strictEqual(primaryDiagnostic.fallback_required, false);
  const cachedPrimaryDiagnostic = guard.createPersonalImageClassificationDiagnostic("original");
  await guard.personalImageKindForPreUpload(primaryFile, primaryContent, provider(primaryPayload()), config, quietLogger, cachedPrimaryDiagnostic);
  assert.strictEqual(cachedPrimaryDiagnostic.primary_cache, "hit");
  assert.strictEqual(cachedPrimaryDiagnostic.primary_normalized_result, "work_photo");

  const primaryTimeoutDiagnostic = guard.createPersonalImageClassificationDiagnostic("original");
  const primaryTimeoutResult = await guard.personalImageKindForPreUpload(
    { _id: "private-primary-timeout", name: "private.jpg", type: "image/jpeg" },
    Buffer.concat([jpegBytes, Buffer.from("primary-timeout-case")]),
    { async post() { throw new Error("provider timed out"); } },
    config,
    quietLogger,
    primaryTimeoutDiagnostic
  );
  assert.strictEqual(primaryTimeoutResult, "unknown");
  assert.strictEqual(primaryTimeoutDiagnostic.primary_transport, "timeout");
  assert.strictEqual(primaryTimeoutDiagnostic.primary_normalized_result, "unknown");

  // Cache telemetry records the first effective lookup, not the later diagnostic copy.
  const cacheContent = Buffer.concat([jpegBytes, Buffer.from("cache-case")]);
  const cacheFile = { _id: "private-cache", name: "private.jpg", type: "image/jpeg" };
  const firstCache = guard.createPersonalImageClassificationDiagnostic("original");
  await guard.requestOpenAiWorkPhotoCheck(cacheFile, cacheContent, provider(dedicatedPayload()), config, quietLogger, firstCache);
  assert.strictEqual(firstCache.dedicated_cache, "miss");
  const secondCache = guard.createPersonalImageClassificationDiagnostic("original");
  await guard.requestOpenAiWorkPhotoCheck(cacheFile, cacheContent, provider(dedicatedPayload()), config, quietLogger, secondCache);
  assert.strictEqual(secondCache.dedicated_cache, "hit");

  const strictContent = Buffer.concat([jpegBytes, Buffer.from("strict-cache-case")]);
  const strictFile = { _id: "private-strict", name: "private.jpg", type: "image/jpeg" };
  const firstStrict = guard.createPersonalImageClassificationDiagnostic("original");
  await guard.validateReceiptStrict(strictFile, strictContent, {}, { timeZone: "Europe/Samara", cutoffHour: 0 }, quietLogger, void 0, firstStrict);
  assert.strictEqual(firstStrict.strict_cache, "miss");
  const secondStrict = guard.createPersonalImageClassificationDiagnostic("original");
  await guard.validateReceiptStrict(strictFile, strictContent, {}, { timeZone: "Europe/Samara", cutoffHour: 0 }, quietLogger, void 0, secondStrict);
  assert.strictEqual(secondStrict.strict_cache, "hit");

  // 9. Privacy: only fixed keys and bounded enums may reach the event.
  const contaminated = {
    ...pngMismatch,
    source_type: "https://private.invalid/source",
    rawText: "RAW_OCR_PRIVATE_TEXT",
    rawProviderResponse: "RAW_PROVIDER_PRIVATE",
    message: "FREE_TEXT_PRIVATE",
    username: "PRIVATE_USERNAME",
    roomId: "PRIVATE_ROOM_ID",
    messageId: "PRIVATE_MESSAGE_ID",
    uploadId: "PRIVATE_UPLOAD_ID",
    imageUrl: "https://private.invalid/image.png",
    filePath: "/private/path/image.png",
    originalName: "PRIVATE_FILENAME.png"
  };
  const safe = guard.safePersonalImagePipelineTelemetryPayload(contaminated);
  assert.deepStrictEqual(Object.keys(safe), EXPECTED_FIELDS);
  assert.strictEqual(safe.source_type, "unknown");
  const events = [];
  guard.emitPersonalImagePipelineTelemetry(loggerFor(events), contaminated);
  assert.strictEqual(events.length, 1);
  const loggedKeys = events[0].replace(new RegExp("^" + EVENT_NAME + "\\s+"), "").split(/\s+/).map((field) => field.split("=")[0]);
  assert.deepStrictEqual(loggedKeys, EXPECTED_FIELDS);
  for (const forbidden of [
    "RAW_OCR_PRIVATE_TEXT",
    "RAW_PROVIDER_PRIVATE",
    "FREE_TEXT_PRIVATE",
    "PRIVATE_USERNAME",
    "PRIVATE_ROOM_ID",
    "PRIVATE_MESSAGE_ID",
    "PRIVATE_UPLOAD_ID",
    "private.invalid",
    "/private/path",
    "PRIVATE_FILENAME"
  ]) assert.ok(!events[0].includes(forbidden), `telemetry leaked ${forbidden}`);

  console.log("PASS: source/MIME/provider/cache telemetry is privacy-safe and classification-neutral");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
