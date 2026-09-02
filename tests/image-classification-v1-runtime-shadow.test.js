const fs = require("fs");
const crypto = require("crypto");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf('const IMAGE_CLASSIFICATION_SCHEMA_VERSION = "personal-image-classification-v1"');
const end = source.indexOf("const RECEIPT_VISUAL_CRITERIA", start);
assert(start >= 0 && end > start, "ImageClassificationV1 implementation block not found");

class AssociationRecord {
  constructor(model, key) {
    this.model = model;
    this.key = key;
  }
}

const implementation = source.slice(start, end);
const loadImplementation = new Function(
  "exactHash",
  "receiptImageMimeType",
  "bytesToBase64",
  "openAiReceiptOutputText",
  "sha256Bytes",
  "utf8Bytes",
  "RocketChatAssociationRecord",
  "RocketChatAssociationModel",
  `${implementation}
  return {
    sanitizeImageClassificationV1ShadowObservation,
    recordImageClassificationV1ShadowObservation,
    maybeRunImageClassificationV1Shadow,
    normalizeCurrentImageClassificationV1Kind
  };`
);

const digest = (value) => crypto.createHash("sha256").update(Buffer.from(value)).digest("hex");
const api = loadImplementation(
  digest,
  () => "image/png",
  (content) => Buffer.from(content).toString("base64"),
  () => "",
  digest,
  (value) => Buffer.from(String(value), "utf8"),
  AssociationRecord,
  { MISC: "misc" }
);

const safety = (overrides = {}) => ({
  is_banking: false,
  is_document: false,
  has_payment_ui: false,
  has_receipt_text: false,
  ...overrides
});

const classification = (overrides = {}) => ({
  valid: true,
  value: {
    schema_version: "personal-image-classification-v1",
    kind: "other",
    confidence: 0.8,
    work_photo: null,
    safety: safety(),
    reason_code: "OTHER_IMAGE",
    ...overrides
  }
});

function createPersistenceHarness(options = {}) {
  const values = new Map();
  const keyFor = (association) => String(association && association.key || "");
  const clone = (value) => JSON.parse(JSON.stringify(value));
  return {
    values,
    read: {
      getPersistenceReader() {
        return {
          async readByAssociation(association) {
            const value = values.get(keyFor(association));
            return value === undefined ? [] : [clone(value)];
          }
        };
      }
    },
    persistence: {
      async updateByAssociation(association, value) {
        if (options.failUpdate) throw new Error("synthetic persistence failure with secret material");
        values.set(keyFor(association), clone(value));
      },
      async removeByAssociation(association) {
        values.delete(keyFor(association));
      }
    }
  };
}

