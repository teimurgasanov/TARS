"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const {
  Decision,
  DocumentType,
  ReasonCode,
  assertScanner2Result
} = require("../scanner2/contracts");

const valid = {
  decision: Decision.ACCEPT,
  reasonCode: ReasonCode.RECEIPT_CONFIRMED,
  date: "2026-08-30",
  amount: { minorUnits: 80000, currency: "RUB" },
  documentType: DocumentType.BANK_RECEIPT,
  identity: null,
  confidence: 0.8,
  evidence: []
};

assert.strictEqual(assertScanner2Result(valid), valid);
assert.throws(() => assertScanner2Result({ ...valid, amount: { minorUnits: 800.5, currency: "RUB" } }), /amount/);
assert.throws(() => assertScanner2Result({ ...valid, confidence: NaN }), /confidence/);
assert.throws(() => assertScanner2Result({ ...valid, date: undefined }), /date/);
assert.throws(() => assertScanner2Result({
  ...valid,
  evidence: [{
    source: "OCR",
    providerGroup: "fixture",
    field: "DATE",
    value: undefined,
    confidence: 0.8,
    reference: null
  }]
}), /undefined/);

const scannerDir = path.join(process.cwd(), "scanner2");
for (const file of fs.readdirSync(scannerDir).filter((name) => name.endsWith(".js"))) {
  const source = fs.readFileSync(path.join(scannerDir, file), "utf8");
  const imports = [...source.matchAll(/require\(["']([^"']+)["']\)/g)].map((match) => match[1]);
  imports.forEach((dependency) => {
    const isBuiltIn = dependency === "crypto";
    const resolved = path.resolve(scannerDir, dependency);
    const isLocalScannerModule = dependency.startsWith("./") && resolved.startsWith(scannerDir + path.sep);
    assert.ok(isBuiltIn || isLocalScannerModule, file + " imports forbidden dependency " + dependency);
  });
  assert.doesNotMatch(source, /TarsReportApp|Rocket\.Chat|fetch\s*\(|axios|https?\.request|receiptIndex|confirmedTransfers/);
}

console.log("PASS: Scanner2Result contract and offline dependency boundary");
