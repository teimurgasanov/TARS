const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("async function resolvePersonalImageMessageV2");
const end = source.indexOf("function messageDescriptorText", start);
assert(start >= 0 && end > start, "media-v2 resolver missing");

const resolver = new Function(
  "isPersonalTarsRoom",
  "messageImageFiles",
  `return (${source.slice(start, end).trim()});`
)(
  (room) => Boolean(room && room.personal),
  (message) => message && message.image ? [message.image] : []
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

  const ready = { ...base, image: { id: "ready" } };
  const readyRead = fakeRead();
  assert.strictEqual(await resolver(ready, readyRead, logger, 4, 0, true), ready, "ready media must return immediately");
  assert.strictEqual(readyRead.reads(), 0, "ready media must not hit Rocket.Chat readers");

  const sibling = {
    ...base,
    id: "upload-message",
    createdAt: new Date("2026-08-30T12:00:03.000Z"),
    image: { id: "sibling" }
  };
  const siblingResult = await resolver(base, fakeRead({ direct: [base], room: [[base, sibling]] }), logger, 1, 0, false);
  assert.strictEqual(siblingResult.id, "upload-message", "a same-sender mobile upload with a second message id must be recovered");

  const olderSibling = { ...sibling, createdAt: new Date("2026-08-30T11:59:59.000Z") };
  const olderResult = await resolver(base, fakeRead({ direct: [base], room: [[base, olderSibling]] }), logger, 1, 0, false);
  assert.strictEqual(olderResult.id, "origin", "an older room photo must never be claimed by a new message");

  console.log("PASS: media-v2 resolver distinguishes text probes and recovers mobile sibling uploads");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
