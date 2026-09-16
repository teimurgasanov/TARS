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
const transferStart = source.indexOf("async function confirmedTransferSummaryForUser");
const transferEnd = source.indexOf("function masterTransferSummaryAssociation", transferStart);
assert(transferStart >= 0 && transferEnd > transferStart, "P1 transfer block missing");
const transferBlock = source.slice(transferStart, transferEnd);
assert.strictEqual((transferBlock.match(/confirmedTransferProjectionKey\(/g) || []).length, 2, "P1 index/current loops must preserve their dedicated projection identity");

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

  const confirmedCurrent = receipt({ exact: "confirmed-current", uploadId: "confirmed-current", updatedAt: 100 });
  const duplicateRecent = receipt({ source: "duplicate", exact: "duplicate-recent", uploadId: "duplicate-recent", updatedAt: 200 });
  const preserveDuplicateObservation = mergeConcurrentReceiptIndex([confirmedCurrent], [duplicateRecent], Date.now());
  assert.strictEqual(preserveDuplicateObservation.length, 2, "canonical-only alias must not drop a distinct duplicate observation");
  assert(preserveDuplicateObservation.some((entry) => entry.exact === "duplicate-recent"), "cached duplicate remains independently addressable");

  const duplicateCurrent = receipt({ source: "duplicate", exact: "duplicate-current", uploadId: "duplicate-current", updatedAt: 100 });
  const confirmedRecent = receipt({ exact: "confirmed-recent", uploadId: "confirmed-recent", updatedAt: 200 });
  const preserveConfirmedObservation = mergeConcurrentReceiptIndex([duplicateCurrent], [confirmedRecent], Date.now());
  assert.strictEqual(preserveConfirmedObservation.length, 2, "canonical-only alias must not drop a distinct confirmed observation");
  assert(preserveConfirmedObservation.some((entry) => entry.exact === "confirmed-recent"), "cached confirmed remains independently addressable");

  const newerRejected = receipt({ source: "rejected", pasCanonicalPaymentId: "", exact: "legacy", updatedAt: 400 });
  const staleConfirmed = receipt({ pasCanonicalPaymentId: "", exact: "legacy", updatedAt: 300 });
  const nonAuthorityMerge = mergeConcurrentReceiptIndex([newerRejected], [staleConfirmed], Date.now());
  assert.strictEqual(nonAuthorityMerge[0].source, "rejected", "newer rejected must not be overwritten by stale PAS-unknown confirmed");

  const omittedLegacyConfirmed = receipt({ pasCanonicalPaymentId: "", exact: "omitted", updatedAt: 300 });
  assert.deepStrictEqual(mergeConcurrentReceiptIndex([], [omittedLegacyConfirmed], Date.now()), [], "omitted PAS-unknown confirmed must not resurrect from the process-local cache");

  const read = readFor([first, samePaymentDifferentObservation]);
  const summary = await guard.confirmedTransferSummaryForUser(read, {}, "owner", workday, undefined, undefined, "room");
  assert.deepStrictEqual({ count: summary.count, total: summary.total }, { count: 1, total: 100 }, "P1 must count one canonical payment once");

  const distinct = receipt({ exact: "z".repeat(64), uploadId: "upload-c", pasCanonicalPaymentId: "payment-b" });
  const distinctSummary = await guard.confirmedTransferSummaryForUser(readFor([first, distinct]), {}, "owner", workday, undefined, undefined, "room");
  assert.deepStrictEqual({ count: distinctSummary.count, total: distinctSummary.total }, { count: 2, total: 200 }, "distinct canonical payments remain distinct contributions");

  const nonAuthoritative = receipt({ source: "pre", exact: "p".repeat(64), uploadId: "upload-pre", pasCanonicalPaymentId: "payment-a" });
  const nonAuthoritativeSummary = await guard.confirmedTransferSummaryForUser(readFor([nonAuthoritative]), {}, "owner", workday, undefined, undefined, "room");
  assert.deepStrictEqual({ count: nonAuthoritativeSummary.count, total: nonAuthoritativeSummary.total }, { count: 0, total: 0 }, "pre cannot gain authority from canonical merge/projection mechanics");

  const legacyIdentity = "txn:2026-09-15|10:00|100";
  const legacyFirst = receipt({ pasCanonicalPaymentId: "", receiptIdentity: legacyIdentity, exact: "legacy-a", uploadId: "legacy-a" });
  const legacySameIdentity = receipt({ pasCanonicalPaymentId: "", receiptIdentity: legacyIdentity, exact: "legacy-b", uploadId: "legacy-b" });
  const legacySummary = await guard.confirmedTransferSummaryForUser(readFor([legacyFirst, legacySameIdentity]), {}, "owner", workday, undefined, undefined, "room");
  assert.deepStrictEqual({ count: legacySummary.count, total: legacySummary.total }, { count: 1, total: 100 }, "P1 no-canonical receipts must retain receiptIdentity-first dedupe");
  const legacyCurrentSummary = await guard.confirmedTransferSummaryForUser(readFor([]), {}, "owner", workday, undefined, [legacyFirst, legacySameIdentity], "room");
  assert.deepStrictEqual({ count: legacyCurrentSummary.count, total: legacyCurrentSummary.total }, { count: 1, total: 100 }, "P1 current no-canonical receipts must retain receiptIdentity-first dedupe");

  console.log("PASS: W3 canonical payment identity bounds receipt merge and financial projection");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
