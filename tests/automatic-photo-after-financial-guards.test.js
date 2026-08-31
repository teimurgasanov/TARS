const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function shouldForwardConfirmedWorkPhoto");
const end = source.indexOf("async function fastForwardPersonalReportPhotos", start);
const block = source.slice(start, end);

const documentBlock = block.indexOf('forward: false, reason: "document-or-screen"');
const strictCheck = block.indexOf("validateReceiptStrict");
const receiptBlock = block.indexOf('forward: false, reason: "strict-receipt-check"');
const inconclusiveBlock = block.indexOf('forward: false, reason: "work-photo-not-strictly-confirmed"');
assert(documentBlock >= 0, "documents/screens must remain blocked");
assert(strictCheck > documentBlock && receiptBlock > strictCheck, "strict receipt validation must follow the document guard");
assert(inconclusiveBlock > receiptBlock, "inconclusive images must remain blocked after both financial guards");
assert(!block.includes('forward: true, reason: "verified-non-receipt-image"'), "financial check failure cannot become a photo acceptance");

console.log("PASS: only positively confirmed work photos pass the financial guards");
