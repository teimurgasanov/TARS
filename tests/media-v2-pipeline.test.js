const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const pendingStart = source.indexOf("function messageLooksLikePendingImageUpload");
const pendingEnd = source.indexOf("async function resolvePersonalImageMessageV2", pendingStart);
assert(pendingStart >= 0 && pendingEnd > pendingStart, "filename-only upload detector missing");
const pendingDetector = eval(`(${source.slice(pendingStart, pendingEnd).trim()})`);
assert.strictEqual(pendingDetector({ text: "IMG_0003.jpg" }), true, "mobile JPEG filename must be treated as a pending upload");
assert.strictEqual(pendingDetector({ text: "photo.HEIC" }), true, "mobile HEIC filename must be treated as a pending upload");
assert.strictEqual(pendingDetector({ text: "покажи отчёт" }), false, "ordinary text must not enter the upload settle loop");
const start = source.indexOf("async function resolvePersonalImageMessageV2");
const end = source.indexOf("function messageDescriptorText", start);
assert(start >= 0 && end > start, "media-v2 resolver missing");
const block = source.slice(start, end);

assert(block.includes("getMessageReader().getById(messageId)"), "media-v2 must re-read the canonical message");
assert(block.includes("getRoomReader().getMessages(roomId"), "media-v2 must fall back to room history when the canonical message is stale");
assert(block.includes("attempt < maxAttempts"), "media-v2 must use the caller-selected upload settle window");
assert(block.includes("messageImageFiles(roomMessage).length"), "media-v2 must only finish after the room message exposes an image");
assert(block.includes("MEDIA_V2_NOT_SETTLED"), "media-v2 must log a terminal settle failure instead of silently losing the image");
assert(block.includes("__mediaV2NotSettled: Boolean(expectMedia)"), "only a message with an actual media signal may report a terminal upload failure");
assert(block.includes("source=sibling-message"), "a mobile upload finalized under a second message id must still be recoverable");
assert(block.includes("__mediaV2PreviewOnly: isPreviewOnlyMessage(bestMessage)"), "an imageUrl-only preview must be marked instead of entering OCR independently");

const controllerStart = source.indexOf("async function processPersonalMediaV2");
const controllerEnd = source.indexOf("function isTodayTransferSumRequest", controllerStart);
assert(controllerStart >= 0 && controllerEnd > controllerStart, "media-v2 controller missing");
const controller = source.slice(controllerStart, controllerEnd);
assert(controller.includes("messageImageFiles(message)"), "media-v2 controller must enumerate every image in the settled message");
assert(controller.includes("await rejectDuplicateMessage"), "media-v2 controller must invoke the tested OCR, duplicate and ledger domain engine");
assert(controller.includes("MEDIA_V2_FINISH"), "media-v2 controller must log a terminal outcome for every image message");

const handlerStart = source.indexOf("async executePostMessageSent");
const handlerEnd = source.indexOf("async receiptOcrConfig", handlerStart);
const handler = source.slice(handlerStart, handlerEnd);
assert(handler.includes("G.processPersonalMediaV2"), "post-message handling must enter the media-v2 controller");
assert(!handler.includes("G.rejectDuplicateMessage"), "post-message handling must not bypass media-v2");
assert(handler.includes("hasInitialMediaSignal"), "strong media signals must select the extended upload settle window");
assert(handler.includes("G.messageLooksLikePendingImageUpload(e)"), "a filename-only preliminary upload event must enter the settle loop");
assert(handler.includes("if (G.isPersonalTarsRoom(e && e.room))"), "opaque mobile upload placeholders must still enter the short settle loop");
assert(handler.includes("hasInitialMediaSignal ? 16 : 6"), "explicit uploads need the long settle window and opaque placeholders need the former short fallback");
assert(handler.includes("...settledMessage,\n        ...originalEvent"), "settled media must be merged without losing authoritative sender and room fields");
assert(handler.includes("id: settledHasImages ? settledMessage && settledMessage.id"), "a sibling upload must use its canonical settled message id");
assert(handler.includes("settledMessage.files.length ? settledMessage.files : originalEvent"), "empty settled arrays must not overwrite media from the original event");
assert(handler.includes("hasInitialMediaSignal ? 750 : 400, hasInitialMediaSignal"), "the resolver must distinguish a real upload failure from an opaque text probe");
assert(handler.includes("G.isPersonalTarsRoom(e && e.room) && resolvedImages.length > 0"), "every branch must use messageImageFiles as the single image detector");
assert(handler.includes("!G.messageImageFiles(e).length && recentPostMessageIds.has(messageId)"), "an attachment-only image event must never be suppressed by message-id deduplication");
assert(handler.includes("await this.clearTransferReportIntent(s, e.room)"), "receipt intent must be cleared after successful processing");
assert(handler.includes("ФАЙЛ НЕ ОБРАБОТАН"), "a terminal upload failure must be visible to the master");
assert(handler.includes("POST_PROBE_PREVIEW_FALLBACK"), "an imageUrl-only upload must enter guarded fallback processing after the original wait");
assert(!handler.includes("POST_PROBE_SKIP_PREVIEW_ONLY"), "an imageUrl-only upload must not be silently discarded");
assert(handler.includes("recentPostUploadIds.delete(uploadEventKey)"), "failed processing must release local upload deduplication immediately");

const checkStart = source.indexOf("async checkPostMessageSent");
const checkEnd = source.indexOf("async executePostMessageSent", checkStart);
const checkHandler = source.slice(checkStart, checkEnd);
assert(checkHandler.includes("getRoomReader().getById(eventRoom.id)"), "a room-id-only upload event must be hydrated before the personal-room check");
assert(handler.includes("getRoomReader().getById(e.room.id)"), "the media handler must retain the hydrated personal room");

console.log("PASS: media-v2 independently settles personal photos and receipts");
