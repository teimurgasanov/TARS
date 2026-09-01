"use strict";

const assert = require("assert");
const {
  loadTrackedAppWithGuard,
  readReceiptOcrConfigFromCanonicalBundle
} = require("./helpers/canonical-tars-runtime");

function associationKey(association) {
  return String(association && association.key || "");
}

(async () => {
  const config = await readReceiptOcrConfigFromCanonicalBundle({
    scanner2_shadow_mode: "RECORD_ONLY",
    scanner2_shadow_sample_percent: 100,
    scanner2_shadow_retention_days: 30,
    scanner2_shadow_max_records: 5000,
    receipt_timezone: "Europe/Astrakhan"
  });
  const runtime = loadTrackedAppWithGuard();
  const guard = runtime.__testGuard;
  assert.ok(guard && typeof guard.writeIndex === "function");
  assert.strictEqual(typeof guard.publishMasterTransferSummary, "function");

  const records = new Map();
  const publishedMessages = [];
  const persistenceReader = {
    async readByAssociation(association) {
      return records.get(associationKey(association)) || [];
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      records.set(associationKey(association), [value]);
    },
    async removeByAssociation(association) {
      records.delete(associationKey(association));
    },
    async createWithAssociation(value, association) {
      const key = associationKey(association);
      const existing = records.get(key) || [];
      records.set(key, existing.concat([value]));
      return value;
    }
  };
  const owner = { id: "jon-doe-id", username: "jon-doe", name: "Jon Doe" };
  const appUser = { id: "tars-id", username: "tars", name: "TARS" };
  const room = { id: "room-jon-doe", type: "d", slugifiedName: "tars-jon-doe" };
  const read = {
    getPersistenceReader() {
      return persistenceReader;
    },
    getUserReader() {
      return {
        async getByUsername(username) {
          if (username === "jon-doe") return owner;
          if (username === "tars") return appUser;
          return undefined;
        },
        async getAppUser() {
          return appUser;
        }
      };
    },
    getRoomReader() {
      return {
        async getMembers() {
          return [owner, appUser];
        },
        async getByName() {
          return undefined;
        }
      };
    }
  };
  const modify = {
    getCreator() {
      return {
        startMessage() {
          const state = {};
          return {
            setSender(sender) { state.sender = sender; return this; },
            setRoom(targetRoom) { state.room = targetRoom; return this; },
            setText(text) { state.text = text; return this; },
            __state: state
          };
        },
        async finish(builder) {
          publishedMessages.push(builder.__state);
          return `summary-${publishedMessages.length}`;
        }
      };
    },
    getUpdater() {
      return {
        async message() {
          return { getMessage() { return undefined; } };
        }
      };
    },
    getDeleter() {
      return { async deleteMessage() {} };
    }
  };
  const receipt = {
    source: "confirmed",
    exact: "receipt-1200-exact",
    receiptIdentity: "id:receipt-1200-test",
    receiptDate: "2026-09-01",
    receiptAmount: 1200,
    userId: owner.id,
    username: owner.username,
    roomId: room.id,
    messageId: "receipt-message-1200",
    uploadId: "receipt-upload-1200",
    uploadedAt: Date.now()
  };

  await guard.writeIndex(persistence, guard.PROTECTED_ROOMS.kassa.index, {
    version: 1,
    photos: [receipt]
  });
  const acceptedIndex = await guard.readIndex(read, guard.PROTECTED_ROOMS.kassa.index);
  assert.strictEqual(acceptedIndex.photos.length, 1, "accepted receipt index must contain the receipt");
  assert.strictEqual(acceptedIndex.photos[0].receiptAmount, 1200, "accepted index must preserve 1200 RUB");

  const published = await guard.publishMasterTransferSummary(
    receipt,
    { id: receipt.messageId, room, sender: owner },
    read,
    persistence,
    modify,
    config,
    { warn() {}, info() {} },
    true,
    [receipt]
  );
  assert.strictEqual(published, true, "running total publisher must complete");
  assert.strictEqual(publishedMessages.length, 1, "one running total message must be created");
  const text = publishedMessages[0].text.replace(/[\u00a0\u202f]/g, " ");
  assert.match(text, /Чеков: 1/);
  assert.match(text, /Общая сумма чеков: 1 200 ₽/);

  console.log("PASS: configured personal receipt reaches accepted index and running total 1 / 1200 RUB");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
