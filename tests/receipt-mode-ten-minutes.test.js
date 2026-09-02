const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const postStart = source.indexOf("async executePostMessageSent");
const postEnd = source.indexOf("async receiptOcrConfig", postStart);
const post = source.slice(postStart, postEnd);
assert(post.includes("activeTransferReportIntent(n, e.room)"), "receipt mode must be read for every upload");
assert(post.includes('explicitTransferIntent ? "receipt" : explicitPhotoIntent ? "photo" : ""'), "legacy receipt intent must force receipt routing");
assert(post.includes("if (explicitTransferIntent) await this.clearTransferReportIntent"), "legacy receipt intent must be cleared after the classified upload");

const handlerStart = source.indexOf("async handleReceiptUploadButton");
const handlerEnd = source.indexOf("async handleMailingUploadButton", handlerStart);
const handler = source.slice(handlerStart, handlerEnd);
assert(handler.includes("expiresAt: Date.now() + 10 * 60 * 1e3"), "receipt mode must expire after ten minutes");
assert(handler.includes("🧾 Отправьте чек."), "direct receipt choice must request one image without exposing legacy mode semantics");

console.log("PASS: one-shot receipt intent retains a bounded safety expiry and cannot leak into later uploads");
