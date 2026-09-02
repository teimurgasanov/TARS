"use strict";

const assert = require("assert");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

(async () => {
  const { TarsReportApp } = loadTrackedAppWithGuard();
  const app = Object.create(TarsReportApp.prototype);
  const room = { id: "personal-room", slugifiedName: "tars-master", type: "p" };
  const appUser = { id: "tars-user", username: "tars" };
  const oldMessage = { id: "old-selector", sender: appUser, room, text: "Что вы отправите?" };
  const records = new Map([["personal-image-selector:v3:personal-room", [{ roomId: room.id, messageId: oldMessage.id }]]]);
  const published = [];
  const deleted = [];
  let sequence = 0;

  const read = {
    getUserReader() {
      return {
        async getByUsername(username) { return username === "tars" ? appUser : undefined; },
        async getAppUser() { return appUser; }
      };
    },
    getPersistenceReader() {
      return {
        async readByAssociation(association) { return records.get(String(association && association.key || "")) || []; }
      };
    },
    getMessageReader() {
      return { async getById(id) { return id === oldMessage.id ? oldMessage : published.find((message) => message.id === id); } };
    }
  };

  const modify = {
    getCreator() {
      return {
        getBlockBuilder() {
          const blocks = [];
          return {
            addSectionBlock(block) { blocks.push({ type: "section", ...block }); },
            addActionsBlock(block) { blocks.push({ type: "actions", ...block }); },
            newMarkdownTextObject(text) { return { type: "mrkdwn", text }; },
            newPlainTextObject(text) { return { type: "plain_text", text }; },
            newButtonElement(button) { return { type: "button", ...button }; },
            __blocks: blocks
          };
        },
        startMessage() {
          const value = {};
          return {
            setSender(sender) { value.sender = sender; return this; },
            setRoom(target) { value.room = target; return this; },
            setText(text) { value.text = text; return this; },
            setBlocks(blocks) { value.blocks = blocks; return this; },
            __value: value
          };
        },
        async finish(builder) {
          const message = { id: `selector-${++sequence}`, ...builder.__value };
          published.push(message);
          return message.id;
        }
      };
    },
    getDeleter() {
      return { async deleteMessage(message) { deleted.push(message.id); } };
    }
  };

  const persistence = {
    async removeByAssociation(association) { records.delete(String(association && association.key || "")); },
    async createWithAssociation(value, association) { records.set(String(association && association.key || ""), [value]); }
  };

  app.isPersonalReportRoom = () => true;
  app.getLogger = () => ({ info() {}, warn() {}, error() {} });

  assert.strictEqual(await app.sendPersonalImageSelector(read, modify, persistence, room), true);
  assert.strictEqual(published.length, 1);
  assert.strictEqual(published[0].text, "Что вы отправите?");
  const buttons = published[0].blocks.__blocks.find((block) => block.type === "actions").elements;
  assert.deepStrictEqual(buttons.map((button) => button.text.text), ["📸 ФОТО", "🧾 ЧЕК", "✉️ РАССЫЛКА"]);
  assert.deepStrictEqual(deleted, ["old-selector"], "previous selector must be removed only after the replacement exists");
  assert.deepStrictEqual(records.get("personal-image-selector:v3:personal-room").map((record) => record.messageId), ["selector-1"]);

  console.log("PASS: personal rooms receive one standalone persistent image selector without a command");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
