"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { spawn, fork } = require("node:child_process");
const Database = require("../pas/authority/node_modules/better-sqlite3");
const { PaymentAuthority } = require("../pas/authority");
const { IsolatedProjectionStore } = require("../pas/authority/projection-store");
const { buildConfirmPaymentCommand } = require("../pas/contracts");
const { PasClient } = require("../pas/transport/client");
const { PROTOCOL, MAX_BODY, assertData } = require("../pas/transport/protocol");
const { loadConfig } = require("../pas/service/config");
const root = path.resolve(__dirname, "..");
// Synthetic credentials injected into child environments; never operational secrets.
const commandToken = "synthetic_command_" + "c".repeat(32);
const consumerToken = "synthetic_consumer_" + "e".repeat(32);
const principals = [{ id: "test-command", token: commandToken, roles: ["command"] },
  { id: "test-consumer", token: consumerToken, roles: ["consumer"] }];
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pas-service-test-"));
const filename = path.join(directory, "authority.sqlite");
const children = []; const servers = []; const logs = [];
let tests = 0;
function command(commandId, mode = "AUTO") {
  const fields = { amount: { minorUnits: 12300, currency: "RUB" }, date: "2026-09-10" };
  return buildConfirmPaymentCommand({ commandId, mode,
    actor: { kind: mode === "AUTO" ? "SYSTEM" : "OPERATOR", reference: "synthetic-actor" },
    observation: { messageId: "m-" + commandId, uploadId: "u-" + commandId },
    receiptEvidence: { receiptCaseId: "case-" + commandId },
    ...(mode === "AUTO" ? { extracted: fields } : { manualCorrections: fields }) });
}
function env(db = filename, mode = "existing") {
  // Do not inherit production/service credentials from the host.
  return { PATH: process.env.PATH, PAS_LOCAL_ONLY: "1", PAS_DB_PATH: db,
    PAS_DB_MODE: mode, PAS_PORT: "0", PAS_PRINCIPALS_JSON: JSON.stringify(principals) };
}
function launch(db = filename, mode = "existing", overrides = {}, acceptedBarrier = false) {
  const child = spawn(process.execPath, [path.join(root, acceptedBarrier ? "tests/helpers/pas-service-accepted-barrier.js" : "pas/service/entrypoint.js")], {
    cwd: root, env: { ...env(db, mode), ...overrides }, stdio: acceptedBarrier ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  child.output = "";
  child.stdout.on("data", b => { child.output += b; logs.push(String(b)); });
  child.stderr.on("data", b => { child.output += b; logs.push(String(b)); });
  child.ended = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  return child;
}
async function started(db = filename, mode = "existing", overrides = {}, acceptedBarrier = false) {
  const child = launch(db, mode, overrides, acceptedBarrier);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("service start deadline")), 8000);
    child.stdout.on("data", () => {
      const line = child.output.split("\n").find(line => line.includes('"PAS_READY"'));
      if (line) { child.port = JSON.parse(line).port; clearTimeout(timer); resolve(); }
    });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("service exited before readiness")); });
    child.once("error", error => { clearTimeout(timer); reject(error); });
  });
  child.url = "http://127.0.0.1:" + child.port;
  return child;
}
async function stop(child, signal = "SIGTERM") {
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  return child.ended;
}
function client(service, token = commandToken, timeoutMs = 2000) { return new PasClient({ baseUrl: service.url, token, timeoutMs }); }
function envelope(operation, payload, requestId = "attempt-1") { return { protocol: PROTOCOL, operation, requestId, payload }; }
function raw(service, body, token = commandToken, options = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === "string" ? body : JSON.stringify(body);
    const req = http.request(service.url + (options.path || "/v1/operation"), { method: options.method || "POST", agent: false,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...options.headers } }, res => {
      const chunks = [];
      res.on("data", b => chunks.push(b));
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      res.on("error", reject);
    });
    req.on("error", reject); req.end(data);
  });
}
function snapshot(db = filename) {
  const sql = new Database(db, { readonly: true, fileMustExist: true });
  try {
    return ["PaymentSlot", "ConfirmedPayment", "IdentityAlias", "CommandLog", "CommandEvidence", "FinancialEffect", "CommandEffect"]
      .map(table => sql.prepare("SELECT * FROM " + table).all());
  } finally { sql.close(); }
}
async function test(name, fn) { await fn(); tests++; console.log("PASS: " + name); }
async function listen(handler) {
  const server = http.createServer(handler); servers.push(server);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  return { server, url: "http://127.0.0.1:" + server.address().port };
}
async function proxy(service, behavior) {
  let observedResolve;
  const observed = new Promise(resolve => { observedResolve = resolve; });
  const result = await listen((req, res) => {
    const upstream = http.request(service.url + req.url, { method: req.method, headers: req.headers, agent: false }, response => {
      const chunks = []; response.on("data", b => chunks.push(b));
      response.on("end", () => {
        observedResolve(JSON.parse(Buffer.concat(chunks).toString()));
        if (behavior === "drop") res.destroy();
        // Hold deliberately sends nothing; real client deadline terminates the attempt.
      });
    });
    upstream.on("error", () => res.destroy()); req.pipe(upstream);
  });
  return { ...result, observed };
}
async function crashConsumer(db, effect, phase) {
  const child = fork(path.join(__dirname, "helpers/pas-service-consumer-crash.js"), [], { env: { PATH: process.env.PATH }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
  children.push(child); child.ended = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  const barrier = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("consumer barrier deadline")), 5000);
    child.once("message", value => { clearTimeout(timer); resolve(value); });
    child.once("exit", () => { clearTimeout(timer); reject(new Error("consumer exited before barrier")); });
  });
  child.send({ filename: db, effect, phase });
  assert.equal((await barrier).barrier, phase);
  await stop(child, "SIGKILL");
}
function projectionCounts(db) {
  const sql = new Database(db);
  try { return ["Projection", "EffectInbox"].map(t => sql.prepare("SELECT count(*) AS n FROM " + t).get().n); }
  finally { sql.close(); }
}

