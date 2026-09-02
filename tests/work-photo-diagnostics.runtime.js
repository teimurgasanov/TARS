"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const EXPECTED_FIELDS = [
  "source_type",
  "primary_kind",
  "primary_is_receipt",
  "primary_is_document",
  "primary_is_work_photo",
  "primary_is_mailing",
  "dedicated_result",
  "dedicated_is_work_photo",
  "dedicated_has_visible_client",
  "dedicated_has_visible_service_area",
  "dedicated_kind",
  "dedicated_document_block",
  "dedicated_banking_block",
  "final_classification",
  "final_reason",
  "processing_stage"
];

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
    confidence: "medium",
    is_banking: false,
    is_document: false,
    has_visible_client: true,
    has_visible_service_result: true,
    has_payment_ui: false,
    has_receipt_text: false,
    ...overrides
  };
}

function dedicatedPayload(overrides = {}) {
  return {
    is_work_photo: true,
    is_document_or_screen: false,
    is_receipt_or_banking: false,
    has_visible_client: true,
    has_visible_service_area: true,
    kind: "hair",
    confidence: 0.9,
    evidence: ["not persisted"],
    ...overrides
  };
}

function classifierProvider(primary, dedicated) {
  return {
    async post(_url, options) {
      const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
      const payload = prompt.includes("строгую классификацию изображения") ? dedicated : primary;
      return { statusCode: 200, data: { output_text: JSON.stringify(payload) } };
    }
  };
}

