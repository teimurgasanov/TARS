"use strict";

const VISION_KINDS = Object.freeze([
  "work_photo",
  "receipt",
  "bank_transfer",
  "mailing",
  "document",
  "unknown"
]);

const VISION_CONFIDENCE = Object.freeze(["high", "medium", "low"]);
const SERVICE_KINDS = Object.freeze([
  "hair",
  "nails",
  "pedicure",
  "brows_lashes",
  "other",
  "none"
]);

function enumValue(value, allowed, fallback) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function extractJsonObject(text) {
  const source = String(text == null ? "" : text).trim();
  if (!source) return { parserState: "no_json", value: null };
  const match = source.match(/\{[\s\S]{0,12000}\}/);
  if (!match) return { parserState: "no_json", value: null };
  try {
    const value = JSON.parse(match[0]);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { parserState: "parsed", value }
      : { parserState: "schema_mismatch", value: null };
  } catch (_error) {
    return { parserState: "parse_error", value: null };
  }
}

function normalizeVisionTypePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { parserState: "schema_mismatch", decision: null };
  }

  const requestedKind = enumValue(payload.kind || payload.class, VISION_KINDS, "unknown");
  const confidence = enumValue(payload.confidence, VISION_CONFIDENCE, "low");
  const legacyServiceType = String(payload.service_type || "").trim().toLowerCase();
  const inferredServiceKind = /^(?:haircut|coloring)$/.test(legacyServiceType)
    ? "hair"
    : legacyServiceType === "manicure"
      ? "nails"
      : legacyServiceType === "pedicure"
        ? "pedicure"
        : /^(?:brows|lashes)$/.test(legacyServiceType)
          ? "brows_lashes"
          : "none";
  const serviceKind = enumValue(payload.service_kind, SERVICE_KINDS, inferredServiceKind);
  const hasPaymentUi = typeof payload.has_payment_ui === "boolean" ? payload.has_payment_ui : payload.is_banking;
  const hasReceiptLayout = typeof payload.has_receipt_layout === "boolean" ? payload.has_receipt_layout : payload.has_receipt_text;
  const hasFinancialDocument = typeof payload.has_financial_document === "boolean" ? payload.has_financial_document : payload.is_document;
  const hasDocumentLayout = typeof payload.has_document_layout === "boolean" ? payload.has_document_layout : payload.is_document;
  if (
    !VISION_KINDS.includes(String(payload.kind || payload.class || "").trim().toLowerCase()) ||
    !VISION_CONFIDENCE.includes(String(payload.confidence || "").trim().toLowerCase()) ||
    [hasPaymentUi, hasReceiptLayout, hasFinancialDocument, hasDocumentLayout, payload.has_visible_client, payload.has_visible_service_result]
      .some((value) => typeof value !== "boolean")
  ) {
    return { parserState: "schema_mismatch", decision: null };
  }

  const financialBlock = Boolean(
    hasPaymentUi ||
    hasReceiptLayout ||
    hasFinancialDocument ||
    hasDocumentLayout
  );
  let kind = requestedKind;
  if (requestedKind === "work_photo" && financialBlock) {
    kind = hasPaymentUi ? "bank_transfer" : "document";
  }

  return {
    parserState: "parsed",
    decision: {
      kind,
      requested_kind: requestedKind,
      confidence,
      service_kind: serviceKind,
      providerGroup: "openai",
      passType: "image_type_v3",
      is_banking: hasPaymentUi === true,
      is_document: financialBlock,
      has_visible_client: payload.has_visible_client === true,
      has_visible_service_result: payload.has_visible_service_result === true,
      has_payment_ui: hasPaymentUi === true,
      has_receipt_layout: hasReceiptLayout === true,
      has_financial_document: hasFinancialDocument === true,
      has_document_layout: hasDocumentLayout === true,
      financial_block: financialBlock,
      safety_override: requestedKind === "work_photo" && financialBlock,
      parser_state: "parsed"
    }
  };
}

function parseVisionTypeResponse(text) {
  const extracted = extractJsonObject(text);
  if (extracted.parserState !== "parsed") {
    return { parserState: extracted.parserState, decision: null, payload: null };
  }
  const normalized = normalizeVisionTypePayload(extracted.value);
  return {
    parserState: normalized.parserState,
    decision: normalized.decision,
    payload: normalized.parserState === "parsed" ? extracted.value : null
  };
}

function routeVisionDecision(decision) {
  if (!decision || decision.confidence !== "high") return "manual";
  if (
    decision.financial_block ||
    decision.kind === "receipt" ||
    decision.kind === "bank_transfer" ||
    decision.kind === "document"
  ) return "receipt";
  if (decision.kind === "work_photo") return "photo";
  if (decision.kind === "mailing") return "mailing";
  return "manual";
}

module.exports = {
  VISION_KINDS,
  VISION_CONFIDENCE,
  SERVICE_KINDS,
  normalizeVisionTypePayload,
  parseVisionTypeResponse,
  routeVisionDecision
};
