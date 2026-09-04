"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { loadTrackedAppWithGuard, readReceiptOcrConfigFromCanonicalBundle } = require("./helpers/canonical-tars-runtime");

const root = path.resolve(__dirname, "..");
const requiredDate = "2026-09-04";

function observation(passType, provider, fields = {}) {
  return {
    passType,
    provider,
    isReceipt: fields.isReceipt !== false,
    date: Object.prototype.hasOwnProperty.call(fields, "date") ? fields.date : requiredDate,
    time: "18:24",
    amount: Object.prototype.hasOwnProperty.call(fields, "amount") ? fields.amount : { minorUnits: 190000, currency: "RUB" },
    status: fields.status || "success",
    confidence: Object.prototype.hasOwnProperty.call(fields, "confidence") ? fields.confidence : 0.98,
    documentType: "BANK_RECEIPT",
    qualitySignal: 1
  };
}

function evidence(overrides = {}) {
  const qwen = overrides.qwen || observation("receipt_vision_engine_v1", "yandex_ai_studio");
  const ocr = overrides.ocr || [observation("page", "yandex_ocr")];
  const focused = overrides.focused ? [overrides.focused] : [];
  return { legacyVisionResults: [qwen, ...focused], legacyOcrResults: ocr };
}

async function evaluate(guard, overrides = {}) {
  return guard.evaluateReceiptVerificationV2({
    evidence: overrides.evidence || evidence(),
    requiredDate: overrides.requiredDate || requiredDate,
    duplicateSnapshot: overrides.duplicateSnapshot === true,
    targetedPass: overrides.targetedPass
  });
}

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  guard.resetReceiptVerificationV2RuntimeForTests();

  assert.strictEqual(guard.RECEIPT_VERIFICATION_V2_SCHEMA_VERSION, "receipt-verification-v2-shadow-v1");
  assert.strictEqual(guard.RECEIPT_VERIFICATION_V2_MAX_PENDING, 4);
  assert.strictEqual(guard.RECEIPT_VERIFICATION_V2_CACHE_MAX, 200);

  const agreement = await evaluate(guard);
  assert.strictEqual(agreement.outcome, "ACCEPT", "full Qwen/OCR agreement must accept in V2 shadow");
  assert.strictEqual(agreement.selectedAuthority, "qwen_verified");
  assert.strictEqual(agreement.targetedCallCount, 0);

  let amountCalls = 0;
  const amountConflictEvidence = evidence({ ocr: [observation("page", "yandex_ocr", { amount: 2600 })] });
  const amountQwen = await evaluate(guard, {
    evidence: amountConflictEvidence,
    targetedPass: async (field) => {
      amountCalls += 1;
      assert.strictEqual(field, "amount");
      return observation("amount_focus", "yandex_ai_studio", { amount: 1900 });
    }
  });
  assert.strictEqual(amountQwen.outcome, "ACCEPT");
  assert.strictEqual(amountQwen.amount, 1900);
  assert.strictEqual(amountQwen.selectedAuthority, "qwen_targeted");
  assert.strictEqual(amountCalls, 1);

  const amountOcr = await evaluate(guard, {
    evidence: amountConflictEvidence,
    targetedPass: async () => observation("amount_focus", "yandex_ai_studio", { amount: 2600 })
  });
  assert.strictEqual(amountOcr.outcome, "ACCEPT");
  assert.strictEqual(amountOcr.amount, 2600);
  assert.strictEqual(amountOcr.selectedAuthority, "ocr_targeted");

  const amountControl = await evaluate(guard, {
    evidence: amountConflictEvidence,
    targetedPass: async () => observation("amount_focus", "yandex_ai_studio", { amount: 777 })
  });
  assert.strictEqual(amountControl.outcome, "CONTROL");
  assert.strictEqual(amountControl.reasonCode, "focused_unresolved");
  assert.strictEqual(amountControl.targetedCallCount, 1);

  const dateConflictEvidence = evidence({ ocr: [observation("page", "yandex_ocr", { date: "2026-09-03" })] });
  const dateQwen = await evaluate(guard, {
    evidence: dateConflictEvidence,
    targetedPass: async (field) => {
      assert.strictEqual(field, "date");
      return observation("date_focus", "yandex_ai_studio", { date: requiredDate });
    }
  });
  assert.strictEqual(dateQwen.outcome, "ACCEPT");
  assert.strictEqual(dateQwen.date, requiredDate);
  assert.strictEqual(dateQwen.selectedAuthority, "qwen_targeted");

  const dateOcr = await evaluate(guard, {
    evidence: dateConflictEvidence,
    requiredDate: "2026-09-03",
    targetedPass: async () => observation("date_focus", "yandex_ai_studio", { date: "2026-09-03" })
  });
  assert.strictEqual(dateOcr.outcome, "ACCEPT");
  assert.strictEqual(dateOcr.date, "2026-09-03");
  assert.strictEqual(dateOcr.selectedAuthority, "ocr_targeted");

  const dateControl = await evaluate(guard, {
    evidence: dateConflictEvidence,
    targetedPass: async () => observation("date_focus", "yandex_ai_studio", { date: "2026-09-02" })
  });
  assert.strictEqual(dateControl.outcome, "CONTROL");
  assert.strictEqual(dateControl.reasonCode, "focused_unresolved");

  let simultaneousCalls = 0;
  const simultaneous = await evaluate(guard, {
    evidence: evidence({ ocr: [observation("page", "yandex_ocr", { date: "2026-09-03", amount: 2600 })] }),
    targetedPass: async () => {
      simultaneousCalls += 1;
      return null;
    }
  });
  assert.strictEqual(simultaneous.outcome, "CONTROL");
  assert.strictEqual(simultaneous.reasonCode, "date_and_amount_disagreement");
  assert.strictEqual(simultaneousCalls, 0, "simultaneous date/amount conflict must not run targeted passes");

  const statusConflict = await evaluate(guard, { evidence: evidence({ ocr: [observation("page", "yandex_ocr", { status: "failed" })] }) });
  assert.strictEqual(statusConflict.outcome, "CONTROL");
  assert.strictEqual(statusConflict.reasonCode, "status_disagreement");

  const ocrMissing = await evaluate(guard, { evidence: evidence({ ocr: [] }) });
  assert.strictEqual(ocrMissing.outcome, "CONTROL");
  assert.strictEqual(ocrMissing.reasonCode, "ocr_evidence_missing");

  const lowQwen = await evaluate(guard, { evidence: evidence({ qwen: observation("receipt_vision_engine_fields", "yandex_ai_studio", { confidence: 0.89 }) }) });
  assert.strictEqual(lowQwen.outcome, "CONTROL");
  assert.strictEqual(lowQwen.reasonCode, "qwen_low_confidence");
  const missingQwen = await evaluate(guard, { evidence: { legacyVisionResults: [], legacyOcrResults: [observation("page", "yandex_ocr")] } });
  assert.strictEqual(missingQwen.outcome, "CONTROL");
  assert.strictEqual(missingQwen.reasonCode, "qwen_missing");

  const wrongDate = await evaluate(guard, { requiredDate: "2026-09-05" });
  assert.strictEqual(wrongDate.outcome, "REJECT");
  assert.strictEqual(wrongDate.reasonCode, "wrong_date");
  const failed = await evaluate(guard, { evidence: evidence({ qwen: observation("receipt_vision_engine_v1", "yandex_ai_studio", { status: "failed" }), ocr: [observation("page", "yandex_ocr", { status: "failed" })] }) });
  assert.strictEqual(failed.outcome, "REJECT");
  assert.strictEqual(failed.reasonCode, "operation_failed");
  const pending = await evaluate(guard, { evidence: evidence({ qwen: observation("receipt_vision_engine_v1", "yandex_ai_studio", { status: "pending" }), ocr: [observation("page", "yandex_ocr", { status: "pending" })] }) });
  assert.strictEqual(pending.outcome, "REJECT");
  assert.strictEqual(pending.reasonCode, "operation_pending");
  const duplicate = await evaluate(guard, { duplicateSnapshot: true });
  assert.strictEqual(duplicate.outcome, "REJECT");
  assert.strictEqual(duplicate.reasonCode, "duplicate");

  let throwingCalls = 0;
  const providerFailureProduction = Object.freeze({ ok: true, receiptDate: requiredDate, receiptAmount: 1900 });
  const providerFailure = await evaluate(guard, {
    evidence: amountConflictEvidence,
    targetedPass: async () => {
      throwingCalls += 1;
      throw new Error("429 secret provider body must stay private");
    }
  });
  assert.strictEqual(providerFailure.outcome, "CONTROL");
  assert.strictEqual(throwingCalls, 1);
  assert.deepStrictEqual(providerFailureProduction, { ok: true, receiptDate: requiredDate, receiptAmount: 1900 }, "shadow provider failure must not change production result");

  async function productionExtraction(shadowEnabled) {
    const calls = [];
    const http = {
      async post(url, options) {
        if (String(url).includes("ai.api.cloud.yandex.net")) {
          calls.push("qwen");
          return { statusCode: 200, data: { output_text: JSON.stringify({
            is_receipt: true,
            bank_or_provider: "test-bank",
            operation_date: requiredDate,
            operation_time: "18:24",
            amount: 1900,
            currency: "RUB",
            status: "success",
            amount_label: "Сумма операции",
            confidence: 0.98,
            ambiguity_reason: null
          }) } };
        }
        calls.push(`ocr:${options.data.model}`);
        return { statusCode: 200, data: { result: { textAnnotation: { fullText: "Банк\nЧек по операции\nДата операции 04.09.2026\nСумма операции 1 900 руб.\nСтатус Исполнено", blocks: [] } } } };
      }
    };
    const result = await guard.validateReceiptDate(
      { _id: "v2-parity", name: "fixture.jpg", type: "image/jpeg" },
      Buffer.from("receipt-v2-production-parity"),
      http,
      {
        apiKey: "ocr-key",
        folderId: "ocr-folder",
        yandexAiStudioApiKey: "studio-key",
        yandexAiStudioFolderId: "studio-folder",
        yandexAiStudioModel: "qwen3.6-35b-a3b",
        openaiApiKey: "",
        openaiReceiptModel: "gpt-4.1-mini",
        receiptVerificationV2ShadowEnabled: shadowEnabled,
        timeZone: "Europe/Samara"
      }
    );
    return { result, calls };
  }
  const originalNow = Date.now;
  Date.now = () => Date.parse("2026-09-04T18:00:00+04:00");
  let parityDisabled;
  let parityEnabled;
  try {
    guard.resetReceiptVerificationV2RuntimeForTests();
    parityDisabled = await productionExtraction(false);
    guard.resetReceiptVerificationV2RuntimeForTests();
    parityEnabled = await productionExtraction(true);
  } finally {
    Date.now = originalNow;
  }
  assert.deepStrictEqual(parityEnabled.result, parityDisabled.result, "shadow enabled/disabled must return structurally identical production extraction");
  assert.deepStrictEqual(parityEnabled.calls, parityDisabled.calls, "shadow flag must not add provider calls inside production extraction");

  const productionBefore = JSON.stringify(providerFailureProduction);
  const sideEffects = { modify: 0, publish: 0, notify: 0, scheduler: 0, duplicateWrites: 0 };
  const recorded = [];
  const shadowRun = await guard.runReceiptVerificationV2Shadow({
    enabled: true,
    content: Buffer.from("receipt-v2-shadow-safe-fixture"),
    evidence: evidence(),
    requiredDate,
    productionOutcome: "ACCEPT",
    duplicateSnapshot: false,
    record: async (value) => {
      recorded.push(value);
      return true;
    },
    forbiddenProductionDependencies: sideEffects
  });
  assert.strictEqual(shadowRun.recorded, true);
  assert.strictEqual(JSON.stringify(providerFailureProduction), productionBefore, "enabled shadow must preserve production outcome byte-for-byte");
  assert.deepStrictEqual(sideEffects, { modify: 0, publish: 0, notify: 0, scheduler: 0, duplicateWrites: 0 }, "shadow must have zero production side effects");

  const safe = recorded[0];
  const safeJson = JSON.stringify(safe);
  ["raw_ocr", "raw_provider", "base64", "filename", "uploadId", "receiptIdentity", "api_key", "https://", "private-upload"].forEach((forbidden) => {
    assert(!safeJson.includes(forbidden), `privacy-safe observation must omit ${forbidden}`);
  });
  assert.deepStrictEqual(Object.keys(safe).sort(), [
    "agreement", "captured_at", "case_id", "disagreement", "ocr_candidates", "production_disagreement", "production_outcome", "qwen", "reason_code", "schema_version", "selected_authority", "targeted_result", "v2_outcome"
  ].sort(), "observation must use an explicit privacy allowlist");

  let cachedTargetCalls = 0;
  const cachedInput = {
    enabled: true,
    content: Buffer.from("receipt-v2-cache-fixture"),
    evidence: amountConflictEvidence,
    requiredDate,
    productionOutcome: "ACCEPT",
    targetedPass: async () => {
      cachedTargetCalls += 1;
      return observation("amount_focus", "yandex_ai_studio", { amount: 1900 });
    },
    record: async () => true
  };
  await guard.runReceiptVerificationV2Shadow(cachedInput);
  await guard.runReceiptVerificationV2Shadow(cachedInput);
  assert.strictEqual(cachedTargetCalls, 1, "same canonical image must reuse the bounded V2 cache");

  guard.resetReceiptVerificationV2RuntimeForTests();
  const queued = Array.from({ length: 5 }, (_, index) => guard.scheduleReceiptVerificationV2Shadow({
    enabled: true,
    content: Buffer.from(`queue-${index}`),
    evidence: evidence(),
    requiredDate,
    productionOutcome: "ACCEPT",
    record: async () => true
  }));
  assert.deepStrictEqual(queued, [true, true, true, true, false], "shadow queue must drop work beyond its bound");

  const persistenceStore = new Map();
  const persistence = {
    async updateByAssociation(association, value) { persistenceStore.set(association.key, value); },
    async removeByAssociation(association) { persistenceStore.delete(association.key); }
  };
  const read = {
    getPersistenceReader() {
      return { async readByAssociation(association) { const value = persistenceStore.get(association.key); return value ? [value] : []; } };
    }
  };
  for (let index = 0; index < 3; index += 1) {
    const obs = guard.sanitizeReceiptVerificationV2Observation({
      caseId: `rv2-${String(index).padStart(48, "a")}`,
      capturedAt: 1000 + index,
      productionOutcome: "ACCEPT",
      result: agreement,
      qwen: observation("receipt_vision_engine_v1", "yandex_ai_studio"),
      ocrAmounts: [1900], ocrDates: [requiredDate], ocrStatuses: ["success"]
    });
    await guard.recordReceiptVerificationV2Observation(obs, read, persistence, { maxRecords: 2, maxDeletes: 2, retentionDays: 30 });
  }
  const indexRecord = persistenceStore.get("receipt-verification-v2-shadow:v1:index");
  assert(indexRecord && indexRecord.entries.length <= 2, "retention index must remain bounded");

  const config = await readReceiptOcrConfigFromCanonicalBundle({ receipt_verification_v2_shadow_enabled: undefined });
  assert.strictEqual(config.receiptVerificationV2ShadowEnabled, false, "packaged V2 shadow must default to false");

  const source = fs.readFileSync(path.join(root, "TarsReportApp.js"), "utf8");
  const evaluatorSource = source.slice(source.indexOf("async function evaluateReceiptVerificationV2"), source.indexOf("function receiptVerificationV2CaseId"));
  const runtimeSource = source.slice(source.indexOf("async function runReceiptVerificationV2Shadow"), source.indexOf("function resetReceiptVerificationV2RuntimeForTests"));
  assert.match(source, /id:\s*"receipt_verification_v2_shadow_enabled"[\s\S]*?packageValue:\s*false/, "package setting must stay false");
  assert.doesNotMatch(evaluatorSource, /validateReceiptStrict\s*\(|validateReceiptDateCore\s*\(|mergeCandidateForDecision\s*\(|receiptAmountsDisagree\s*\(/, "V2 decision must bypass the legacy decision pipeline");
  assert.match(source, /requestOpenAiReceiptCheck\([\s\S]*?\n\s*1,[\s\S]*?"receipt_dispute",[\s\S]*?provider,[\s\S]*?true/, "runtime targeted pass must disable retry and fallback");
  assert.doesNotMatch(evaluatorSource, /openai|requestOpenAiReceiptVisionEngineV1|requestReceiptOcr/, "V2 evaluator must not invoke OpenAI, full Vision, or OCR");
  assert.doesNotMatch(evaluatorSource + runtimeSource, /validateReceiptStrict\s*\(|writeIndex\s*\(|publish|notifier|scheduler|payroll|runningTotal/, "V2 runtime must have no production write, publish, scheduler, payroll, or totals capability");
  assert.doesNotMatch(source, /await\s+scheduleReceiptVerificationV2Shadow\s*\(/, "production must never await V2 shadow scheduling");

  console.log("PASS: Receipt Verification V2 remains bounded, privacy-safe, read-only, and shadow-only");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
