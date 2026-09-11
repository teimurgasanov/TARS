"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function assertSchema(db, schemaName) {
  // Compare the actual tables, constraints and triggers, not just version labels.
  const reference = new Database(":memory:");
  try {
    reference.exec(fs.readFileSync(path.join(__dirname, schemaName), "utf8"));
    const objects = connection => connection.prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
    ).all();
    if (JSON.stringify(objects(db)) !== JSON.stringify(objects(reference))) throw new Error("PAS incompatible schema");
    if (db.pragma("quick_check", { simple: true }) !== "ok" || db.pragma("foreign_key_check").length) {
      throw new Error("PAS database integrity check failed");
    }
  } finally { reference.close(); }
}

// New isolated files only. Unknown databases/versions are refused, never migrated.
function openDatabase(filename, schemaName, applicationId, timeout = 5000, schemaVersion = 1, { existingOnly = false } = {}) {
  if (typeof filename !== "string" || !path.isAbsolute(filename) || filename.includes(":memory:")) {
    throw new TypeError("PAS requires an absolute persistent SQLite filename");
  }
  const db = new Database(filename, { timeout, fileMustExist: existingOnly });
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = FULL");
    db.transaction(() => {
      const version = db.pragma("user_version", { simple: true });
      const app = db.pragma("application_id", { simple: true });
      if (version === 0 && app === 0) {
        if (existingOnly) throw new Error("PAS requires an initialized authority database");
        const count = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n;
        if (count !== 0) throw new Error("PAS refuses an existing foreign database");
        db.exec(fs.readFileSync(path.join(__dirname, schemaName), "utf8"));
        db.pragma("application_id = " + applicationId);
        db.pragma("user_version = " + schemaVersion);
      } else if (version !== schemaVersion || app !== applicationId) {
        throw new Error("PAS database identity/version mismatch; migrations are not supported");
      }
      if (existingOnly) assertSchema(db, schemaName);
    }).immediate();
    // WAL allows concurrent readers; FULL ensures commit durability, including WAL.
    if (db.pragma("journal_mode = WAL", { simple: true }) !== "wal") {
      throw new Error("PAS requires WAL persistence");
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

module.exports = { openDatabase };
