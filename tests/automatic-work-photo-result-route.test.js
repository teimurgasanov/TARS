const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function processPersonalMediaV2");
const end = source.indexOf("function isTodayTransferSumRequest", start);
assert(start >= 0 && end > start, "personal media-v2 controller missing");
const controller = source.slice(start, end);

const photoRoute = controller.indexOf("await fastForwardPersonalReportPhotos");
const financialRoute = controller.indexOf("await rejectDuplicateMessage");
assert(photoRoute >= 0, "automatic work-photo route to result must be active");
assert(financialRoute > photoRoute, "work photos must reach the result route before the financial pipeline");
assert(controller.includes('forcedIntent !== "receipt"'), "an explicit receipt must never enter the work-photo route");
assert(controller.includes('forcedIntent === "photo"'), "explicit photo intent must use the same guarded work-photo route");
assert(controller.includes('"work-photo-forwarded"'), "successful result delivery must be terminal and observable");
assert(controller.includes("notifyWorkPhotoAccepted"), "the master must receive one confirmation after successful forwarding");

const publishStart = source.indexOf("async function publishDirectReportPhotos");
const publishEnd = source.indexOf("async function publishPendingReportPhotos", publishStart);
assert(publishStart >= 0 && publishEnd > publishStart, "queued result photo publisher missing");
const publisher = source.slice(publishStart, publishEnd);
assert(publisher.includes("shouldForwardConfirmedWorkPhoto"), "queued delivery must use the same signs-based work-photo decision");
assert(!publisher.includes('confirmedKind !== "photo"'), "queued delivery must not reapply the narrower legacy classifier");

console.log("PASS: signs-based work photos use an independent guarded route to result");
