"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");
const { automaticCommandId, buildAutomaticConfirmation } = require("../pas/automatic-confirmation");
const { PaymentAuthority } = require("../pas/authority");
const config = { pasAuthorityUrl: "http://127.0.0.1:12345", pasAuthorityToken: "synthetic_pas_token_1234567890abcdef" };
const entry = (overrides = {}) => ({ source: "pre", roomId: "r", messageId: "m", uploadId: "u", exact: "a".repeat(64), receiptDate: "2026-09-13", receiptAmount: 1200, ...overrides });
function response(request, data) { return { statusCode: 200, content: JSON.stringify({ protocol: request.protocol, requestId: request.requestId, operation: request.operation, data }) }; }
function http(fn, calls = []) { return { async post(_url, options) { const request = JSON.parse(options.content); calls.push(request.payload); return response(request, await fn(request.payload)); } }; }
(async () => {
  const runtime = loadTrackedAppWithGuard(), guard = runtime.__testGuard;
  const pre = entry({ userId: "owner", reportQueuedAt: Date.now() });
  assert.strictEqual(guard.acceptedReceiptEntry(pre), false, "A4 pre state is not accepted");
  const app = Object.create(runtime.TarsReportApp.prototype);
  const read = { getPersistenceReader() { return { async readByAssociation() { return [{ version: 1, photos: [pre] }]; } }; } };
  assert.strictEqual(await app.receiptWasAcceptedForMessage(read, { id: "m", file: { id: "u" } }), false, "reportQueuedAt cannot cause accepted UX");
  const unavailable = await guard.authorizeAutomaticReceiptProjection(pre, { photos: [pre] }, { async post() { return { statusCode: 503, content: "" }; } }, config);
  assert.strictEqual(unavailable.projected, false); assert.strictEqual(pre.source, "pre");
  const archive = entry({ source: "archive_failed", messageId: "ma", uploadId: "ua" });
  const a3 = await guard.authorizeAutomaticReceiptProjection(archive, { photos: [archive] }, http(async () => ({ status: "CONFIRMED", canonicalPaymentId: "pas-a3", reasonCode: null })), config);
  assert.strictEqual(a3.projected, true); assert.strictEqual(archive.source, "confirmed");
  for (const status of ["REJECTED", "CONFLICT"]) {
    const blocked = entry({ source: "archive_failed", messageId: `m-${status}`, uploadId: `u-${status}` });
    const outcome = await guard.authorizeAutomaticReceiptProjection(blocked, { photos: [blocked] }, http(async () => ({ status, canonicalPaymentId: null, reasonCode: "SYNTHETIC" })), config);
    assert.strictEqual(outcome.projected, false); assert.strictEqual(blocked.source, "archive_failed", `A3 ${status} fails closed`);
  }
  const missingProjection = entry({ messageId: "m-already", uploadId: "u-already" });
  const already = await guard.authorizeAutomaticReceiptProjection(missingProjection, { photos: [missingProjection] }, http(async () => ({ status: "ALREADY_CONFIRMED", canonicalPaymentId: "pas-existing", reasonCode: null })), config);
  assert.strictEqual(already.projected, false); assert.strictEqual(missingProjection.source, "pre", "ALREADY_CONFIRMED cannot synthesize missing local projection");
  const calls = []; let first = true; const retry = entry(); const commandId = automaticCommandId(retry);
  const retryHttp = http(async () => { if(first){ first=false; throw new Error("outage"); } return { status: "CONFIRMED", canonicalPaymentId: "pas-b", reasonCode: null }; }, calls);
  assert.strictEqual((await guard.authorizeAutomaticReceiptProjection(retry, { photos: [] }, retryHttp, config)).projected, false);
  retry.receiptAmount = 1300; retry.receiptDate = "2026-09-14"; retry.exact = "b".repeat(64);
  assert.strictEqual((await guard.authorizeAutomaticReceiptProjection(retry, { photos: [] }, retryHttp, config)).projected, true);
  assert.strictEqual(calls[0].commandId, commandId); assert.strictEqual(calls[1].commandId, commandId); assert.strictEqual(calls[1].payment.amount.value.minorUnits, 130000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-w1-")), authority = new PaymentAuthority(path.join(dir, "a.sqlite"));
  try { let lost = true; const ambiguous = entry({ messageId: "ml", uploadId: "ul" }), id = automaticCommandId(ambiguous); const lostHttp = http(async command => { const result = authority.confirmPayment(command); if(lost){lost=false; throw new Error("lost response");} return result; });
    await guard.authorizeAutomaticReceiptProjection(ambiguous, { photos: [] }, lostHttp, config); ambiguous.receiptAmount = 1400; ambiguous.receiptDate = "2026-09-15";
    const conflict = await guard.authorizeAutomaticReceiptProjection(ambiguous, { photos: [] }, lostHttp, config); assert.strictEqual(conflict.status, "CONFLICT"); assert.strictEqual(conflict.projected, false); assert.strictEqual(ambiguous.source, "pre"); assert.strictEqual(authority.confirmPayment(buildAutomaticConfirmation(ambiguous, id)).reasonCode, "COMMAND_ID_REUSED");
  } finally { authority.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log("PASS: W1 scoped PAS authority regressions");
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
