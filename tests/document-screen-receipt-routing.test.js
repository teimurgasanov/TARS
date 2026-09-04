const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function requestOpenAiWorkPhotoCheck");
const end = source.indexOf("async function fastForwardPersonalReportPhotos", start);
assert(start >= 0 && end > start, "work-photo routing block missing");
const block = source.slice(start, end);

assert(block.includes('return "document"'), "Vision document result must be preserved");
assert(block.includes('forward: false, reason: "document-or-screen"'), "bank documents must not become work photos");
assert(block.includes('dominantKind === "photo"'), "confirmed salon work photos must remain automatic");
assert(!block.includes("validateReceiptStrict"), "classification must not run full receipt extraction");
assert(block.includes('primary-vision-inconclusive'), "inconclusive images must remain blocked");
assert(!block.includes('forward: true, reason: "verified-non-receipt-image"'), "unknown images must never be accepted by exclusion");

const routeStart = source.indexOf("async function protectedRoomForPersonalFile");
const routeEnd = source.indexOf("function normalizedUsername", routeStart);
assert(routeStart >= 0 && routeEnd > routeStart, "personal image routing block missing");
const route = source.slice(routeStart, routeEnd);
assert(!route.includes("requestOpenAiWorkPhotoCheck"), "final routing must not run a second visual classifier");
assert(!route.includes("validateReceiptStrict"), "unknown routing must not run full receipt extraction");
assert(route.includes("personalImageOcrFallbackKind"), "final routing retains one receipt/mailing OCR fallback");
assert(route.includes("PROTECTED_ROOMS.kassa"), "OCR-confirmed receipts must reach receipt validation");
assert(route.includes('dominantKind === "photo"'), "confirmed work photos must still reach the report room");

console.log("PASS: Primary Vision routes documents and work photos without a second visual classifier");
