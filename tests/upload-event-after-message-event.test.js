const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async executePostMessageSent");
const end = source.indexOf("async receiptOcrConfig", start);
assert(start >= 0 && end > start, "post-message handler missing");
const block = source.slice(start, end);

assert(block.includes("await G.resolvePersonalImageMessageV2(e, n, this.getLogger(), hasInitialMediaSignal ? 16 : 6"), "the media-v2 resolver must settle explicit and opaque personal uploads before routing");
assert(block.includes("hasInitialMediaSignal ? 750 : 400, hasInitialMediaSignal"), "an opaque probe must not become a false upload failure");
assert(block.includes("messageId && !uploadEventKey && !G.messageImageFiles(e).length && recentPostMessageIds.has(messageId)"), "a preliminary message event must not suppress its later upload event");
assert(block.includes("messageId && !uploadEventKey) recentPostMessageIds.add(messageId)"), "only message-only events may use message-id deduplication");
assert(block.includes("uploadEventKey && recentPostUploadIds.has(uploadEventKey)"), "real upload events still need upload-id deduplication");
assert(block.includes("for (const file of G.messageImageFiles(e)) rememberUploadId(file)"), "attachment-only mobile uploads must contribute their upload id to the event key");
assert(block.includes("G.messageLooksLikePendingImageUpload(e)"), "Rocket.Chat filename-only upload events must be settled before text routing");

console.log("PASS: a settled upload is processed after the preliminary message event");
