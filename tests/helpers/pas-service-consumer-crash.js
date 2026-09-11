"use strict";
// Test-only crash barrier inside the actual reference consumer transaction.
const Database = require("../../pas/authority/node_modules/better-sqlite3");
const { IsolatedProjectionStore } = require("../../pas/authority/projection-store");
process.once("message", ({ filename, effect, phase }) => {
  if (phase === "beforeCommit") {
    const original = Database.prototype.prepare;
    Database.prototype.prepare = function (sql) {
      const statement = original.call(this, sql);
      if (/INSERT INTO EffectInbox/.test(sql)) {
        const run = statement.run.bind(statement);
        statement.run = (...args) => {
          const value = run(...args);
          process.send({ barrier: "beforeCommit" });
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
          return value;
        };
      }
      return statement;
    };
  }
  const store = new IsolatedProjectionStore(filename);
  const acknowledgement = store.applyEffect(effect);
  process.send({ barrier: "afterCommit", acknowledgement });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
});
