"use strict";
const { createHash, timingSafeEqual } = require("node:crypto");
const { keys, id } = require("../transport/protocol");
const hash = token => createHash("sha256").update(token).digest();

function configureAuth(principals) {
  if (!Array.isArray(principals) || !principals.length || principals.length > 16) throw new Error("Invalid principals");
  const ids = new Set(); const tokens = new Set(); const consumers = new Set();
  const entries = principals.map(p => {
    keys(p, ["id", "token", "roles"]); id(p.id);
    if (typeof p.token !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(p.token)
      || ids.has(p.id) || tokens.has(p.token) || !Array.isArray(p.roles) || !p.roles.length
      || p.roles.some(role => !["command", "consumer"].includes(role)) || new Set(p.roles).size !== p.roles.length) throw new Error("Invalid principal");
    ids.add(p.id); tokens.add(p.token);
    if (p.roles.includes("consumer")) consumers.add(p.id);
    return { hash: hash(p.token), roles: new Set(p.roles) };
  });
  if (consumers.size !== 1 || !entries.some(p => p.roles.has("command"))) throw new Error("One consumer and command authority required");
  return request => {
    const headers = request.rawHeaders.filter((_, i) => i % 2 === 0).filter(name => name.toLowerCase() === "authorization");
    if (headers.length !== 1 || !/^Bearer [A-Za-z0-9_-]{32,256}$/.test(request.headers.authorization || "")) return null;
    const supplied = hash(request.headers.authorization.slice(7));
    let roles = null;
    for (const entry of entries) if (timingSafeEqual(supplied, entry.hash)) roles = entry.roles;
    return roles;
  };
}
module.exports = { configureAuth };
