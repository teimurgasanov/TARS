"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "TarsReportApp.js"), "utf8");

class Association {
  constructor(model, key) {
    this.model = model;
    this.key = key;
  }
}

function loadReceiptCaseHelpers() {
  const helperStart = source.indexOf("function rightRotate(value, amount)");
  const helperEnd = source.indexOf("function hexBytes(value)", helperStart);
  if (helperStart < 0 || helperEnd <= helperStart) throw new Error("ReceiptCaseV1 helper section missing");
  return new Function(
    "RocketChatAssociationRecord",
    "RocketChatAssociationModel",
    `${source.slice(helperStart, helperEnd)}\nreturn {
      createTarsTraceV1, sanitizeTarsTraceEventV1,
      receiptCaseCorrelationsV1, sanitizeReceiptCaseV1,
      findReceiptCaseForInputV1, findOrCreateReceiptCaseV1,
      transitionReceiptCaseV1, manualTransitionReceiptCaseV1,
      scheduleReceiptCaseV1, flushReceiptCaseV1ForTests,
      resetReceiptCaseV1ForTests
    };`
  )(Association, { MISC: "misc" });
}

function createStore(options = {}) {
  const records = new Map();
  const history = [];
  const calls = { reads: 0, updates: 0, removes: 0 };
  const read = {
    getPersistenceReader() {
      return {
        async readByAssociation(association) {
          calls.reads += 1;
          if (options.readError) throw options.readError;
          const value = records.get(association.key);
          return value === undefined ? [] : [JSON.parse(JSON.stringify(value))];
        }
      };
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      calls.updates += 1;
      if (options.writeError) throw options.writeError;
      const copy = JSON.parse(JSON.stringify(value));
      records.set(association.key, copy);
      history.push({ kind: "update", key: association.key, value: copy });
    },
    async removeByAssociation(association) {
      calls.removes += 1;
      if (options.removeError) throw options.removeError;
      records.delete(association.key);
      history.push({ kind: "remove", key: association.key });
    }
  };
  return { read, persistence, records, history, calls };
}

module.exports = { source, loadReceiptCaseHelpers, createStore };
