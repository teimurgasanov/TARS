"use strict";

const assert = require("assert");
const fs = require("fs");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function primaryPayload(overrides = {}) {
  return {
    is_receipt: false,
    has_readable_text: false,
    visual_type: "unknown",
    is_mailing_proof: false,
    service_type: "unknown",
    is_screenshot_of_chat: false,
    date: null,
    amount: null,
    amount_text: null,
    amount_label: null,
    status: "unknown",
    bank: null,
    kind: "unknown",
    confidence: "low",
    is_banking: false,
    is_document: false,
    has_visible_client: false,
    has_visible_service_result: false,
    has_payment_ui: false,
    has_receipt_text: false,
    ...overrides
  };
}

function dedicatedPayload(overrides = {}) {
  return {
    is_work_photo: false,
    is_document_or_screen: false,
    is_receipt_or_banking: false,
    has_visible_client: false,
    has_visible_service_area: false,
    kind: "other",
    confidence: 0.4,
    evidence: [],
    ...overrides
  };
}

function provider(primary, dedicated = dedicatedPayload()) {
  const calls = [];
  const imageUrls = [];
  return {
    calls,
    imageUrls,
    async post(_url, options) {
      const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
      const role = prompt.includes("строгую классификацию изображения") ? "dedicated" : "primary";
      calls.push(role);
      const imageInput = options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content.find((item) => item && item.type === "input_image");
      imageUrls.push(String(imageInput && imageInput.image_url || "").slice(0, 32));
      return { statusCode: 200, data: { output_text: JSON.stringify(role === "dedicated" ? dedicated : primary) } };
    }
  };
}

function image(label) {
  return {
    file: { _id: `vision-${label}`, id: `vision-${label}`, name: `${label}.png`, type: "image/png" },
    content: Buffer.from(`vision-dominant-${label}`)
  };
}

