"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function createRuntime(sender) {
  const loaded = loadTrackedAppWithGuard();
  const app = Object.create(loaded.TarsReportApp.prototype);
  app.getLogger = () => ({ info() {}, warn() {}, error() {} });
  app.formatRubles = (value) => `${Number(value)}`;
  const room = { id: "master-room", type: "p", slugifiedName: "tars-master" };
  const appUser = { id: "tars-id", username: "tars" };
  const teimur = { id: "teimur-id", username: "teimur" };
  const shura = { id: "shura-id", username: "shura" };
  const notifications = [];
  const publicMessages = [];
  const counters = { persistenceReads: 0 };
  const receipt = {
    exact: "a".repeat(64), receiptIdentity: "id:private-list", source: "rejected",
    receiptAmount: 600, receiptDate: "2026-09-06", invalidReason: "control",
    roomId: room.id, messageId: "source-message", uploadId: "source-upload", userId: "master-id", uploadedAt: 1
  };
  const read = {
    getUserReader() {
      return {
        async getByUsername(username) {
          return { tars: appUser, teimur, shura }[username];
        },
        async getAppUser() { return appUser; }
      };
    },
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          counters.persistenceReads += 1;
          return String(association && association.key || "") === "receipt-duplicate-index-v1" ? [{ version: 1, photos: [receipt] }] : [];
        }
      };
    },
    getMessageReader() {
      return {
        async getById() {
          return { id: "source-message", room, file: { _id: "source-upload", type: "image/jpeg" } };
        }
      };
    },
    getUploadReader() {
      return {
        async getById(uploadId) {
          return uploadId === "source-upload" ? { id: uploadId, type: "image/jpeg" } : undefined;
        }
      };
    }
  };
  const blockBuilder = {
    actions: [],
    newPlainTextObject(text) { return { text }; },
    newButtonElement(value) { return value; },
    addActionsBlock(block) { this.actions.push(block); return this; }
  };
  const notifier = {
    getMessageBuilder() {
      const state = {};
      return {
        setSender(value) { state.sender = value; return this; },
        setRoom(value) { state.room = value; return this; },
        setText(value) { state.text = value; return this; },
        setBlocks(value) { state.blocks = value; return this; },
        getMessage() { return state; }
      };
    },
    async notifyUser(user, message) { notifications.push({ user, message }); }
  };
  const modify = {
    getNotifier() { return notifier; },
    getCreator() {
      return {
        getBlockBuilder() { return blockBuilder; },
        async finish(message) { publicMessages.push(message); }
      };
    }
  };
  return { app, sender, room, read, modify, notifications, publicMessages, counters, blockBuilder };
}

(async () => {
  const unauthorized = createRuntime({ id: "master-id", username: "master" });
  await unauthorized.app.handlePrivateReceiptControlCommand(unauthorized.read, unauthorized.modify, {}, unauthorized.room, unauthorized.sender);
  assert.strictEqual(unauthorized.counters.persistenceReads, 0, "unauthorized actor must be rejected before receipt persistence access");
  assert.strictEqual(unauthorized.notifications.length, 1);
  assert.match(unauthorized.notifications[0].message.text, /только Теймуру и Шуре/);
  assert.strictEqual(unauthorized.publicMessages.length, 0, "private list must never publish a room message");
  let unauthorizedApprovalCalls = 0;
  unauthorized.app.approveReceiptThroughSharedService = async () => {
    unauthorizedApprovalCalls += 1;
    return { status: "approved" };
  };
  await unauthorized.app.handlePrivateReceiptControlButton(unauthorized.read, unauthorized.modify, {}, {
    user: unauthorized.sender,
    room: unauthorized.room,
    value: "rce_" + "a".repeat(32)
  });
  assert.strictEqual(unauthorizedApprovalCalls, 0, "unauthorized action must stop before approval/index access");
  assert.strictEqual(unauthorized.counters.persistenceReads, 0);

  const authorized = createRuntime({ id: "teimur-id", username: "teimur" });
  await authorized.app.handlePrivateReceiptControlCommand(authorized.read, authorized.modify, {}, authorized.room, authorized.sender);
  assert.strictEqual(authorized.counters.persistenceReads, 1);
  assert.strictEqual(authorized.notifications.length, 1);
  assert.match(authorized.notifications[0].message.text, /Приватный контроль чеков/);
  assert.strictEqual(authorized.blockBuilder.actions.length, 1);
  const button = authorized.blockBuilder.actions[0].elements[0];
  assert.strictEqual(button.actionId, "approve-private-receipt-control-v1");
  assert.match(button.value, /^rce_[a-f0-9]{32}$/);
  assert(!JSON.stringify(authorized.notifications).includes("a".repeat(64)), "exact hash must not reach private UI payload");
  assert.strictEqual(authorized.publicMessages.length, 0);

  console.log("PASS: private CONTROL list is ephemeral and server-authorized before receipt data access");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
