const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function requestOpenAiWorkPhotoCheck");
const end = source.indexOf("async function fastForwardPersonalReportPhotos", start);
assert(start >= 0 && end > start, "work-photo routing block missing");
const block = source.slice(start, end);

assert(block.includes('return "document"'), "Vision document result must be preserved");
assert(block.includes('dedicatedPhotoKind === "document"'), "document result must be handled explicitly");
assert(block.includes('forward: false, reason: "document-or-screen"'), "bank documents must not become work photos");
assert(block.includes('dedicatedPhotoKind === "work"'), "confirmed salon work photos must remain automatic");
const strictGuard = block.indexOf("validateReceiptStrict");
const safeBlock = block.indexOf('forward: false, reason: "work-photo-not-strictly-confirmed"');
assert(strictGuard >= 0 && safeBlock > strictGuard, "inconclusive images must remain blocked after strict receipt exclusion");
assert(!block.includes('forward: true, reason: "verified-non-receipt-image"'), "unknown images must never be accepted by exclusion");

const routeStart = source.indexOf("async function protectedRoomForPersonalFile");
const routeEnd = source.indexOf("function normalizedUsername", routeStart);
assert(routeStart >= 0 && routeEnd > routeStart, "personal image routing block missing");
const route = source.slice(routeStart, routeEnd);
assert(route.includes("requestOpenAiWorkPhotoCheck"), "unknown images must receive the dedicated visual classification during final routing");
assert(route.includes('dedicatedPhotoKind === "document"'), "document/screen classification must survive into final routing");
assert(route.includes("return PROTECTED_ROOMS.kassa"), "documents/screens must be forced into receipt validation and control");
assert(route.includes('dedicatedPhotoKind === "work"'), "confirmed work photos must still reach the report room");

console.log("PASS: documents/screens continue to receipt routing and work photos remain automatic");
