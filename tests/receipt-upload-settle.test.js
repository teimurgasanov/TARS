const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function rejectDuplicateMessage");
const end = source.indexOf("function isTodayTransferSumRequest", start);
assert(start >= 0 && end > start, "financial post-message pipeline missing");
const block = source.slice(start, end);

assert(block.includes("for (let attempt = 0; attempt < 8 && !content; attempt += 1)"), "receipt pipeline must wait for mobile upload settlement");
assert(block.includes("POST_UPLOAD_NOT_READY"), "temporary UploadReader failures must be logged");
assert(block.includes("UploadReader did not provide"), "exhausted retries must be explicit instead of silently skipping the cheque");
assert(block.indexOf("getBufferById(messageFileId)") < block.indexOf("validateReceiptStrict(messageFile, content"), "receipt validation must start only after readable file content exists");

console.log("PASS: receipt processing waits for a settled Rocket.Chat upload");