(async () => {
  assert.equal(process.versions.node.split(".")[0], "20", "Node 20 is required");
  let service;
  await test("explicit test-init starts separate process with live/ready contract", async () => {
    service = await started(filename, "test-init"); assert.notEqual(service.pid, process.pid);
    assert.equal((await raw(service, "", null, { method: "GET", path: "/livez" })).body.alive, true);
    const ready = await raw(service, "", null, { method: "GET", path: "/readyz" });
    assert.equal(ready.status, 200); assert.equal(ready.body.protocol, PROTOCOL);
  });
  await test("normal startup refuses missing, empty, incompatible, damaged and locked DB; never initializes", async () => {
    const missing = path.join(directory, "missing.sqlite");
    assert.equal((await launch(missing).ended).code, 1); assert.equal(fs.existsSync(missing), false);
    const empty = path.join(directory, "empty.sqlite"); fs.writeFileSync(empty, "");
    assert.equal((await launch(empty).ended).code, 1); assert.equal(fs.statSync(empty).size, 0);
    const wrong = path.join(directory, "wrong.sqlite");
    const sql = new Database(wrong); sql.pragma("user_version = 99"); sql.close();
    assert.equal((await launch(wrong).ended).code, 1);
    const malformed = path.join(directory, "malformed.sqlite"); new PaymentAuthority(malformed).close();
    const altered = new Database(malformed); altered.exec("DROP TRIGGER command_no_update"); altered.close();
    assert.equal((await launch(malformed).ended).code, 1);
    const damaged = path.join(directory, "damaged.sqlite"); fs.writeFileSync(damaged, "not SQLite");
    assert.equal((await launch(damaged).ended).code, 1);
    assert.equal((await launch(directory).ended).code, 1);
    const lock = new Database(filename); lock.exec("BEGIN IMMEDIATE");
    try { assert.equal((await launch().ended).code, 1); } finally { lock.exec("ROLLBACK"); lock.close(); }
    assert.equal((await launch(filename, "test-init").ended).code, 1);
    assert.equal((await launch(filename, "existing", { PAS_PRINCIPALS_JSON: "invalid" }).ended).code, 1);
    assert.equal((await launch(filename, "existing", { PAS_LOCAL_ONLY: "" }).ended).code, 1);
  });
  const auto = command("auto"); let original;
  await test("AUTO and MANUAL without AI use same authority; successful responses have canonical IDs", async () => {
    original = await client(service).confirmPayment(auto);
    assert.equal(original.outcome, "KNOWN"); assert.equal(original.data.status, "CONFIRMED"); assert.ok(original.data.canonicalPaymentId);
    const manual = command("manual", "MANUAL");
    const manualResult = await client(service).confirmPayment(manual);
    assert.equal(manualResult.data.status, "CONFIRMED"); assert.ok(manualResult.data.canonicalPaymentId);
    const association = { ...manual, commandId: "manual-representation", observation: { messageId: "new", uploadId: "new" } };
    assert.equal((await client(service).confirmPayment(association)).data.status, "ALREADY_CONFIRMED");
    const sql = new Database(filename);
    const row = sql.prepare("SELECT * FROM ConfirmedPayment WHERE canonicalPaymentId = ?").get(manualResult.data.canonicalPaymentId);
    assert.equal(row.amountMinorUnits, manual.payment.amount.value.minorUnits); assert.equal(row.paymentDate, manual.payment.date.value);
    assert.equal(JSON.parse(row.firstCommandJson).payment.amount.provenance.source, "MANUAL_CORRECTION"); sql.close();
  });
  await test("commandId replay survives different requestId; changed payload conflicts; concurrent HTTP duplicates", async () => {
    assert.deepEqual(await client(service).confirmPayment(auto, "attempt-2"), original);
    const changed = structuredClone(auto); changed.payment.amount.value.minorUnits++;
    assert.equal((await client(service).confirmPayment(changed)).data.reasonCode, "COMMAND_ID_REUSED");
    const duplicate = command("concurrent");
    const replies = await Promise.all(Array.from({ length: 8 }, (_, i) => client(service).confirmPayment(duplicate, "concurrent-" + i)));
    for (const r of replies) assert.deepEqual(r, replies[0]);
    const rows = snapshot(); assert.equal(rows[1].length, 3);
    assert.equal((await client(service).getCommandCompletion(auto.commandId)).data.result.canonicalPaymentId, original.data.canonicalPaymentId);
    assert.equal((await client(service).getCommandCompletion("absent")).data, null);
  });
  await test("auth failures and cross-role operations cause no mutation; explicit both-role grant only", async () => {
    const before = snapshot(); const body = envelope("ConfirmPayment", command("forbidden"));
    for (const token of [null, "bad", "b".repeat(40)]) assert.equal((await raw(service, body, token)).status, 401);
    assert.equal((await raw(service, body, consumerToken)).status, 403);
    const ack = envelope("AcknowledgeFinancialEffect", { effectId: "none", payloadDigest: "0".repeat(64) });
    assert.equal((await raw(service, ack)).status, 403);
    assert.equal((await raw(service, envelope("ReadFinancialEffects", { after: 0, limit: 1, includeCompleted: false }))).status, 403);
    assert.equal((await raw(service, envelope("GetCommandCompletion", { commandId: "auto" }), consumerToken)).status, 403);
    assert.deepEqual(snapshot(), before);
    const both = [{ ...principals[0], roles: ["command", "consumer"] }];
    const combined = await started(filename, "existing", { PAS_PRINCIPALS_JSON: JSON.stringify(both) });
    assert.equal((await client(combined).readEffects()).outcome, "KNOWN"); await stop(combined);
    assert.throws(() => loadConfig({ ...env(), PAS_PRINCIPALS_JSON: JSON.stringify(principals.map(p => ({ ...p, roles: ["command", "consumer"] }))) }));
  });
  await test("malformed JSON, oversized, unknown protocol/version, deferred operations and unknown fields never mutate", async () => {
    const before = snapshot();
    assert.equal((await raw(service, "{")).status, 400);
    assert.equal((await raw(service, " ".repeat(MAX_BODY + 1))).status, 413);
    assert.equal((await raw(service, { ...envelope("ConfirmPayment", auto), protocol: "PAS_HTTP_V99" })).body.error.code, "UNSUPPORTED_PROTOCOL");
    assert.equal((await raw(service, envelope("ConfirmPayment", { ...auto, version: "PAS_CONFIRM_PAYMENT_V99" }))).body.error.code, "UNSUPPORTED_COMMAND_VERSION");
    for (const operation of ["AssociateObservation", "ResolvePayment", "GetPayment", "CorrectPendingObservation", "VoidAndReplacePayment", "constructor", "__proto__", "unknown"]) {
      assert.equal((await raw(service, envelope(operation, {}))).body.error.code, "UNSUPPORTED_OPERATION");
    }
    const malformed = structuredClone(auto); malformed.payment.date.value = "2026-02-30";
    for (const cmd of [malformed, { ...auto, canonicalPaymentId: "invented" }, { ...auto, commandId: "" }]) {
      assert.equal((await raw(service, envelope("ConfirmPayment", cmd))).status, 400);
    }
    assert.equal((await raw(service, envelope("ConfirmPayment", auto), commandToken, { path: "/v1/operation?token=synthetic" })).status, 404);
    assert.deepEqual(snapshot(), before);
  });
  await test("timeout after durable commit remains UNKNOWN and recovers original commandId", async () => {
    const held = await proxy(service, "hold"); const input = command("timeout");
    const sending = client(held, commandToken, 500).confirmPayment(input);
    const durable = await held.observed; assert.equal(durable.data.status, "CONFIRMED");
    const reply = await sending; assert.equal(reply.outcome, "UNKNOWN"); assert.equal(reply.errorCode, "TIMEOUT"); assert.equal(reply.commandId, input.commandId);
    assert.deepEqual((await client(service).getCommandCompletion(input.commandId)).data.result, durable.data);
    assert.deepEqual((await client(service).confirmPayment(input)).data, durable.data);
  });
  await test("lost HTTP response after commit, abrupt service crash, reconnect and durable replay/effects", async () => {
    const dropped = await proxy(service, "drop"); const input = command("lost-response");
    assert.equal((await client(dropped).confirmPayment(input)).outcome, "UNKNOWN");
    const durable = await dropped.observed;
    const before = snapshot(); await stop(service, "SIGKILL");
    assert.equal((await client(service).confirmPayment(input)).outcome, "UNKNOWN");
    service = await started();
    assert.deepEqual((await client(service).confirmPayment(input)).data, durable.data);
    assert.deepEqual((await client(service).getCommandCompletion(input.commandId)).data.result, durable.data);
    assert.deepEqual(snapshot(), before);
  });
  let financial;
  await test("bounded stable pending retrieval is not ack; invalid pages fail without mutation", async () => {
    const c = client(service, consumerToken); const before = snapshot();
    const first = (await c.readEffects({ limit: 1 })).data;
    assert.equal(first.effects.length, 1); financial = first.effects[0]; assert.equal(financial.kind, "WRITE_CONFIRMED_PROJECTION");
    assert.deepEqual((await c.readEffects({ limit: 1 })).data, first);
    assert.notEqual((await c.readEffects({ after: first.nextCursor, limit: 1 })).data.effects[0].effectId, financial.effectId);
    for (const limit of [0, 101, -1, 1.2]) assert.equal((await raw(service, envelope("ReadFinancialEffects", { after: 0, limit, includeCompleted: false }), consumerToken)).status, 400);
    assert.deepEqual(snapshot(), before);
  });
  const projection = path.join(directory, "projection.sqlite");
  await test("consumer crash before commit rolls inbox and projection back together", async () => {
    await crashConsumer(projection, financial, "beforeCommit");
    assert.deepEqual(projectionCounts(projection), [0, 0]);
    assert.equal((await client(service, consumerToken).readEffects({ limit: 1 })).data.effects[0].effectId, financial.effectId);
  });
  await test("consumer commit then crash/lost ack redelivers safely without projection duplication", async () => {
    await crashConsumer(projection, financial, "afterCommit"); assert.deepEqual(projectionCounts(projection), [1, 1]);
    const delivered = (await client(service, consumerToken).readEffects({ limit: 1 })).data.effects[0];
    assert.deepEqual(delivered, financial);
    const store = new IsolatedProjectionStore(projection);
    try {
      const ack = store.applyEffect(delivered); assert.deepEqual(projectionCounts(projection), [1, 1]);
      const dropped = await proxy(service, "drop");
      assert.equal((await client(dropped, consumerToken).acknowledgeEffect(ack)).outcome, "UNKNOWN");
      assert.equal((await dropped.observed).data.status, "COMPLETED");
      assert.equal((await client(service, consumerToken).acknowledgeEffect(ack)).data.status, "COMPLETED");
      assert.equal((await client(service, consumerToken).acknowledgeEffect(ack)).data.status, "COMPLETED");
      assert.deepEqual(projectionCounts(projection), [1, 1]);
    } finally { store.close(); }
  });
  await test("wrong digest, changed payload and unknown effect cannot complete or mutate payments", async () => {
    const before = snapshot(); const c = client(service, consumerToken);
    assert.equal((await c.acknowledgeEffect({ effectId: financial.effectId, payloadDigest: "0".repeat(64) })).data.status, "EFFECT_DIGEST_MISMATCH");
    const pending = (await c.readEffects({ limit: 1 })).data.effects[0];
    assert.equal((await c.acknowledgeEffect({ effectId: pending.effectId, payloadDigest: "0".repeat(64) })).data.status, "EFFECT_DIGEST_MISMATCH");
    assert.equal((await c.acknowledgeEffect({ effectId: "unknown", payloadDigest: financial.payloadDigest })).data.status, "UNKNOWN_EFFECT");
    assert.equal((await raw(service, envelope("AcknowledgeFinancialEffect", { effectId: financial.effectId, payloadDigest: financial.payloadDigest, payload: financial.payload }), consumerToken)).status, 400);
    const changed = structuredClone(financial); changed.payload.amount.minorUnits++;
    const store = new IsolatedProjectionStore(projection);
    try { assert.throws(() => store.applyEffect(changed), /digest/); } finally { store.close(); }
    assert.deepEqual(snapshot(), before);
  });
  await test("durable consumer drains in order; fresh projection rebuild includes COMPLETED effects without state reset", async () => {
    const c = client(service, consumerToken); const store = new IsolatedProjectionStore(projection);
    try {
      let after = 0;
      while (true) {
        const page = (await c.readEffects({ after, limit: 2, includeCompleted: true })).data;
        if (!page.effects.length) break;
        for (const effect of page.effects) assert.equal((await c.acknowledgeEffect(store.applyEffect(effect))).data.status, "COMPLETED");
        after = page.nextCursor;
      }
    } finally { store.close(); }
    assert.equal((await c.readEffects()).data.effects.length, 0);
    assert.equal((await client(service).getCommandCompletion("auto")).data.completion, "COMPLETED");
    const before = snapshot(); const rebuild = path.join(directory, "rebuild.sqlite"); const fresh = new IsolatedProjectionStore(rebuild);
    try {
      let after = 0;
      while (true) {
        const page = (await c.readEffects({ after, limit: 1, includeCompleted: true })).data;
        if (!page.effects.length) break;
        for (const effect of page.effects) { assert.equal(effect.state, "COMPLETED"); fresh.applyEffect(effect); }
        after = page.nextCursor;
      }
    } finally { fresh.close(); }
    assert.deepEqual(projectionCounts(rebuild), projectionCounts(projection)); assert.deepEqual(snapshot(), before);
    await stop(service); service = await started(); assert.deepEqual(snapshot(), before);
    assert.equal((await client(service).getCommandCompletion("auto")).data.completion, "COMPLETED");
  });
  await test("malformed PAS responses, unknown status/version and missing canonical IDs fail closed", async () => {
    let transform = value => value;
    const fake = await listen((req, res) => {
      const chunks = []; req.on("data", b => chunks.push(b)); req.on("end", () => {
        const sent = JSON.parse(Buffer.concat(chunks));
        const value = transform({ protocol: PROTOCOL, requestId: sent.requestId, operation: sent.operation,
          data: { status: "CONFIRMED", canonicalPaymentId: "synthetic-canonical", reasonCode: null } });
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(typeof value === "string" ? value : JSON.stringify(value));
      });
    });
    for (const change of [v => ({ ...v, protocol: "v99" }), v => ({ ...v, requestId: "wrong" }), v => ({ ...v, operation: "GetPayment" }),
      v => ({ ...v, data: { ...v.data, status: "MAYBE" } }), () => "{", v => ({ ...v, extra: true }),
      ...["CONFIRMED", "ALREADY_CONFIRMED"].flatMap(status => [null, "", " "].map(canonicalPaymentId => v => ({ ...v, data: { ...v.data, status, canonicalPaymentId } })))]) {
      transform = change; assert.equal((await client(fake).confirmPayment(command("invalid-response"))).outcome, "UNKNOWN");
    }
    assert.throws(() => assertData("ReadFinancialEffects", { effects: [{ ...financial, payloadDigest: "0".repeat(64) }], nextCursor: 1 }, { after: 0, limit: 1, includeCompleted: true }));
    assert.throws(() => assertData("AcknowledgeFinancialEffect", { status: "COMPLETED", effectId: "wrong", payloadDigest: financial.payloadDigest }, { effectId: financial.effectId, payloadDigest: financial.payloadDigest }));
  });
  await test("shutdown lets an accepted command commit; restart recovers it by original ID", async () => {
    const graceful = await started(filename, "existing", {}, true);
    const sql = new Database(filename); sql.exec("BEGIN IMMEDIATE");
    const input = command("shutdown-accepted");
    const accepted = once(graceful, "message");
    const sending = client(graceful).confirmPayment(input);
    try {
      assert.equal((await accepted)[0].accepted, true);
      graceful.kill("SIGTERM");
      sql.exec("COMMIT");
      const reply = await sending;
      assert.equal(reply.outcome, "KNOWN"); assert.equal(reply.data.status, "CONFIRMED");
      assert.equal((await graceful.ended).code, 0);
      assert.deepEqual((await client(service).getCommandCompletion(input.commandId)).data.result, reply.data);
    } finally { if (sql.inTransaction) sql.exec("ROLLBACK"); sql.close(); }
  });
  await test("runtime storage failure clears readiness; liveness is not financial authority health", async () => {
    const db = path.join(directory, "runtime-lock.sqlite");
    const lockedService = await started(db, "test-init"); const sql = new Database(db); sql.exec("BEGIN IMMEDIATE");
    try {
      assert.equal((await client(lockedService).confirmPayment(command("storage-unavailable"))).outcome, "UNKNOWN");
      assert.equal((await raw(lockedService, "", null, { method: "GET", path: "/readyz" })).status, 503);
      assert.equal((await raw(lockedService, "", null, { method: "GET", path: "/livez" })).status, 200);
    } finally { sql.exec("ROLLBACK"); sql.close(); }
    assert.equal(snapshot(db)[1].length, 0); await stop(lockedService);
    const recovered = await started(db);
    assert.equal((await client(recovered).confirmPayment(command("storage-unavailable"))).data.status, "CONFIRMED"); await stop(recovered);
  });
  await test("graceful shutdown bounds partial requests; restart preserves DB; credentials absent from logs", async () => {
    const before = snapshot();
    const socket = require("node:net").connect(service.port, "127.0.0.1"); await once(socket, "connect");
    socket.on("error", () => {});
    socket.write("POST /v1/operation HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\nContent-Type: application/json\r\nAuthorization: Bearer " + commandToken + "\r\n\r\n{");
    const start = Date.now(); assert.equal((await stop(service)).code, 0); assert.ok(Date.now() - start < 5000);
    socket.destroy(); assert.match(service.output, /PAS_STOPPED/);
    service = await started(); assert.deepEqual(snapshot(), before); await stop(service);
    for (const secret of [commandToken, consumerToken]) assert.ok(!logs.join("").includes(secret));
    for (const line of logs.join("").trim().split("\n")) assert.ok(line === "PAS_STARTUP_FAILED" || /^\{"event":"PAS_(READY|STOPPED)"/.test(line));
  });
  await test("transport dependency graph excludes authority/native SQLite; production wiring unchanged", async () => {
    const esbuild = require("esbuild");
    const transport = await esbuild.build({ entryPoints: [path.join(root, "pas/transport/client.js")], bundle: true, platform: "node", write: false, metafile: true, logLevel: "silent" });
    assert.ok(Object.keys(transport.metafile.inputs).every(p => !/pas\/authority|better-sqlite3/.test(p)));
    const product = await esbuild.build({ entryPoints: [path.join(root, "tools/tars-build-entry.js")], bundle: true, platform: "node", external: ["@rocket.chat/apps-engine/*"], write: false, metafile: true, logLevel: "silent" });
    // WP-021 pure contracts/seam are already build-only imports in the baseline.
    assert.ok(Object.keys(product.metafile.inputs).every(p => !/(^|\/)pas\/(authority|service|transport)\/|better-sqlite3/.test(p)));
    assert.ok(!/PAS_HTTP_V1|PAS_READY|better-sqlite3/.test(product.outputFiles[0].text));
  });
  console.log(`PASS: WP-023 ${tests} deterministic process/transport scenarios on Node ${process.versions.node}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(children.filter(child => child.exitCode === null && child.signalCode === null).map(child => stop(child, "SIGKILL")));
  await Promise.all(servers.map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
  fs.rmSync(directory, { recursive: true, force: true });
});
