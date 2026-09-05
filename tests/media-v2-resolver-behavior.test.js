const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function resolvePersonalImageMessageV2");
const end = source.indexOf("function messageDescriptorText", start);
assert(start >= 0 && end > start, "media-v2 resolver missing");

const resolver = new Function(
  "isPersonalTarsRoom",
  "messageImageFiles",
  "emitTarsTraceV1",
  `return (${source.slice(start, end).trim()});`
)(
  (room) => Boolean(room && room.personal),
  (message) => message && message.image ? [message.image] : message && message.file ? [message.file] : [],
  () => true
);

const logger = { info() {}, warn() {} };
const base = {
  id: "origin",
  room: { id: "room", personal: true },
  sender: { id: "master" },
  createdAt: new Date("2026-08-30T12:00:00.000Z"),
  text: "opaque"
};

function fakeRead({ direct = [], room = [] } = {}) {
  let directIndex = 0;
  let roomIndex = 0;
  let reads = 0;
  return {
    reads: () => reads,
    getMessageReader() {
      return {
        async getById() {
          reads += 1;
          return direct[Math.min(directIndex++, Math.max(0, direct.length - 1))];
        }
      };
    },
    getRoomReader() {
      return {
        async getMessages() {
          reads += 1;
          return room[Math.min(roomIndex++, Math.max(0, room.length - 1))] || [];
        }
      };
    }
  };
}

(async () => {
  const textRead = fakeRead({ direct: [base], room: [[base]] });
  const textResult = await resolver(base, textRead, logger, 1, 0, false);
  assert.strictEqual(textResult.__mediaV2NotSettled, false, "ordinary text must not become a failed upload");

  const failedUpload = await resolver(base, fakeRead({ direct: [base], room: [[base]] }), logger, 1, 0, true);
  assert.strictEqual(failedUpload.__mediaV2NotSettled, true, "a real media signal must report a terminal settle failure");

  const readyImage = { id: "ready", name: "ready.jpg", type: "image/jpeg" };
  const ready = { ...base, image: readyImage, file: readyImage };
  const readyRead = fakeRead();
  assert.strictEqual(await resolver(ready, readyRead, logger, 4, 0, true), ready, "ready media must return immediately");
  assert.strictEqual(readyRead.reads(), 0, "ready media must not hit Rocket.Chat readers");

  const sibling = {
    ...base,
    id: "upload-message",
    createdAt: new Date("2026-08-30T12:00:03.000Z"),
    image: { id: "sibling", name: "sibling.jpg", type: "image/jpeg" },
    file: { id: "sibling", name: "sibling.jpg", type: "image/jpeg" }
  };
  const siblingResult = await resolver(base, fakeRead({ direct: [base], room: [[base, sibling]] }), logger, 1, 0, false);
  assert.strictEqual(siblingResult.id, "upload-message", "a same-sender mobile upload with a second message id must be recovered");

  const namedOrigin = { ...base, text: "IMG_A.jpg" };
  const namedA = { ...sibling, id: "upload-a", image: { id: "a", name: "IMG_A.jpg" }, file: { id: "a", name: "IMG_A.jpg", type: "image/jpeg" } };
  const namedB = { ...sibling, id: "upload-b", image: { id: "b", name: "IMG_B.jpg" }, file: { id: "b", name: "IMG_B.jpg", type: "image/jpeg" } };
  const namedResult = await resolver(namedOrigin, fakeRead({ direct: [namedOrigin], room: [[namedOrigin, namedB, namedA]] }), logger, 1, 0, true);
  assert.strictEqual(namedResult.id, "upload-a", "a preliminary filename must settle only to its matching receipt");

  const ambiguousResult = await resolver(base, fakeRead({ direct: [base], room: [[base, namedA, namedB]] }), logger, 1, 0, false);
  assert.strictEqual(ambiguousResult.id, "origin", "an opaque event must not claim one of several adjacent receipts");

  const preview = {
    ...base,
    id: "preview-event",
    text: "IMG_PREVIEW.jpg",
    image: { id: "preview", name: "IMG_PREVIEW.jpg" },
    attachments: [{ title: { value: "IMG_PREVIEW.jpg" }, imageUrl: "/file-upload/preview/IMG_PREVIEW.jpg" }]
  };
  const canonical = {
    ...sibling,
    id: "canonical-event",
    image: { id: "canonical", name: "IMG_PREVIEW.jpg" },
    file: { id: "canonical", name: "IMG_PREVIEW.jpg", type: "image/jpeg" }
  };
  const canonicalResult = await resolver(preview, fakeRead({ direct: [preview], room: [[preview, canonical]] }), logger, 1, 0, true);
  assert.strictEqual(canonicalResult.id, "canonical-event", "an imageUrl-only preview must settle to the canonical upload message");

  const lonePreviewResult = await resolver(preview, fakeRead({ direct: [preview], room: [[preview]] }), logger, 1, 0, true);
  assert.strictEqual(lonePreviewResult.__mediaV2PreviewOnly, true, "a lone imageUrl must be marked for fallback processing after the original wait");

  const thumbFilePreview = {
    ...base,
    id: "thumb-file-event",
    file: { id: "thumb-upload", name: "thumb-IMG_FULL.jpg", type: "image/jpeg" }
  };
  const originalFileMessage = {
    ...thumbFilePreview,
    file: { id: "original-upload", name: "IMG_FULL.jpg", type: "image/jpeg" }
  };
  const originalAfterThumb = await resolver(thumbFilePreview, fakeRead({ direct: [originalFileMessage], room: [[]] }), logger, 1, 0, true);
  assert.strictEqual(originalAfterThumb.file.id, "original-upload", "a thumb-* message.file must wait for the full original instead of being treated as canonical");

  const olderSibling = { ...sibling, createdAt: new Date("2026-08-30T11:59:59.000Z") };
  const olderResult = await resolver(base, fakeRead({ direct: [base], room: [[base, olderSibling]] }), logger, 1, 0, false);
  assert.strictEqual(olderResult.id, "origin", "an older room photo must never be claimed by a new message");

  console.log("PASS: media-v2 resolver distinguishes text probes and recovers mobile sibling uploads");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
