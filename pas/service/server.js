"use strict";
const http = require("node:http");
const fs = require("node:fs");
const { PaymentAuthority } = require("../authority");
const { PROTOCOL, MAX_BODY, OPERATIONS, assertEnvelope, assertPayload, assertData } = require("../transport/protocol");

function openAuthority(config) {
  if (config.mode === "test-init") {
    // Exclusive creation: initialization never overwrites or adopts an existing file.
    const fd = fs.openSync(config.filename, "wx", 0o600);
    fs.closeSync(fd);
    const initialized = new PaymentAuthority(config.filename, { timeout: config.dbTimeoutMs });
    initialized.close();
  }
  return new PaymentAuthority(config.filename, { existingOnly: true, timeout: config.dbTimeoutMs });
}

async function startService(config) {
  const authority = openAuthority(config);
  let ready = true;
  let stopping = false;
  let shutdownPromise;
  const server = http.createServer({ requestTimeout: 2000, headersTimeout: 2000, maxHeaderSize: 8192 }, (req, res) => {
    let envelope;
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const fail = (status, code) => send(status, { protocol: PROTOCOL,
      requestId: envelope ? envelope.requestId : null, operation: envelope ? envelope.operation : null, error: { code } });
    if (req.method === "GET" && req.url === "/livez") return send(200, { alive: true });
    if (req.method === "GET" && req.url === "/readyz") return send(ready && !stopping ? 200 : 503, { ready: ready && !stopping, protocol: PROTOCOL });
    if (req.method !== "POST" || req.url !== "/v1/operation") return fail(404, "NOT_FOUND");
    if (stopping || !ready) return fail(503, "NOT_READY");
    const roles = config.authenticate(req);
    if (!roles) { req.resume(); return fail(401, "UNAUTHENTICATED"); }
    if (req.headers["content-type"] !== "application/json" || req.headers["content-encoding"] !== undefined) {
      req.resume(); return fail(415, "INVALID_CONTENT_TYPE");
    }
    let length = 0; const chunks = []; let rejected = false;
    const timer = setTimeout(() => { rejected = true; fail(408, "REQUEST_TIMEOUT"); req.destroy(); }, 2000);
    const clear = () => clearTimeout(timer);
    req.on("aborted", clear); req.on("error", clear);
    res.on("close", clear);
    req.on("data", chunk => {
      if (rejected) return;
      length += chunk.length;
      if (length > MAX_BODY) { rejected = true; chunks.length = 0; clear(); fail(413, "BODY_TOO_LARGE"); }
      else chunks.push(chunk);
    });
    req.on("end", () => {
      clear();
      if (rejected || res.destroyed) return;
      if (stopping || !ready) return fail(503, "NOT_READY");
      let parsed;
      try {
        // Reject malformed UTF-8 rather than silently replacing bytes in financial data.
        parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        assertEnvelope(parsed); envelope = parsed;
      } catch (_) { return fail(400, "MALFORMED_REQUEST"); }
      if (envelope.protocol !== PROTOCOL) return fail(400, "UNSUPPORTED_PROTOCOL");
      if (!Object.hasOwn(OPERATIONS, envelope.operation)) return fail(400, "UNSUPPORTED_OPERATION");
      if (!roles.has(OPERATIONS[envelope.operation])) return fail(403, "FORBIDDEN");
      if (envelope.operation === "ConfirmPayment" && envelope.payload && envelope.payload.version !== "PAS_CONFIRM_PAYMENT_V1") {
        return fail(400, "UNSUPPORTED_COMMAND_VERSION");
      }
      try { assertPayload(envelope.operation, envelope.payload); }
      catch (_) { return fail(400, "MALFORMED_REQUEST"); }
      // Accepted work is synchronous and DB lock wait is bounded. No network work
      // or consumer callback runs inside the authority transaction.
      try {
        let data;
        switch (envelope.operation) {
          case "ConfirmPayment": data = authority.confirmPayment(envelope.payload); break;
          case "GetCommandCompletion": data = authority.getCommandCompletion(envelope.payload.commandId); break;
          case "ReadFinancialEffects": data = authority.readEffects(envelope.payload); break;
          case "AcknowledgeFinancialEffect": data = authority.acknowledgeEffect(envelope.payload); break;
        }
        assertData(envelope.operation, data, envelope.payload);
        if (data && data.status === "AUTHORITY_UNAVAILABLE") { ready = false; return fail(503, "AUTHORITY_UNAVAILABLE"); }
        send(200, { protocol: PROTOCOL, requestId: envelope.requestId, operation: envelope.operation, data });
      } catch (_) { ready = false; fail(503, "AUTHORITY_UNAVAILABLE"); }
    });
  });
  server.keepAliveTimeout = 1000;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    });
  } catch (error) { authority.close(); throw error; }
  return { port: server.address().port, shutdown() {
    if (shutdownPromise) return shutdownPromise;
    stopping = true; ready = false;
    shutdownPromise = new Promise(resolve => {
      const deadline = setTimeout(() => server.closeAllConnections(), config.shutdownMs);
      server.close(() => { clearTimeout(deadline); authority.close(); resolve(); });
    });
    return shutdownPromise;
  } };
}
module.exports = { startService };
