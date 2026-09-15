const assert = require("assert");
const fs = require("fs");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const mergeStart = source.indexOf("function receiptIndexEntryKey");
const mergeEnd = source.indexOf("function findDuplicate", mergeStart);
assert(mergeStart >= 0 && mergeEnd > mergeStart, "H1/H2 merge block missing");
eval(source.slice(mergeStart, mergeEnd));
const ledgerStart = source.indexOf("async function receiptLedgerSummaryForUser");
const ledgerEnd = source.indexOf("let receiptSummaryQueue", ledgerStart);
assert(ledgerStart >= 0 && ledgerEnd > ledgerStart, "P2 ledger block missing");
const ledgerBlock = source.slice(ledgerStart, ledgerEnd);
assert.strictEqual((ledgerBlock.match(/receiptFinancialProjectionKey\(receipt\)/g) || []).length, 2, "P2 index/current loops must use canonical financial projection identity");

const workday = "2026-09-15";
const receipt = (overrides = {}) => ({
  source: "confirmed",
  userId: "owner",
  roomId: "room",
  receiptDate: workday,
  receiptAmount: 100,
  exact: "x".repeat(64),
  uploadId: "upload-a",
  pasCanonicalPaymentId: "payment-a",
  ...overrides
});

function readFor(photos) {
  return {
    getPersistenceReader() {
      return {
        async readByAssociation() {
          return [{ version: 1, photos }];
        }
      };
    }
  };
}

(async () => {
  const runtime = loadTrackedAppWithGuard();
  const guard = runtime.__testGuard;
  const first = receipt();
  const samePaymentDifferentObservation = receipt({
    exact: "y".repeat(64),
    uploadId: "upload-b",
    receiptAmount: 100
  });
  const merged = mergeConcurrentReceiptIndex([first], [samePaymentDifferentObservation], Date.now());
  assert.strictEqual(merged.length, 1, "H2 must merge observations carrying one canonical payment identity");
  assert.strictEqual(merged[0].pasCanonicalPaymentId, "payment-a");

  const read = readFor([first, samePaymentDifferentObservation]);
  const summary = await guard.confirmedTransferSummaryForUser(read, {}, "owner", workday, undefined, undefined, "room");
  assert.deepStrictEqual({ count: summary.count, total: summary.total }, { count: 1, total: 100 }, "P1 must count one canonical payment once");

  const distinct = receipt({ exact: "z".repeat(64), uploadId: "upload-c", pasCanonicalPaymentId: "payment-b" });
  const distinctSummary = await guard.confirmedTransferSummaryForUser(readFor([first, distinct]), {}, "owner", workday, undefined, undefined, "room");
  assert.deepStrictEqual({ count: distinctSummary.count, total: distinctSummary.total }, { count: 2, total: 200 }, "distinct canonical payments remain distinct contributions");

  const nonAuthoritative = receipt({ source: "pre", exact: "p".repeat(64), uploadId: "upload-pre", pasCanonicalPaymentId: "payment-a" });
  const nonAuthoritativeSummary = await guard.confirmedTransferSummaryForUser(readFor([nonAuthoritative]), {}, "owner", workday, undefined, undefined, "room");
  assert.deepStrictEqual({ count: nonAuthoritativeSummary.count, total: nonAuthoritativeSummary.total }, { count: 0, total: 0 }, "pre cannot gain authority from canonical merge/projection mechanics");

  console.log("PASS: W3 canonical payment identity bounds receipt merge and financial projection");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
