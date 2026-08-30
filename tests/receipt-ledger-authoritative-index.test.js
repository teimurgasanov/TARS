const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function receiptLedgerSummaryForUser");
const end = source.indexOf("let receiptSummaryQueue", start);
assert(start >= 0 && end > start, "receipt ledger block missing");
const block = source.slice(start, end);

assert(block.includes("readIndex(read, PROTECTED_ROOMS.kassa.index)"), "daily receipt index must be authoritative");
assert(block.includes("acceptedReceiptEntry(receipt)"), "rejected or pending receipts must not be counted");
assert(block.includes("persistence.removeByAssociation(association)"), "derived ledger must be rebuilt to remove stale rows");
assert(block.includes("persistence.createWithAssociation"), "accepted index rows must be persisted again");
assert(!block.includes("receiptLedgerCache"), "daily totals must not depend on a process-local cache");

const publishStart = source.indexOf("async function publishMasterTransferSummaryUnlocked");
const publishEnd = source.indexOf("async function", publishStart + 20);
const publish = source.slice(publishStart, publishEnd);
assert(publish.indexOf("receiptLedgerSummaryForUser") < publish.indexOf("if (!room || !appUser) return false"), "ledger must reconcile even when summary publication is unavailable");

console.log("PASS: receipt totals rebuild from the accepted daily index");
