"use strict";
const path = require("node:path");
const { configureAuth } = require("./auth");

function loadConfig(env = process.env) {
  if (env.PAS_LOCAL_ONLY !== "1") throw new Error("Local-only service requires explicit opt-in");
  if (!env.PAS_DB_PATH || !path.isAbsolute(env.PAS_DB_PATH) || env.PAS_DB_PATH.includes(":memory:")) throw new Error("Invalid DB path");
  const port = env.PAS_PORT === undefined ? 0 : Number(env.PAS_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port");
  const mode = env.PAS_DB_MODE || "existing";
  if (!["existing", "test-init"].includes(mode)) throw new Error("Invalid DB mode");
  return { filename: env.PAS_DB_PATH, port, mode,
    authenticate: configureAuth(JSON.parse(env.PAS_PRINCIPALS_JSON || "null")),
    dbTimeoutMs: 500, shutdownMs: 2000 };
}
module.exports = { loadConfig };
