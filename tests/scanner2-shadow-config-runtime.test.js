"use strict";

const assert = require("assert");
const { readReceiptOcrConfigFromCanonicalBundle } = require("./helpers/canonical-tars-runtime");

(async () => {
  const config = await readReceiptOcrConfigFromCanonicalBundle({
    scanner2_shadow_mode: "RECORD_ONLY",
    scanner2_shadow_sample_percent: 100,
    scanner2_shadow_retention_days: 30,
    scanner2_shadow_max_records: 5000
  });

  assert.strictEqual(config.scanner2ShadowMode, "RECORD_ONLY");
  assert.strictEqual(config.scanner2ShadowSamplePercent, 100);
  assert.strictEqual(config.scanner2ShadowRetentionDays, 30);
  assert.strictEqual(config.scanner2ShadowMaxRecords, 5000);

  console.log("PASS: canonical bundle executes receiptOcrConfig without unresolved Scanner 2.0 symbols");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
