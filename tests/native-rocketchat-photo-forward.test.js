const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function forwardReportPhotoMessage");
const end = source.indexOf("async function cleanupDuplicateReportForwards", start);
assert(start >= 0 && end > start, "native report-photo forwarder missing");
const forwarder = source.slice(start, end);

assert(forwarder.includes("rocketChatForwardPermalink"), "forwarder must resolve the source message permalink");
assert(forwarder.includes("const text = `[ ](${permalink})`"), "forwarder must use Rocket.Chat's hidden-permalink format");
assert(forwarder.includes(".setParseUrls(true)"), "Rocket.Chat must expand the source message into a forwarded quote");
assert(!forwarder.includes("file: reportFile"), "forwarder must not reuse an upload across rooms");
assert(!forwarder.includes("attachments: [attachment]"), "forwarder must not fabricate a file attachment");
assert(forwarder.includes("native permalink"), "native forwarding must be observable in logs");

const idStart = source.indexOf("function reportForwardSourceMessageId");
const idEnd = source.indexOf("function reportForwardIdentity", idStart);
assert(idStart >= 0 && idEnd > idStart, "forwarded source-message identity helper missing");
const identity = source.slice(idStart, idEnd);
assert(identity.includes("[?&]msg="), "native forwards must be identified by their source message id");
assert(source.includes('if (sourceMessageId) return `message:${sourceMessageId}`'), "duplicate cleanup must group native forwards by source message");
assert(source.includes("if (reportForwardSourceMessageId(message)) return true"), "native forwarded messages must be recognized as TARS forwards");

console.log("PASS: work photos use Rocket.Chat's native Forward message format");
