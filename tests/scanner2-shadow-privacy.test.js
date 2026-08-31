"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { DocumentType, OperationStatus, DuplicateState } = require("../scanner2/contracts");
const { SHADOW_SCHEMA_VERSION, SHADOW_PROVENANCE, validateShadowSnapshot } = require("../scanner2/shadow-contract");
const { createShadowTokenizer } = require("../scanner2/shadow-tokenizer");
const { RecorderCode, safeShadowRecord } = require("../scanner2/shadow-recorder");

const tokenizer = createShadowTokenizer({ secret: "privacy-test-secret-that-is-at-least-32-bytes", tokenKeyVersion: "k1" });

function validSnapshot() {
  return {
    schemaVersion: SHADOW_SCHEMA_VERSION,
    caseId: tokenizer.tokenizeCase("privacy-case"),
    provenance: SHADOW_PROVENANCE,
    captureBucket: null,
    acceptedDates: ["2026-09-01"],
    legacyOcrResults: [{
      passType: "page",
      date: "2026-09-01",
      amount: { minorUnits: 30000, currency: "RUB" },
      documentType: DocumentType.OTHER_FINANCIAL_DOCUMENT,
      status: OperationStatus.UNKNOWN,
      qualitySignal: 0.75
    }],
    legacyVisionResults: [],
    duplicateEvidence: {
      state: DuplicateState.NONE,
      matchType: "NONE",
      referenceToken: null,
      exactToken: tokenizer.tokenizeExact("privacy-exact"),
      visualToken: null
    },
    legacyDecision: null,
    tokenKeyVersion: "k1"
  };
}

const attacks = [
  ["username", "person"],
  ["userId", "user-id"],
  ["roomId", "room-id"],
  ["messageId", "message-id"],
  ["phone", "+79991234567"],
  ["cardNumber", "4111111111111111"],
  ["URL", "https://example.invalid/private"],
  ["filePath", "/tmp/private/receipt.jpg"],
  ["rawText", "raw OCR content"],
  ["openAiRawResponse", { output: "raw response" }],
  ["yandexRawPayload", { result: "raw payload" }],
  ["unknownField", "arbitrary free text"]
];

const persistence = {
  calls: 0,
  async upsert() {
    this.calls += 1;
    return "CREATED";
  }
};

(async () => {
  for (const [key, value] of attacks) {
    const dirty = validSnapshot();
    dirty[key] = value;
    assert.throws(() => validateShadowSnapshot(dirty), /forbidden|not allowed/);
    const outcome = await safeShadowRecord(dirty, { enabled: true, tokenizer, persistence });
    assert.strictEqual(outcome.code, RecorderCode.PRIVACY_REJECTED, key + " must be privacy-rejected");
  }
  assert.strictEqual(persistence.calls, 0, "privacy-rejected data must never reach persistence");

  const nested = validSnapshot();
  nested.legacyOcrResults[0].rawText = "hidden raw OCR";
  assert.throws(() => validateShadowSnapshot(nested), /rawText.*forbidden/);

  const scannerDir = path.join(process.cwd(), "scanner2");
  for (const file of fs.readdirSync(scannerDir).filter((name) => /^shadow-.*\.js$/.test(name))) {
    const source = fs.readFileSync(path.join(scannerDir, file), "utf8");
    const imports = [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1]);
    imports.forEach((dependency) => {
      const isBuiltIn = dependency === "crypto";
      const resolved = path.resolve(scannerDir, dependency);
      const isLocal = dependency.startsWith("./") && resolved.startsWith(scannerDir + path.sep);
      assert.ok(isBuiltIn || isLocal, file + " imports forbidden dependency " + dependency);
    });
    assert.doesNotMatch(source, /TarsReportApp|Rocket\.Chat|fetch\s*\(|axios|https?\.request|receipt-duplicate-index|confirmed transfers|financial report/i);
  }

  console.log("PASS: Stage 3A privacy validator rejects identifiers, raw provider data, URLs, paths, and free text");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
