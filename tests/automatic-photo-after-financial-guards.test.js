const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function shouldForwardConfirmedWorkPhoto");
const end = source.indexOf("async function fastForwardPersonalReportPhotos", start);
const block = source.slice(start, end);

const documentBlock = block.indexOf('forward: false, reason: "document-or-screen"');
const fallbackCheck = block.indexOf("personalImageOcrFallbackKind");
const receiptBlock = block.indexOf('fallbackKind === "receipt"');
const inconclusiveBlock = block.indexOf('primary-vision-inconclusive');
assert(documentBlock >= 0, "documents/screens must remain blocked");
assert(fallbackCheck > documentBlock && receiptBlock > fallbackCheck, "one OCR receipt fallback must follow the document guard");
assert(inconclusiveBlock > receiptBlock, "inconclusive images must remain blocked after both financial guards");
assert(!block.includes("validateReceiptStrict"), "work-photo routing must not invoke full receipt extraction");
assert(!block.includes('forward: true, reason: "verified-non-receipt-image"'), "financial check failure cannot become a photo acceptance");

console.log("PASS: only positively confirmed work photos pass the financial guards");