const config = {
  openaiApiKey: "test-key",
  openaiReceiptModel: "gpt-4.1-mini",
  timeZone: "Europe/Samara",
  cutoffHour: 0
};
const logger = { info() {}, warn() {}, error() {} };

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  for (const name of [
    "primaryVisionDecisionForImage",
    "primaryVisionDecisionForPersonalMessage",
    "primaryVisionDominantKind",
    "personalImageKindForPreUpload",
    "shouldForwardConfirmedWorkPhoto"
  ]) assert.strictEqual(typeof guard[name], "function", `${name} must be exported for runtime verification`);

  // A-C. Clearly visible salon results are decided by the one primary pass.
  for (const [label, visualType, serviceType] of [
    ["female-hair", "hair_work_photo", "coloring"],
    ["male-hair", "hair_work_photo", "haircut"],
    ["male-chair-hair", "hair_work_photo", "haircut"],
    ["manicure", "nails_work_photo", "manicure"]
  ]) {
    const source = image(label);
    const http = provider(primaryPayload({
      visual_type: visualType,
      service_type: serviceType,
      kind: "work_photo",
      confidence: "high",
      has_visible_client: true,
      has_visible_service_result: true
    }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "photo", `${label} must be WORK_PHOTO`);
    const routed = await guard.shouldForwardConfirmedWorkPhoto(source.file, source.content, http, config, logger);
    assert.deepStrictEqual(routed, { forward: true, reason: "primary-vision-high-work-photo" });
    assert.deepStrictEqual(http.calls, ["primary"], `${label} must not invoke the dedicated classifier or receipt OCR`);
  }

  // E. Brows/lashes use the visible result, not salon furniture, as proof.
  {
    const source = image("brows-lashes");
    const http = provider(primaryPayload({
      class: "work_photo",
      kind: "work_photo",
      visual_type: "brows_lashes_work_photo",
      service_kind: "brows_lashes",
      confidence: "high",
      has_visible_client: true,
      has_visible_service_result: true,
      has_visible_brow_lash_result: true,
      has_salon_context: false
    }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "photo");
  }

  // D-E. Banking UI and a receipt shown on a phone remain financial even when
  // other scene semantics are present.
  for (const [label, visualType] of [
    ["bank-transfer", "bank_app_screen"],
    ["receipt-phone", "receipt_on_phone"]
  ]) {
    const source = image(label);
    const http = provider(primaryPayload({
      is_receipt: true,
      visual_type: visualType,
      kind: "receipt",
      confidence: "high",
      is_banking: true,
      is_document: true,
      has_payment_ui: true,
      has_receipt_text: true,
      has_visible_client: label === "bank-transfer"
    }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "receipt");
    assert.deepStrictEqual(await guard.shouldForwardConfirmedWorkPhoto(source.file, source.content, http, config, logger), { forward: false, reason: "receipt" });
    assert.deepStrictEqual(http.calls, ["primary"], `${label} must be classified once before the receipt pipeline verifies details`);
  }

  // F/I. A bank transfer and a paper receipt both select financial validation;
  // Vision does not accept their date, amount or status by itself.
  for (const [label, visionClass, visualType] of [
    ["delivered-transfer", "bank_transfer", "bank_app_screen"],
    ["paper-receipt", "receipt", "bank_receipt"]
  ]) {
    const source = image(label);
    const http = provider(primaryPayload({
      class: visionClass,
      kind: visionClass === "bank_transfer" ? "receipt" : visionClass,
      visual_type: visualType,
      confidence: "high",
      is_receipt: true,
      is_banking: true,
      is_document: true,
      has_receipt_layout: true,
      has_financial_text: true,
      has_document_layout: true,
      has_receipt_text: true
    }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "receipt");
    assert.ok(["bank_transfer", "receipt"].includes(decision.kind));
  }

  // F. A clear mailing screenshot owns its route without receipt/work-photo fallback.
  {
    const source = image("mailing");
    const http = provider(primaryPayload({
      visual_type: "mailing_proof_screenshot",
      is_mailing_proof: true,
      is_screenshot_of_chat: true,
      kind: "mailing",
      confidence: "high"
    }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "mailing");
    assert.deepStrictEqual(http.calls, ["primary"]);
  }

  // L. Empty salon context without a visible client/result is not work proof.
  {
    const source = image("empty-salon");
    const http = provider(primaryPayload({
      class: "unknown",
      confidence: "medium",
      has_salon_context: true
    }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "");
  }

  // G. An ordinary portrait has no dominant class and therefore remains UNKNOWN.
  {
    const source = image("portrait");
    const http = provider(primaryPayload({
      visual_type: "salon_photo",
      kind: "unknown",
      confidence: "high",
      has_visible_client: true
    }), dedicatedPayload({ has_visible_client: true }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "");
    const routed = await guard.shouldForwardConfirmedWorkPhoto(source.file, source.content, http, config, logger, false, void 0, { skipStrictReceiptFallback: true });
    assert.strictEqual(routed.forward, false);
    assert.ok(http.calls.includes("dedicated"), "UNKNOWN must use the existing fallback classifier");
  }


  // N. When an original PNG and a JPEG preview coexist, the original is the
  // Vision source and its magic-byte MIME owns the data URL.
  {
    const original = { _id: "original-png", id: "original-png", name: "result.png", type: "image/jpeg" };
    const preview = { _id: "preview-jpeg", id: "preview-jpeg", name: "thumb-result.jpg", type: "image/jpeg" };
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const jpeg = Buffer.from([255, 216, 255, 224, 1, 2, 3]);
    const diagnostic = guard.createPersonalImageClassificationDiagnostic("unknown");
    const http = provider(primaryPayload({
      class: "work_photo",
      kind: "work_photo",
      visual_type: "hair_work_photo",
      service_kind: "hair",
      confidence: "high",
      has_visible_client: true,
      has_visible_service_result: true,
      has_visible_hair_result: true
    }));
    const read = {
      getUploadReader() {
        return { async getBufferById(id) { return id === original.id ? png : jpeg; } };
      }
    };
    const message = { file: original, files: [original], attachments: [{ file: preview }] };
    const decision = await guard.primaryVisionDecisionForPersonalMessage(message, read, http, config, logger, diagnostic);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "photo");
    assert.strictEqual(diagnostic.source_type, "original");
    assert.match(http.imageUrls[0], /^data:image\/png;base64,/);
  }

  // O. HEIC/HEIF originals are identified by container brand rather than a
  // stale declared JPEG MIME.
  {
    const source = image("heic-original");
    source.file.type = "image/jpeg";
    source.file.name = "capture.heic";
    source.content = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.from([0, 0, 0, 0]), Buffer.from("heicmif1")]);
    const http = provider(primaryPayload());
    await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.match(http.imageUrls[0], /^data:image\/heic;base64,/);
  }

  // H. A person plus banking evidence can never become a work photo.
  {
    const source = image("person-banking");
    const http = provider(primaryPayload({
      visual_type: "bank_app_screen",
      kind: "work_photo",
      confidence: "high",
      is_banking: true,
      is_document: true,
      has_visible_client: true,
      has_visible_service_result: true,
      has_payment_ui: true
    }));
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "receipt");
    assert.strictEqual((await guard.shouldForwardConfirmedWorkPhoto(source.file, source.content, http, config, logger)).forward, false);
  }

  // I. A low-confidence blurry image invokes fallback and never becomes an
  // accepted work photo by confidence alone.
  {
    const source = image("blurry");
    const http = provider(primaryPayload({ confidence: "low" }), dedicatedPayload());
    const decision = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), "");
    const routed = await guard.shouldForwardConfirmedWorkPhoto(source.file, source.content, http, config, logger, false, void 0, { skipStrictReceiptFallback: true });
    assert.strictEqual(routed.forward, false);
    assert.deepStrictEqual(http.calls, ["primary", "dedicated", "dedicated"]);
  }

  // J. Repeated preview/original processing of one canonical upload reuses the
  // upload-bound primary decision instead of making a second Vision request.
  {
    const source = image("canonical-pair");
    const http = provider(primaryPayload({
      visual_type: "hair_work_photo",
      service_type: "haircut",
      kind: "work_photo",
      confidence: "high",
      has_visible_client: true,
      has_visible_service_result: true
    }));
    const first = await guard.primaryVisionDecisionForImage(source.file, source.content, http, config, logger);
    const second = await guard.primaryVisionDecisionForImage({ ...source.file, name: "thumb-canonical-pair.jpg" }, source.content, http, config, logger);
    assert.deepStrictEqual(second, first);
    assert.deepStrictEqual(http.calls, ["primary"], "one logical upload must have one primary Vision decision");
  }

  const productionSource = fs.readFileSync("TarsReportApp.js", "utf8");
  const postStart = productionSource.indexOf("async executePostMessageSent");
  const postEnd = productionSource.indexOf("async receiptOcrConfig", postStart);
  const postBlock = productionSource.slice(postStart, postEnd);
  assert.ok(postBlock.indexOf("primaryVisionDecisionForPersonalMessage") < postBlock.indexOf("ensureManualImageSelection"),
    "primary Vision must run before the manual fallback gate");
  assert.match(postBlock, /if \(!visionRoute\) \{[\s\S]*ensureManualImageSelection[\s\S]*return;/,
    "only inconclusive primary Vision may show manual buttons");
  assert.match(postBlock, /visionRoute === "receipt" \? "receipt" : visionRoute === "photo" \? "photo"/,
    "high receipt/work-photo classes must enter exactly one existing pipeline");
  assert.match(postBlock, /visionRoute === "mailing"[\s\S]*detectPersonalMailingProof/,
    "high mailing must enter the existing mailing pipeline");
  const mediaStart = productionSource.indexOf("async function processPersonalMediaV2");
  const mediaEnd = productionSource.indexOf("function isTodayTransferSumRequest", mediaStart);
  const mediaBlock = productionSource.slice(mediaStart, mediaEnd);
  assert.match(mediaBlock, /if \(forcedIntent !== "receipt"\)[\s\S]*fastForwardPersonalReportPhotos/,
    "high financial images must skip the work-photo path");
  assert.match(mediaBlock, /rejectDuplicateMessage\(/,
    "high financial images must still enter full legacy validation and duplicate protection");

  console.log("PASS: primary Vision dominates confident image routing while financial guards and fallbacks remain strict");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