function eventLogger(events) {
  return {
    info(message) {
      if (String(message).startsWith("PERSONAL_IMAGE_CLASSIFICATION_V1 ")) events.push(String(message));
    },
    warn() {},
    error() {}
  };
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert.ok(guard, "TARS test guard must be available");
  for (const name of [
    "personalImageKindForPreUpload",
    "requestOpenAiWorkPhotoCheck",
    "createPersonalImageClassificationDiagnostic",
    "personalImageDiagnosticSourceType",
    "setPersonalImageFinalDiagnostic",
    "safePersonalImageDiagnosticPayload",
    "emitPersonalImageClassificationDiagnostic"
  ]) assert.strictEqual(typeof guard[name], "function", `${name} must be testable`);

  const config = {
    openaiApiKey: "test-key",
    openaiReceiptModel: "gpt-4.1-mini",
    timeZone: "Europe/Samara",
    cutoffHour: 0
  };
  const quietLogger = { info() {}, warn() {}, error() {} };

  // A. An obvious hair work remains accepted by the existing strict tuple.
  const obviousDiagnostic = guard.createPersonalImageClassificationDiagnostic("original");
  const obviousResult = await guard.requestOpenAiWorkPhotoCheck(
    { _id: "obvious-work", name: "work.png", type: "image/png" },
    Buffer.from("obvious-hair-work"),
    classifierProvider(primaryPayload(), dedicatedPayload()),
    config,
    quietLogger,
    obviousDiagnostic
  );
  assert.strictEqual(obviousResult, "work");
  assert.strictEqual(obviousDiagnostic.dedicated_result, "work");
  assert.strictEqual(obviousDiagnostic.dedicated_has_visible_service_area, true);

  // B. A portrait with strong primary hair semantics but no dedicated service-area flag
  // must retain today's fail-closed UNKNOWN decision while explaining that exact gap.
  const portraitDiagnostic = guard.createPersonalImageClassificationDiagnostic("original");
  const portraitFile = { _id: "portrait-work", name: "portrait.png", type: "image/png" };
  const portraitContent = Buffer.from("portrait-hair-work");
  const portraitProvider = classifierProvider(primaryPayload(), dedicatedPayload({ has_visible_service_area: false }));
  const primaryKind = await guard.personalImageKindForPreUpload(portraitFile, portraitContent, portraitProvider, config, quietLogger, portraitDiagnostic);
  const portraitResult = await guard.requestOpenAiWorkPhotoCheck(portraitFile, portraitContent, portraitProvider, config, quietLogger, portraitDiagnostic);
  assert.strictEqual(primaryKind, "unknown", "medium-confidence primary result must continue through fallback");
  assert.strictEqual(portraitResult, "", "diagnostics must not relax the work-photo decision");
  assert.strictEqual(portraitDiagnostic.primary_is_work_photo, true);
  assert.strictEqual(portraitDiagnostic.dedicated_is_work_photo, true);
  assert.strictEqual(portraitDiagnostic.dedicated_has_visible_client, true);
  assert.strictEqual(portraitDiagnostic.dedicated_has_visible_service_area, false);
  assert.strictEqual(portraitDiagnostic.dedicated_kind, "hair");
  assert.strictEqual(portraitDiagnostic.dedicated_result, "unknown");
  guard.setPersonalImageFinalDiagnostic(portraitDiagnostic, "unknown", "work-photo-not-strictly-confirmed", "final");
  const portraitEvents = [];
  guard.emitPersonalImageClassificationDiagnostic(eventLogger(portraitEvents), portraitDiagnostic);
  assert.strictEqual(portraitEvents.length, 1);
  assert.match(portraitEvents[0], /primary_kind=photo/);
  assert.match(portraitEvents[0], /dedicated_has_visible_service_area=false/);
  assert.match(portraitEvents[0], /final_reason=work-photo-not-strictly-confirmed/);

  // C/D. Financial screens keep their existing hard block even when a person is visible.
  for (const [label, overrides] of [
    ["bank-screen", { is_document_or_screen: true }],
    ["receipt-on-phone", { is_receipt_or_banking: true }]
  ]) {
    const diagnostic = guard.createPersonalImageClassificationDiagnostic("original");
    const result = await guard.requestOpenAiWorkPhotoCheck(
      { _id: label, name: `${label}.png`, type: "image/png" },
      Buffer.from(label),
      classifierProvider(primaryPayload(), dedicatedPayload(overrides)),
      config,
      quietLogger,
      diagnostic
    );
    assert.strictEqual(result, "document", `${label} must never become WORK_PHOTO`);
    assert.strictEqual(diagnostic.dedicated_result, "document");
  }

  // E/F. Source normalization records only a bounded enum, never a URL or identifier.
  assert.strictEqual(guard.personalImageDiagnosticSourceType({
    __mediaV2PreviewOnly: true,
    attachments: [{ imageUrl: "https://private.invalid/preview.png" }]
  }), "preview_fallback");
  assert.strictEqual(guard.personalImageDiagnosticSourceType({
    file: { _id: "private-upload", name: "private.png", type: "image/png" },
    attachments: [{ imageUrl: "https://private.invalid/preview.png" }]
  }), "original");

  // Privacy: unknown keys and attacker-controlled strings must be discarded before log output.
  const contaminated = {
    ...portraitDiagnostic,
    rawText: "RAW_OCR_PRIVATE_TEXT",
    rawProviderResponse: "PROVIDER_PRIVATE_RESPONSE",
    message: "FREE_TEXT_PRIVATE",
    username: "PRIVATE_USERNAME",
    roomId: "PRIVATE_ROOM_ID",
    messageId: "PRIVATE_MESSAGE_ID",
    uploadId: "PRIVATE_UPLOAD_ID",
    imageUrl: "https://private.invalid/image.png",
    filePath: "/private/path/image.png",
    primary_kind: "https://private.invalid/not-an-enum",
    final_reason: "arbitrary free text"
  };
  const safe = guard.safePersonalImageDiagnosticPayload(contaminated);
  assert.deepStrictEqual(Object.keys(safe), EXPECTED_FIELDS);
  assert.strictEqual(safe.primary_kind, "unknown");
  assert.strictEqual(safe.final_reason, "unknown");
  const privacyEvents = [];
  guard.emitPersonalImageClassificationDiagnostic(eventLogger(privacyEvents), contaminated);
  assert.strictEqual(privacyEvents.length, 1);
  for (const forbidden of [
    "RAW_OCR_PRIVATE_TEXT",
    "PROVIDER_PRIVATE_RESPONSE",
    "FREE_TEXT_PRIVATE",
    "PRIVATE_USERNAME",
    "PRIVATE_ROOM_ID",
    "PRIVATE_MESSAGE_ID",
    "PRIVATE_UPLOAD_ID",
    "private.invalid",
    "/private/path"
  ]) assert.ok(!privacyEvents[0].includes(forbidden), `diagnostic leaked ${forbidden}`);
  const loggedKeys = privacyEvents[0].replace(/^PERSONAL_IMAGE_CLASSIFICATION_V1\s+/, "").split(/\s+/).map((field) => field.split("=")[0]);
  assert.deepStrictEqual(loggedKeys, EXPECTED_FIELDS, "event must contain only whitelist fields");

  const productionSource = fs.readFileSync(path.resolve(__dirname, "..", "TarsReportApp.js"), "utf8");
  const processBlock = productionSource.slice(productionSource.indexOf("async function processPersonalMediaV2"), productionSource.indexOf("function isTodayTransferSumRequest"));
  assert.match(processBlock, /if \(!handled && forcedIntent !== "receipt"\)[\s\S]*emitPersonalImageClassificationDiagnostic/,
    "final UNKNOWN must emit one normalized diagnostic event");
  assert.doesNotMatch(processBlock, /evaluateRules\(|resolveConflicts\(|makeDecision\(|runOfflineComparison\(|runOfflineDataset\(/,
    "diagnostics must not activate Scanner 2.0 decision logic");

  console.log("PASS: work-photo diagnostics explain false negatives without changing classification or leaking private data");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
