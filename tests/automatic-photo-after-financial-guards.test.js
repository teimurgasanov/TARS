const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function shouldForwardConfirmedWorkPhoto");
const end = source.indexOf("async function fastForwardPersonalReportPhotos", start);
const block = source.slice(start, end);

const documentBlock = block.indexOf('forward: false, reason: "document-or-screen"');
const strictCheck = block.indexOf("validateReceiptStrict");
const receiptBlock = block.indexOf('forward: false, reason: "strict-receipt-check"');
const automaticPhoto = block.indexOf('forward: true, reason: "verified-non-receipt-image"');
assert(documentBlock >= 0, "documents/screens must remain blocked");
assert(strictCheck > documentBlock && receiptBlock > strictCheck, "strict receipt validation must follow the document guard");
assert(automaticPhoto > receiptBlock, "automatic photo acceptance must happen only after both financial guards");

console.log("PASS: automatic photos are accepted only after document and receipt exclusion");
