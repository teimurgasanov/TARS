"use strict";

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// New isolated files only. Unknown databases/versions are refused, never migrated.
function openDatabase(filename, schemaName, applicationId, timeout = 5000) {
  if (typeof filename !== "string" || !path.isAbsolute(filename) || filename.includes(":memory:")) {
    throw new TypeError("PAS requires an absolute persistent SQLite filename");
  }
  const db = new Database(filename, { timeout });
  try {
    db.pragma("foreign_keys = ON");
    db.pragma("synchronous = FULL");
    db.transaction(() => {
      const version = db.pragma("user_version", { simple: true });
      const app = db.pragma("application_id", { simple: true });
      if (version === 0 && app === 0) {
        const count = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").get().n;
        if (count !== 0) throw new Error("PAS refuses an existing foreign database");
        db.exec(fs.readFileSync(path.join(__dirname, schemaName), "utf8"));
        db.pragma("application_id = " + applicationId);
        db.pragma("user_version = 1");
      } else if (version !== 1 || app !== applicationId) {
        throw new Error("PAS database identity/version mismatch; migrations are not supported");
      }
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
