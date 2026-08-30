const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function detectPersonalMailingProof");
const end = source.indexOf("async function fastForwardPersonalReportPhotos", start);
assert(start >= 0 && end > start, "mailing proof detector missing");
const block = source.slice(start, end);

assert(block.includes("let readableFileSeen = false"), "detector must track whether upload bytes are ready");
assert(block.includes("readableFileSeen = true"), "successful upload read must stop availability retries");
assert(block.includes("if (readableFileSeen) return void 0"), "readable non-mailing images must be classified only once");

console.log("PASS: readable photos and receipts do not repeat mailing OCR/Vision");