async function run() {
  const file = { name: "synthetic.png", type: "image/png" };
  const content = Buffer.from([137, 80, 78, 71, 1, 2, 3]);
  const config = { openaiApiKey: "test-only-key" };
  const productionDecision = {
    kind: "work_photo",
    confidence: "high",
    financial_block: false,
    parser_state: "parsed"
  };
  const baseline = JSON.stringify(productionDecision);

  // A. Disabled means no classifier request and no production mutation.
  let disabledCalls = 0;
  const disabled = await api.maybeRunImageClassificationV1Shadow({
    enabled: false,
    file,
    content,
    config,
    currentPrimaryDecision: productionDecision,
    classify: async () => {
      disabledCalls += 1;
      return classification();
    }
  });
  assert.strictEqual(disabled.attempted, false);
  assert.strictEqual(disabledCalls, 0, "disabled shadow must make zero classifier requests");
  assert.strictEqual(JSON.stringify(productionDecision), baseline, "disabled shadow changed production result");

  // B. Enabled runs exactly once for the canonical bytes and still cannot
  // mutate or replace the production decision.
  let enabledCalls = 0;
  let recordedObservation;
  const enabled = await api.maybeRunImageClassificationV1Shadow({
    enabled: true,
    file,
    content,
    config,
    currentPrimaryDecision: productionDecision,
    classify: async () => {
      enabledCalls += 1;
      return classification({
        kind: "work_photo",
        confidence: 0.96,
        work_photo: { category: "hair", client_type: "female", service: "coloring" },
        reason_code: "WORK_PHOTO_HAIR"
      });
    },
    record: async (observation) => {
      recordedObservation = observation;
      return true;
    }
  });
  assert.strictEqual(enabledCalls, 1);
  assert.strictEqual(enabled.recorded, true);
  assert.strictEqual(recordedObservation.agreement, true);
  assert.strictEqual(JSON.stringify(productionDecision), baseline, "enabled shadow changed production result");

  // C/D. Disagreements are data only; the production object stays unchanged.
  const disagreementCases = [
    {
      current: { kind: "work_photo" },
      shadow: classification({ kind: "receipt", confidence: 0.99, safety: safety({ is_banking: true }), reason_code: "RECEIPT_OR_PAYMENT" }),
      expectedCurrent: "work_photo",
      expectedNew: "receipt"
    },
    {
      current: { kind: "receipt" },
      shadow: classification({ kind: "work_photo", confidence: 0.94, work_photo: { category: "hair", client_type: "male", service: "haircut" }, reason_code: "WORK_PHOTO_HAIR" }),
      expectedCurrent: "receipt",
      expectedNew: "work_photo"
    }
  ];
  for (const [index, testCase] of disagreementCases.entries()) {
    const currentBefore = JSON.stringify(testCase.current);
    let observation;
    await api.maybeRunImageClassificationV1Shadow({
      enabled: true,
      file,
      content: Buffer.from([...content, index + 10]),
      config,
      currentPrimaryDecision: testCase.current,
      classify: async () => testCase.shadow,
      record: async (value) => {
        observation = value;
        return true;
      }
    });
    assert.strictEqual(observation.current_kind, testCase.expectedCurrent);
    assert.strictEqual(observation.new_kind, testCase.expectedNew);
    assert.strictEqual(observation.disagreement, true);
    assert.strictEqual(observation.agreement, false);
    assert.strictEqual(JSON.stringify(testCase.current), currentBefore);
  }

  // E. Every provider/schema failure remains fail-open.
  const failureResults = [
    { valid: false, errorCode: "PROVIDER_TIMEOUT" },
    { valid: false, errorCode: "PROVIDER_RETRY_EXHAUSTED" },
    { valid: false, errorCode: "PROVIDER_HTTP_ERROR" },
    { valid: false, errorCode: "INVALID_JSON" },
    { valid: false, errorCode: "INVALID_SCHEMA_VERSION" }
  ];
  for (const [index, failure] of failureResults.entries()) {
    let observation;
    const decision = { kind: "receipt", marker: index };
    const before = JSON.stringify(decision);
    const result = await api.maybeRunImageClassificationV1Shadow({
      enabled: true,
      file,
      content: Buffer.from([...content, index + 30]),
      config,
      currentPrimaryDecision: decision,
      classify: async () => failure,
      record: async (value) => {
        observation = value;
        return true;
      }
    });
    assert.strictEqual(result.attempted, true);
    assert.strictEqual(observation.valid, false);
    assert.strictEqual(observation.error_code, failure.errorCode);
    assert.strictEqual(JSON.stringify(decision), before);
  }
  const thrownProvider = await api.maybeRunImageClassificationV1Shadow({
    enabled: true,
    file,
    content: Buffer.from([...content, 99]),
    config,
    currentPrimaryDecision: productionDecision,
    classify: async () => {
      throw new Error("timeout containing raw provider data");
    }
  });
  assert.strictEqual(thrownProvider.recorded, false);
  assert.strictEqual(JSON.stringify(productionDecision), baseline);

  // F. Persistence failure cannot escape into the production path.
  const brokenStore = createPersistenceHarness({ failUpdate: true });
  const persistenceFailure = await api.maybeRunImageClassificationV1Shadow({
    enabled: true,
    file,
    content: Buffer.from([...content, 100]),
    config,
    currentPrimaryDecision: productionDecision,
    classify: async () => classification(),
    read: brokenStore.read,
    persistence: brokenStore.persistence
  });
  assert.strictEqual(persistenceFailure.recorded, false);
  assert.strictEqual(JSON.stringify(productionDecision), baseline);

  // G. Sanitization is an explicit whitelist. Forbidden payload names and
  // their values cannot reach persistence.
  const forbidden = {
    content: "image bytes",
    raw: "provider raw",
    base64: "encoded image",
    filename: "client-name.png",
    message: "user message",
    text: "ocr text",
    token: "secret token",
    secret: "secret value",
    authorization: "Bearer secret",
    password: "password value",
    payload: "raw payload",
    raw_error: "raw error",
    prompt: "private prompt"
  };
  const safeObservation = api.sanitizeImageClassificationV1ShadowObservation({
    ...forbidden,
    case_id: `img-${"a".repeat(48)}`,
    current_kind: "receipt",
    classification: {
      ...classification({ kind: "receipt", confidence: 0.9, safety: safety({ has_receipt_text: true }), reason_code: "RECEIPT_OR_PAYMENT" }),
      ...forbidden
    }
  });
  const serialized = JSON.stringify(safeObservation);
  for (const [key, value] of Object.entries(forbidden)) {
    assert(!Object.prototype.hasOwnProperty.call(safeObservation, key), `forbidden field persisted: ${key}`);
    assert(!serialized.includes(value), `forbidden value persisted: ${key}`);
  }

  // H. Retention removes expired observations and enforces the configured cap.
  const store = createPersistenceHarness();
  const now = Date.now();
  const observations = [
    api.sanitizeImageClassificationV1ShadowObservation({ case_id: `img-${"1".repeat(48)}`, captured_at: now - 40 * 864e5, current_kind: "other", classification: classification() }),
    api.sanitizeImageClassificationV1ShadowObservation({ case_id: `img-${"2".repeat(48)}`, captured_at: now - 2e3, current_kind: "other", classification: classification() }),
    api.sanitizeImageClassificationV1ShadowObservation({ case_id: `img-${"3".repeat(48)}`, captured_at: now - 1e3, current_kind: "other", classification: classification() }),
    api.sanitizeImageClassificationV1ShadowObservation({ case_id: `img-${"4".repeat(48)}`, captured_at: now, current_kind: "other", classification: classification() })
  ];
  for (const observation of observations) {
    assert.strictEqual(await api.recordImageClassificationV1ShadowObservation(observation, store.read, store.persistence, {
      retentionDays: 30,
      maxRecords: 2,
      maxDeletes: 32
    }), true);
  }
  const index = store.values.get("image-classification-v1-shadow:v1:index");
  assert(index && Array.isArray(index.entries));
  assert.strictEqual(index.entries.length, 2, "shadow index exceeded maxRecords");
  assert.deepStrictEqual(index.entries.map((entry) => entry.case_id), [`img-${"4".repeat(48)}`, `img-${"3".repeat(48)}`]);
  assert(!store.values.has(`image-classification-v1-shadow:v1:img-${"1".repeat(48)}`), "expired record was retained");
  assert(!store.values.has(`image-classification-v1-shadow:v1:img-${"2".repeat(48)}`), "overflow record was retained");

  // I. The runtime hook is a standalone observation statement. Its return
  // value is neither assigned nor used by any production decision function.
  assert(source.includes('id: "image_classification_v1_shadow_enabled"'));
  assert(source.includes('packageValue: false'));
  assert.match(source, /\n\s+G\.scheduleImageClassificationV1Shadow\(\{[\s\S]*?currentPrimaryDecision: selectedPrimaryDecision,[\s\S]*?\n\s+\}\);/);
  assert(!source.includes("selectedPrimaryDecision = G.scheduleImageClassificationV1Shadow"));
  for (const functionName of [
    "personalImageKindForPreUpload",
    "shouldForwardConfirmedWorkPhoto",
    "validateReceiptStrict",
    "primaryVisionDominantKind"
  ]) {
    const marker = `function ${functionName}`;
    const blockStart = source.indexOf(marker);
    const blockEnd = source.indexOf("\n    function ", blockStart + marker.length);
    assert(blockStart >= 0, `production function missing: ${functionName}`);
    const block = source.slice(blockStart, blockEnd > blockStart ? blockEnd : blockStart + 4e3);
    assert(!block.includes("maybeRunImageClassificationV1Shadow"), `${functionName} gained shadow authority`);
    assert(!block.includes("scheduleImageClassificationV1Shadow"), `${functionName} gained shadow authority`);
  }
  assert(!source.match(/(?:evaluateRules|resolveConflicts|makeDecision|runOfflineComparison|runOfflineDataset)\s*\([\s\S]{0,300}ImageClassificationV1/));

  console.log("PASS: ImageClassificationV1 runtime shadow is disabled by default, privacy-safe, bounded and fail-open");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
