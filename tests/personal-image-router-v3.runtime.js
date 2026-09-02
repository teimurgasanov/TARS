"use strict";

const assert = require("assert");
const {
  normalizeVisionTypePayload,
  parseVisionTypeResponse,
  routeVisionDecision
} = require("../scanner2/personal-image-router-v3");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function visionPayload(overrides = {}) {
  return {
    kind: "unknown",
    confidence: "low",
    service_kind: "none",
    has_payment_ui: false,
    has_receipt_layout: false,
    has_financial_document: false,
    has_document_layout: false,
    has_visible_client: false,
    has_visible_service_result: false,
    is_receipt: false,
    visual_type: "unknown",
    date: null,
    amount: null,
    status: "unknown",
    bank: null,
    ...overrides
  };
}

function source(label) {
  return {
    file: { _id: `router-v3-${label}`, id: `router-v3-${label}`, name: `${label}.jpg`, type: "image/jpeg" },
    content: Buffer.from(`router-v3-${label}`)
  };
}

function provider(payload) {
  const calls = [];
  return {
    calls,
    async post(_url, options) {
      const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
      calls.push(prompt.includes("Определи только основной тип изображения") ? "image_type_v3" : /ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА/.test(prompt) ? "receipt_focus" : "other");
      return { statusCode: 200, data: { output_text: JSON.stringify(payload) } };
    }
  };
}

const workPhoto = visionPayload({
  kind: "work_photo",
  confidence: "high",
  service_kind: "hair",
  has_visible_client: true,
  has_visible_service_result: true,
  visual_type: "hair_work_photo"
});
const parsedWorkPhoto = parseVisionTypeResponse(JSON.stringify(workPhoto));
assert.strictEqual(parsedWorkPhoto.parserState, "parsed");
assert.strictEqual(routeVisionDecision(parsedWorkPhoto.decision), "photo");

// No second classifier may veto a clean HIGH salon result.
const portraitFramedHair = normalizeVisionTypePayload(visionPayload({
  kind: "work_photo",
  confidence: "high",
  service_kind: "hair",
  has_visible_client: true,
  has_visible_service_result: false
}));
assert.strictEqual(portraitFramedHair.parserState, "parsed");
assert.strictEqual(routeVisionDecision(portraitFramedHair.decision), "photo");

// Concrete financial/document evidence is the only safety override.
for (const flag of ["has_payment_ui", "has_receipt_layout", "has_financial_document", "has_document_layout"]) {
  const result = normalizeVisionTypePayload(visionPayload({
    kind: "work_photo",
    confidence: "high",
    service_kind: "hair",
    has_visible_client: true,
    has_visible_service_result: true,
    [flag]: true
  }));
  assert.strictEqual(routeVisionDecision(result.decision), "receipt", `${flag} must block the photo route`);
}

assert.strictEqual(routeVisionDecision(normalizeVisionTypePayload(visionPayload({ kind: "receipt", confidence: "high" })).decision), "receipt");
assert.strictEqual(routeVisionDecision(normalizeVisionTypePayload(visionPayload({ kind: "bank_transfer", confidence: "high" })).decision), "receipt");
assert.strictEqual(routeVisionDecision(normalizeVisionTypePayload(visionPayload({ kind: "mailing", confidence: "high" })).decision), "mailing");
assert.strictEqual(routeVisionDecision(normalizeVisionTypePayload(visionPayload({ kind: "work_photo", confidence: "medium" })).decision), "manual");
assert.strictEqual(routeVisionDecision(normalizeVisionTypePayload(visionPayload({ kind: "unknown", confidence: "low" })).decision), "manual");
assert.strictEqual(parseVisionTypeResponse('{"kind":"work_photo"}').parserState, "schema_mismatch");
assert.strictEqual(parseVisionTypeResponse("not json").parserState, "no_json");

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  for (const fixture of [
    ["aleksei", workPhoto, "photo"],
    ["dasha", { ...workPhoto, has_visible_service_result: false }, "photo"],
    ["receipt", visionPayload({ kind: "receipt", confidence: "high", has_receipt_layout: true, is_receipt: true, visual_type: "bank_receipt" }), "receipt"],
    ["mailing", visionPayload({ kind: "mailing", confidence: "high", visual_type: "mailing_proof_screenshot" }), "mailing"],
    ["unknown", visionPayload({ kind: "unknown", confidence: "medium" }), ""]
  ]) {
    const [label, payload, expected] = fixture;
    const image = source(label);
    const http = provider(payload);
    const decision = await guard.primaryVisionDecisionForImage(image.file, image.content, http, {
      openaiApiKey: "test-key",
      openaiReceiptModel: "gpt-4.1-mini",
      timeZone: "Europe/Samara",
      cutoffHour: 0
    }, { info() {}, warn() {}, error() {} });
    assert.strictEqual(guard.primaryVisionDominantKind(decision), expected, `${label}: unexpected V3 route`);
    assert.deepStrictEqual(http.calls, ["image_type_v3"], `${label}: type routing must use exactly one V3 Vision pass`);
  }

  console.log("PASS: personal image router V3 makes one primary Vision decision with financial-only safety override");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
