"use strict";
// Isolated client: built-ins + pure contract validators only. No PAS DB/core,
// no projection persistence, no callbacks or legacy financial fallback.
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { PROTOCOL, MAX_BODY, keys, id, assertPayload, assertData } = require("./protocol");

class PasClient {
  constructor({ baseUrl, token, timeoutMs = 2000 }) {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password
      || url.search || url.hash || url.pathname !== "/" || typeof token !== "string"
      || !/^[A-Za-z0-9_-]{32,256}$/.test(token) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new TypeError("Invalid local PAS client config");
    this.url = new URL("/v1/operation", url); this.token = token; this.timeoutMs = timeoutMs;
  }
  call(operation, payload, requestId = randomUUID()) {
    assertPayload(operation, payload); id(requestId);
    // Snapshot before network I/O; caller mutation cannot change validation later.
    const body = JSON.stringify({ protocol: PROTOCOL, requestId, operation, payload });
    if (Buffer.byteLength(body) > MAX_BODY) throw new TypeError("Request too large");
    const sent = JSON.parse(body);
    const commandId = sent.payload.commandId || null;
    return new Promise(resolve => {
      let settled = false; let timer;
      const finish = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const unknown = errorCode => finish({ outcome: "UNKNOWN", commandId, errorCode });
      const request = http.request(this.url, { method: "POST", agent: false, headers: {
        "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), Authorization: "Bearer " + this.token
      } }, response => {
        const chunks = []; let length = 0;
        response.on("data", chunk => {
          length += chunk.length;
          if (length > MAX_BODY * 100) { unknown("INVALID_RESPONSE"); response.destroy(); }
          else chunks.push(chunk);
        });
        response.on("aborted", () => unknown("TRANSPORT_ERROR"));
        response.on("error", () => unknown("TRANSPORT_ERROR"));
        response.on("end", () => {
          try {
            if (response.statusCode !== 200 || response.headers["content-type"] !== "application/json") throw new Error();
            const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
            keys(value, ["protocol", "requestId", "operation", "data"]);
            if (value.protocol !== PROTOCOL || value.requestId !== requestId || value.operation !== operation) throw new Error();
            assertData(operation, value.data, sent.payload);
            if (value.data && value.data.status === "AUTHORITY_UNAVAILABLE") return unknown("AUTHORITY_UNAVAILABLE");
            finish({ outcome: "KNOWN", data: value.data });
          } catch (_) { unknown("INVALID_RESPONSE"); }
        });
      });
      request.on("error", () => unknown("TRANSPORT_ERROR"));
      timer = setTimeout(() => { unknown("TIMEOUT"); request.destroy(); }, this.timeoutMs);
      request.end(body);
    });
  }
  confirmPayment(command, requestId) { return this.call("ConfirmPayment", command, requestId); }
  getCommandCompletion(commandId) { return this.call("GetCommandCompletion", { commandId }); }
  readEffects({ after = 0, limit = 50, includeCompleted = false } = {}) {
    return this.call("ReadFinancialEffects", { after, limit, includeCompleted });
  }
  acknowledgeEffect(acknowledgement) { return this.call("AcknowledgeFinancialEffect", acknowledgement); }
}
module.exports = { PasClient };
