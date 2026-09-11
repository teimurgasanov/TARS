"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Worker } = require("worker_threads");
const { spawnSync } = require("child_process");
const Database = require("../pas/authority/node_modules/better-sqlite3");
const { PaymentAuthority, assertDurableAuthorityResult, stableJson, digest } = require("../pas/authority");
const { IsolatedProjectionStore } = require("../pas/authority/projection-store");
const { buildConfirmPaymentCommand } = require("../pas/contracts");
const { confirmPaymentThroughAuthority } = require("../pas/caller-seam");

function command(id, identity = "payment-a", options = {}) {
  const mode = options.mode || "AUTO";
  return buildConfirmPaymentCommand({
    commandId: id, mode,
    actor: { kind: mode === "AUTO" ? "SYSTEM" : "OPERATOR", reference: "synthetic-actor" },
    observation: { messageId: "message-" + id, uploadId: "upload-" + id },
    receiptEvidence: { receiptCaseId: "case-" + identity, exactHash: "exact-" + identity, visualHash: "visual-" + identity },
    extracted: { amount: { minorUnits: 125000, currency: "RUB" }, date: "2026-09-09" },
    ...options
  });
}

function openFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pas-authority-test-"));
  const filename = path.join(directory, "authority.sqlite");
  const projectionFilename = path.join(directory, "projection.sqlite");
  const authority = new PaymentAuthority(filename);
  const sql = new Database(filename);
  sql.pragma("foreign_keys = ON");
  return { directory, filename, projectionFilename, authority, sql,
    count(table) { return sql.prepare("SELECT count(*) AS n FROM " + table).get().n; },
    close() { if (sql.open) sql.close(); authority.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  };
}

async function fixtureTest(name, test) {
  const f = openFixture();
  try { await test(f); console.log("PASS: " + name); }
  finally { f.close(); }
}

function stateCounts(f) {
  return ["PaymentSlot", "ConfirmedPayment", "IdentityAlias", "CommandEvidence", "FinancialEffect", "CommandEffect"].map(table => f.count(table));
}

async function compete(f, commands) {
  const barrier = new SharedArrayBuffer(8);
  const counters = new Int32Array(barrier);
  const workers = commands.map(input => new Worker(path.join(__dirname, "helpers/pas-authority-worker.js"), {
    workerData: { filename: f.filename, command: input, barrier }
  }));
  try {
    const results = workers.map(worker => new Promise((resolve, reject) => {
      worker.on("message", message => { if (message.result) resolve(message.result); });
      worker.on("error", reject);
      worker.on("exit", code => { if (code !== 0) reject(new Error("PAS worker failed")); });
    }));
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.on("message", message => { if (message.ready) resolve(); });
      worker.on("error", reject);
    })));
    // Both independent connections are ready before the authority write lock is held.
    // Release the barrier while holding that lock, wait for both competitors to attempt,
    // then release the lock. No timing sleeps or Promise.all of synchronous DB calls.
    f.sql.exec("BEGIN IMMEDIATE");
    Atomics.store(counters, 0, 1);
    Atomics.notify(counters, 0);
    const deadline = Date.now() + 5000;
    while (Atomics.load(counters, 1) !== workers.length) {
      const observed = Atomics.load(counters, 1);
      if (observed === workers.length) break;
      assert.ok(Date.now() < deadline, "worker barrier timed out");
      Atomics.wait(counters, 1, observed, 100);
    }
    f.sql.exec("COMMIT");
    return await Promise.all(results);
  } finally {
    if (f.sql.inTransaction) f.sql.exec("ROLLBACK");
    await Promise.all(workers.map(worker => worker.terminate()));
  }
}

(async () => {
  for (const status of ["CONFIRMED", "ALREADY_CONFIRMED"]) {
    for (const canonicalPaymentId of [null, undefined, "", " "]) {
      assert.throws(() => assertDurableAuthorityResult({ status, canonicalPaymentId, reasonCode: null }));
    }
  }
  assert.throws(() => new PaymentAuthority(":memory:"));
  console.log("PASS: successful durable results require IDs; in-memory authority forbidden");

  await fixtureTest("A/B: confirmed ID, exact replay across reopen, one payment and durable pending effects", async f => {
    const input = command("first");
    const first = await confirmPaymentThroughAuthority(f.authority, input);
    assert.strictEqual(first.result.status, "CONFIRMED");
    assert.match(first.result.canonicalPaymentId, /^[0-9a-f-]{36}$/);
    assert.deepStrictEqual(f.authority.confirmPayment(input), first.result);
    const reopened = new PaymentAuthority(f.filename);
    try {
      assert.deepStrictEqual(reopened.confirmPayment(input), first.result);
      const reordered = Object.fromEntries(Object.entries(input).reverse());
      assert.deepStrictEqual(reopened.confirmPayment(reordered), first.result);
      assert.strictEqual(reopened.getCommandCompletion(input.commandId).completion, "PENDING");
    } finally { reopened.close(); }
    assert.strictEqual(f.count("PaymentSlot"), 1);
    assert.strictEqual(f.count("ConfirmedPayment"), 1);
    assert.strictEqual(f.count("CommandLog"), 1);
    assert.strictEqual(f.count("FinancialEffect"), 2);
    assert.strictEqual(f.sql.pragma("journal_mode", { simple: true }), "wal");
    const slot = f.sql.prepare("SELECT * FROM PaymentSlot").get();
    const version = f.sql.prepare("SELECT * FROM ConfirmedPayment").get();
    assert.strictEqual(slot.canonicalPaymentId, first.result.canonicalPaymentId);
    assert.strictEqual(version.canonicalPaymentId, slot.canonicalPaymentId);
    assert.strictEqual(slot.liveConfirmationId, version.confirmationId);
    assert.match(version.confirmationId, /^[0-9a-f-]{36}$/);
    assert.notStrictEqual(version.confirmationId, slot.canonicalPaymentId);
    assert.deepStrictEqual(f.sql.pragma("foreign_key_check"), []);
  });

  await fixtureTest("C: new observation resolves same ID and shares financial effect", f => {
    const first = f.authority.confirmPayment(command("first"));
    const next = command("second", "new-photo");
    next.receiptEvidence.receiptCaseId = "case-payment-a";
    const second = f.authority.confirmPayment(next);
    assert.strictEqual(second.status, "ALREADY_CONFIRMED");
    assert.strictEqual(second.canonicalPaymentId, first.canonicalPaymentId);
    assert.strictEqual(f.count("ConfirmedPayment"), 1);
    assert.strictEqual(f.count("CommandEvidence"), 2);
    assert.strictEqual(f.count("FinancialEffect"), 3);
    assert.strictEqual(f.sql.prepare("SELECT count(*) AS n FROM FinancialEffect WHERE kind = 'WRITE_CONFIRMED_PROJECTION'").get().n, 1);
    const third = command("third", "new-photo");
    third.receiptEvidence.receiptCaseId = null;
    assert.strictEqual(f.authority.confirmPayment(third).canonicalPaymentId, first.canonicalPaymentId, "new exact alias is durable");
  });

  await fixtureTest("D: competing connections, different commands, one LIVE confirmed payment", async f => {
    const results = await compete(f, [command("race-a"), command("race-b")]);
    assert.deepStrictEqual(results.map(result => result.status).sort(), ["ALREADY_CONFIRMED", "CONFIRMED"]);
    assert.strictEqual(new Set(results.map(result => result.canonicalPaymentId)).size, 1);
    assert.strictEqual(f.count("PaymentSlot"), 1);
    assert.strictEqual(f.count("ConfirmedPayment"), 1);
    assert.strictEqual(f.count("CommandLog"), 2);
    assert.strictEqual(f.sql.prepare(`SELECT count(*) AS n FROM PaymentSlot s
      JOIN ConfirmedPayment p ON p.confirmationId = s.liveConfirmationId
        AND p.canonicalPaymentId = s.canonicalPaymentId`).get().n, 1);
  });

  await fixtureTest("D/B: competing identical command returns identical committed response", async f => {
    const results = await compete(f, [command("same-race"), command("same-race")]);
    assert.strictEqual(results[0].status, "CONFIRMED");
    assert.deepStrictEqual(results[0], results[1]);
    assert.strictEqual(f.count("ConfirmedPayment"), 1);
    assert.strictEqual(f.count("CommandLog"), 1);
    assert.strictEqual(f.count("FinancialEffect"), 2);
  });

  await fixtureTest("E: aliases bridge two owners: HOLD with no authority/effect changes", f => {
    f.authority.confirmPayment(command("one", "one"));
    f.authority.confirmPayment(command("two", "two"));
    const before = stateCounts(f);
    const bridge = command("bridge", "one");
    bridge.receiptEvidence.exactHash = "exact-two";
    bridge.receiptEvidence.visualHash = "new-unowned-visual";
    const conflict = f.authority.confirmPayment(bridge);
    assert.strictEqual(conflict.status, "CONFLICT");
    assert.strictEqual(conflict.reasonCode, "ALIAS_CONFLICT");
    assert.strictEqual(conflict.canonicalPaymentId, null);
    assert.deepStrictEqual(stateCounts(f), before);
    assert.deepStrictEqual(f.authority.confirmPayment(bridge), conflict);
    assert.strictEqual(f.authority.getCommandCompletion("bridge").completion, "NOT_APPLICABLE");
    assert.strictEqual(f.count("CommandLog"), 3, "only the conflict audit result is committed");
  });

  await fixtureTest("F: authority commit then lost transport response; reopened retry returns committed result", async f => {
    const input = command("lost-response");
    let committed;
    const outcome = await confirmPaymentThroughAuthority({ confirmPayment(cmd) {
      committed = f.authority.confirmPayment(cmd);
      throw new Error("synthetic lost response after commit");
    } }, input);
    assert.strictEqual(outcome.result.status, "AUTHORITY_UNAVAILABLE");
    assert.strictEqual(committed.status, "CONFIRMED");
    const restarted = new PaymentAuthority(f.filename);
    try { assert.deepStrictEqual(restarted.confirmPayment(input), committed); }
    finally { restarted.close(); }
    assert.strictEqual(f.count("ConfirmedPayment"), 1);
    assert.strictEqual(f.count("FinancialEffect"), 2);
  });

  await fixtureTest("F: abrupt process exit after commit is recovered from the file by a new process", f => {
    const filename = path.join(f.directory, "crashed-authority.sqlite");
    const input = command("process-exit");
    const child = spawnSync(process.execPath, [path.join(__dirname, "helpers/pas-authority-exit-after-commit.js"), filename, JSON.stringify(input)], { encoding: "utf8" });
    assert.strictEqual(child.status, 86, child.stderr);
    const restarted = new PaymentAuthority(filename);
    const recovered = new Database(filename);
    try {
      const persisted = JSON.parse(recovered.prepare("SELECT resultJson FROM CommandLog").get().resultJson);
      assert.deepStrictEqual(restarted.confirmPayment(input), persisted);
      assert.strictEqual(recovered.prepare("SELECT count(*) n FROM ConfirmedPayment").get().n, 1);
      assert.strictEqual(restarted.getCommandCompletion(input.commandId).completion, "PENDING");
    } finally { restarted.close(); recovered.close(); }
  });

  await fixtureTest("G: partial downstream failure persists pending state, resumes after reopen", async f => {
    const input = command("partial");
    const committed = f.authority.confirmPayment(input);
    const store = new IsolatedProjectionStore(f.projectionFilename);
    try {
      await assert.rejects(f.authority.completePendingEffects({ applyEffect(effect) {
        if (effect.kind === "ASSOCIATE_OBSERVATION") throw new Error("synthetic downstream outage");
        return store.applyEffect(effect);
      } }), /synthetic downstream outage/);
      assert.strictEqual(f.authority.getCommandCompletion("partial").completion, "PENDING");
      assert.deepStrictEqual(f.authority.getCommandCompletion("partial").effects.map(effect => effect.state).sort(), ["COMPLETED", "PENDING"]);
    } finally { store.close(); }
    const restarted = new PaymentAuthority(f.filename);
    const restartedStore = new IsolatedProjectionStore(f.projectionFilename);
    try {
      assert.deepStrictEqual(restarted.confirmPayment(input), committed, "authority replay does not imply effects completed");
      assert.deepStrictEqual(await restarted.completePendingEffects(restartedStore), { pending: 0 });
      assert.strictEqual(restarted.getCommandCompletion("partial").completion, "COMPLETED");
      await restarted.completePendingEffects(restartedStore);
    } finally { restarted.close(); restartedStore.close(); }
    const projection = new Database(f.projectionFilename);
    try {
      assert.strictEqual(projection.prepare("SELECT count(*) n FROM Projection").get().n, 1);
      assert.strictEqual(projection.prepare("SELECT count(*) n FROM ObservationProjection").get().n, 1);
      assert.strictEqual(projection.prepare("SELECT count(*) n FROM EffectInbox").get().n, 2);
    } finally { projection.close(); }
    assert.strictEqual(f.count("ConfirmedPayment"), 1);
  });

  await fixtureTest("G: consumer commits then loses acknowledgement; duplicate delivery is durable/idempotent", async f => {
    f.authority.confirmPayment(command("lost-ack"));
    const store = new IsolatedProjectionStore(f.projectionFilename);
    try {
      await assert.rejects(f.authority.completePendingEffects({ applyEffect(effect) {
        store.applyEffect(effect);
        throw new Error("synthetic lost effect acknowledgement");
      } }), /lost effect acknowledgement/);
      assert.ok(f.authority.getCommandCompletion("lost-ack").effects.every(effect => effect.state === "PENDING"));
    } finally { store.close(); }
    const restartedStore = new IsolatedProjectionStore(f.projectionFilename);
    try { await f.authority.completePendingEffects(restartedStore); }
    finally { restartedStore.close(); }
    const projection = new Database(f.projectionFilename);
    try {
      assert.strictEqual(projection.prepare("SELECT count(*) n FROM Projection").get().n, 1);
      assert.strictEqual(projection.prepare("SELECT count(*) n FROM EffectInbox").get().n, 2);
    } finally { projection.close(); }
    assert.strictEqual(f.authority.getCommandCompletion("lost-ack").completion, "COMPLETED");
  });

  await fixtureTest("G: concurrent effect dispatchers cannot duplicate consumer mutations", async f => {
    f.authority.confirmPayment(command("dispatch-race"));
    const second = new PaymentAuthority(f.filename);
    const store = new IsolatedProjectionStore(f.projectionFilename);
    try {
      await Promise.all([f.authority.completePendingEffects(store), second.completePendingEffects(store)]);
      const projection = new Database(f.projectionFilename);
      try {
        assert.strictEqual(projection.prepare("SELECT count(*) n FROM Projection").get().n, 1);
        assert.strictEqual(projection.prepare("SELECT count(*) n FROM EffectInbox").get().n, 2);
      } finally { projection.close(); }
    } finally { second.close(); store.close(); }
    assert.strictEqual(f.authority.getCommandCompletion("dispatch-race").completion, "COMPLETED");
  });

  await fixtureTest("H: AUTO/MANUAL share resolution, corrected values/provenance remain authoritative", f => {
    const manual = command("manual", "manual-payment", { mode: "MANUAL", manualCorrections: {
      amount: { minorUnits: 127500, currency: "RUB" }, date: "2026-09-08"
    } });
    const first = f.authority.confirmPayment(manual);
    assert.strictEqual(first.status, "CONFIRMED");
    const payment = f.sql.prepare("SELECT * FROM ConfirmedPayment").get();
    assert.strictEqual(payment.amountMinorUnits, 127500);
    assert.strictEqual(payment.paymentDate, "2026-09-08");
    const stored = JSON.parse(payment.firstCommandJson);
    assert.strictEqual(stored.payment.amount.provenance.source, "MANUAL_CORRECTION");
    assert.strictEqual(stored.payment.date.provenance.supersedesSource, "EXTRACTED");
    assert.strictEqual(f.count("PaymentSlot"), 1, "extracted and manual amounts must not create separate slots");
    const automatic = command("auto-same", "manual-payment", { extracted: {
      amount: { minorUnits: 127500, currency: "RUB" }, date: "2026-09-08"
    } });
    assert.deepStrictEqual(f.authority.confirmPayment(automatic), { ...first, status: "ALREADY_CONFIRMED" });
    const contradicted = f.authority.confirmPayment(command("old-ocr", "manual-payment"));
    assert.strictEqual(contradicted.reasonCode, "CONFIRMED_VALUES_CONFLICT");
    assert.strictEqual(f.count("ConfirmedPayment"), 1);
  });

  await fixtureTest("B: command ID reuse with changed values, evidence, mode or actor fails closed", f => {
    const input = command("immutable-command");
    const original = f.authority.confirmPayment(input);
    const before = stateCounts(f);
    const variants = [
      { ...input, actor: { ...input.actor, reference: "another-synthetic-actor" } },
      { ...input, receiptEvidence: { ...input.receiptEvidence, exactHash: "another-exact" } },
      command("immutable-command", "payment-a", { mode: "MANUAL" }),
      command("immutable-command", "payment-a", { extracted: { amount: { minorUnits: 1, currency: "RUB" }, date: "2026-09-09" } })
    ];
    for (const variant of variants) assert.strictEqual(f.authority.confirmPayment(variant).reasonCode, "COMMAND_ID_REUSED");
    assert.deepStrictEqual(stateCounts(f), before);
    assert.deepStrictEqual(f.authority.confirmPayment(input), original);
  });

  await fixtureTest("storage failure late in authority transaction rolls back every record", f => {
    f.sql.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON FinancialEffect BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END");
    const input = command("rollback");
    assert.strictEqual(f.authority.confirmPayment(input).status, "AUTHORITY_UNAVAILABLE");
    assert.deepStrictEqual(stateCounts(f), [0, 0, 0, 0, 0, 0]);
    assert.strictEqual(f.count("CommandLog"), 0);
    f.sql.exec("DROP TRIGGER injected_failure");
    assert.strictEqual(f.authority.confirmPayment(input).status, "CONFIRMED");
  });

  await fixtureTest("consumer failure before inbox commit rolls back mutation and resumes safely", async f => {
    f.authority.confirmPayment(command("consumer-rollback"));
    const store = new IsolatedProjectionStore(f.projectionFilename);
    const projection = new Database(f.projectionFilename);
    try {
      projection.exec("CREATE TRIGGER injected_failure BEFORE INSERT ON EffectInbox BEGIN SELECT RAISE(ABORT, 'synthetic inbox failure'); END");
      await assert.rejects(f.authority.completePendingEffects(store), /synthetic inbox failure/);
      assert.strictEqual(projection.prepare("SELECT count(*) n FROM Projection").get().n, 0);
      assert.strictEqual(projection.prepare("SELECT count(*) n FROM EffectInbox").get().n, 0);
      projection.exec("DROP TRIGGER injected_failure");
      await f.authority.completePendingEffects(store);
      assert.strictEqual(f.authority.getCommandCompletion("consumer-rollback").completion, "COMPLETED");
    } finally { projection.close(); store.close(); }
  });

  await fixtureTest("unavailable database and lock contention fail closed", f => {
    const contender = new PaymentAuthority(f.filename, { timeout: 0 });
    f.sql.exec("BEGIN IMMEDIATE");
    try { assert.strictEqual(contender.confirmPayment(command("busy")).status, "AUTHORITY_UNAVAILABLE"); }
    finally { f.sql.exec("ROLLBACK"); }
    assert.strictEqual(f.count("ConfirmedPayment"), 0);
    assert.strictEqual(contender.confirmPayment(command("busy")).status, "CONFIRMED");
    contender.close();
    assert.strictEqual(contender.confirmPayment(command("closed")).status, "AUTHORITY_UNAVAILABLE");
  });

  await fixtureTest("SQL constraints enforce immutable confirmations, slot uniqueness and non-null success ID", f => {
    f.authority.confirmPayment(command("immutable"));
    const payment = f.sql.prepare("SELECT * FROM ConfirmedPayment").get();
    assert.throws(() => f.sql.prepare(`INSERT INTO PaymentSlot
      (canonicalPaymentId, liveConfirmationId) VALUES (?, ?)`)
      .run(payment.canonicalPaymentId, payment.confirmationId), /immutable slot/);
    assert.throws(() => f.sql.prepare(`INSERT INTO ConfirmedPayment
      (confirmationId, canonicalPaymentId, amountMinorUnits, currency, paymentDate, firstCommandJson)
      VALUES (?, ?, 1, 'RUB', '2026-09-09', '{}')`)
      .run(payment.confirmationId, payment.canonicalPaymentId), /immutable confirmation/);
    for (const table of ["PaymentSlot", "ConfirmedPayment", "IdentityAlias", "CommandLog", "CommandEvidence", "CommandEffect"]) {
      assert.throws(() => f.sql.exec("DELETE FROM " + table), /immutable/);
    }
    assert.throws(() => f.sql.exec("UPDATE ConfirmedPayment SET amountMinorUnits = 1"), /immutable/);
    assert.throws(() => f.sql.exec("UPDATE IdentityAlias SET canonicalPaymentId = 'different'"), /immutable/);
    for (const status of ["CONFIRMED", "ALREADY_CONFIRMED"]) {
      assert.throws(() => f.sql.prepare("INSERT INTO CommandLog VALUES (?, '{}', ?, NULL, ?)")
        .run("invalid-" + status, status, JSON.stringify({ status, canonicalPaymentId: null, reasonCode: null })), /CHECK/);
    }
    assert.deepStrictEqual(f.sql.pragma("foreign_key_check"), []);
    assert.strictEqual(f.sql.pragma("integrity_check", { simple: true }), "ok");
  });

  await fixtureTest("stable identity: schema supports historical A and live B without changing aliases or history", f => {
    const input = command("version-a");
    const first = f.authority.confirmPayment(input);
    const versionA = f.sql.prepare("SELECT * FROM ConfirmedPayment").get();
    const aliases = f.sql.prepare("SELECT * FROM IdentityAlias ORDER BY kind, aliasValue").all();
    const before = stateCounts(f);
    // Schema capability only: no production replace/void command or effect delivery.
    f.sql.transaction(() => {
      f.sql.prepare(`INSERT INTO ConfirmedPayment
        (confirmationId, canonicalPaymentId, amountMinorUnits, currency, paymentDate, firstCommandJson)
        VALUES ('synthetic-version-b', ?, 130000, 'RUB', '2026-09-10', '{}')`).run(first.canonicalPaymentId);
      assert.strictEqual(f.sql.prepare("SELECT liveConfirmationId FROM PaymentSlot").get().liveConfirmationId, versionA.confirmationId);
      f.sql.prepare("UPDATE PaymentSlot SET liveConfirmationId = 'synthetic-version-b' WHERE canonicalPaymentId = ?")
        .run(first.canonicalPaymentId);
    }).immediate();

    const reopened = new PaymentAuthority(f.filename);
    try {
      assert.deepStrictEqual(f.sql.prepare("SELECT * FROM PaymentSlot").get(), {
        canonicalPaymentId: first.canonicalPaymentId, liveConfirmationId: "synthetic-version-b"
      });
      assert.deepStrictEqual(f.sql.prepare("SELECT * FROM ConfirmedPayment WHERE confirmationId = ?").get(versionA.confirmationId), versionA);
      assert.deepStrictEqual(f.sql.prepare("SELECT * FROM IdentityAlias ORDER BY kind, aliasValue").all(), aliases);
      assert.deepStrictEqual(stateCounts(f), before.map((count, index) => count + (index === 1 ? 1 : 0)));
      assert.strictEqual(f.sql.prepare("SELECT count(*) n FROM ConfirmedPayment WHERE canonicalPaymentId = ?").get(first.canonicalPaymentId).n, 2);
      assert.deepStrictEqual(reopened.confirmPayment(input), first, "old command still replays its exact stored result");
      assert.strictEqual(reopened.confirmPayment(command("stale-values")).reasonCode, "CONFIRMED_VALUES_CONFLICT",
        "new commands must compare the live version, not an arbitrary historical row");
      assert.deepStrictEqual(reopened.confirmPayment(command("live-values", "payment-a", { extracted: {
        amount: { minorUnits: 130000, currency: "RUB" }, date: "2026-09-10"
      } })), { ...first, status: "ALREADY_CONFIRMED" });
      assert.strictEqual(f.count("ConfirmedPayment"), 2, "retries never append confirmation versions");
    } finally { reopened.close(); }
    assert.deepStrictEqual(f.sql.pragma("foreign_key_check"), []);
    assert.strictEqual(f.sql.pragma("integrity_check", { simple: true }), "ok");
  });

  await fixtureTest("live pointer: cross-identity and missing targets fail at commit and roll back", f => {
    const x = f.authority.confirmPayment(command("pointer-x", "x"));
    const y = f.authority.confirmPayment(command("pointer-y", "y"));
    const slots = f.sql.prepare("SELECT * FROM PaymentSlot ORDER BY canonicalPaymentId").all();
    const yVersion = slots.find(slot => slot.canonicalPaymentId === y.canonicalPaymentId).liveConfirmationId;
    for (const invalidTarget of [yVersion, "missing-version"]) {
      assert.throws(() => f.sql.transaction(() => {
        f.sql.prepare("UPDATE PaymentSlot SET liveConfirmationId = ? WHERE canonicalPaymentId = ?")
          .run(invalidTarget, x.canonicalPaymentId);
        assert.strictEqual(f.sql.prepare("SELECT liveConfirmationId FROM PaymentSlot WHERE canonicalPaymentId = ?")
          .get(x.canonicalPaymentId).liveConfirmationId, invalidTarget, "FK is deferred only until commit");
      }).immediate(), /FOREIGN KEY/);
      assert.strictEqual(f.sql.inTransaction, false);
      assert.deepStrictEqual(f.sql.prepare("SELECT * FROM PaymentSlot ORDER BY canonicalPaymentId").all(), slots);
    }
    assert.throws(() => f.sql.transaction(() => {
      f.sql.prepare("INSERT INTO PaymentSlot VALUES ('dangling-slot', 'missing-version')").run();
    }).immediate(), /FOREIGN KEY/);
    assert.strictEqual(f.count("PaymentSlot"), 2);
    assert.throws(() => f.sql.prepare(`INSERT INTO ConfirmedPayment VALUES
      ('orphan-version', 'missing-slot', 1, 'RUB', '2026-09-09', '{}')`).run(), /FOREIGN KEY/);
    assert.deepStrictEqual(f.sql.pragma("foreign_key_check"), []);
  });

  await fixtureTest("historical versions and canonical identity resist update, delete, upsert and REPLACE", f => {
    const first = f.authority.confirmPayment(command("history"));
    const version = f.sql.prepare("SELECT * FROM ConfirmedPayment").get();
    const slot = f.sql.prepare("SELECT * FROM PaymentSlot").get();
    f.sql.prepare(`INSERT INTO ConfirmedPayment VALUES
      ('history-b', ?, 130000, 'RUB', '2026-09-10', '{}')`).run(first.canonicalPaymentId);
    f.sql.exec("UPDATE PaymentSlot SET liveConfirmationId = 'history-b'");
    for (const [column, value] of Object.entries({
      confirmationId: "renamed", canonicalPaymentId: "another-slot", amountMinorUnits: 1,
      currency: "USD", paymentDate: "2026-09-11", firstCommandJson: "{}"
    })) {
      assert.throws(() => f.sql.prepare(`UPDATE ConfirmedPayment SET ${column} = ? WHERE confirmationId = ?`)
        .run(value, version.confirmationId), /immutable confirmation/);
    }
    assert.throws(() => f.sql.prepare("DELETE FROM ConfirmedPayment WHERE confirmationId = ?")
      .run(version.confirmationId), /immutable confirmation/);
    assert.throws(() => f.sql.exec("UPDATE PaymentSlot SET canonicalPaymentId = 'renamed'"), /immutable slot/);
    // SQLite REPLACE can skip delete triggers; test both connection configurations.
    for (const recursive of [0, 1]) {
      f.sql.pragma("recursive_triggers = " + recursive);
      assert.throws(() => f.sql.prepare(`INSERT OR REPLACE INTO ConfirmedPayment VALUES
        (?, ?, 1, 'RUB', '2026-09-09', '{}')`).run(version.confirmationId, first.canonicalPaymentId), /immutable confirmation/);
      assert.throws(() => f.sql.prepare("INSERT OR REPLACE INTO PaymentSlot VALUES (?, ?)")
        .run(first.canonicalPaymentId, version.confirmationId), /immutable slot/);
      assert.throws(() => f.sql.prepare(`INSERT INTO ConfirmedPayment VALUES
        (?, ?, 1, 'RUB', '2026-09-09', '{}') ON CONFLICT(confirmationId) DO UPDATE SET amountMinorUnits = 1`)
        .run(version.confirmationId, first.canonicalPaymentId), /immutable confirmation/);
    }
    for (const table of ["PaymentSlot", "ConfirmedPayment"]) {
      assert.throws(() => f.sql.prepare("SELECT rowid FROM " + table), /no such column/,
        "no hidden rowid conflict may bypass the primary-key REPLACE guard");
    }
    assert.deepStrictEqual(f.sql.prepare("SELECT * FROM ConfirmedPayment WHERE confirmationId = ?").get(version.confirmationId), version);
    assert.deepStrictEqual(f.sql.prepare("SELECT * FROM PaymentSlot").get(), { ...slot, liveConfirmationId: "history-b" });
    assert.strictEqual(f.count("ConfirmedPayment"), 2);
    assert.deepStrictEqual(f.sql.pragma("foreign_key_check"), []);
  });

  await fixtureTest("stable identity: aliases, command log, evidence and effects reference PaymentSlot", f => {
    const first = f.authority.confirmPayment(command("stable-refs"));
    for (const table of ["IdentityAlias", "CommandLog", "CommandEvidence", "FinancialEffect", "ConfirmedPayment"]) {
      const reference = f.sql.pragma("foreign_key_list(" + table + ")").find(fk => fk.from === "canonicalPaymentId");
      assert.strictEqual(reference.table, "PaymentSlot", table);
      assert.strictEqual(reference.to, "canonicalPaymentId", table);
      assert.ok(f.sql.prepare("SELECT canonicalPaymentId FROM " + table).all()
        .every(row => row.canonicalPaymentId === first.canonicalPaymentId));
    }
  });

  await fixtureTest("schema can retain identity/history without a live version; confirm fails closed", f => {
    const first = f.authority.confirmPayment(command("no-live"));
    const before = stateCounts(f);
    f.sql.exec("UPDATE PaymentSlot SET liveConfirmationId = NULL");
    assert.strictEqual(f.authority.confirmPayment(command("no-live-retry")).status, "AUTHORITY_UNAVAILABLE");
    assert.deepStrictEqual(stateCounts(f), before);
    assert.strictEqual(f.count("CommandLog"), 1);
    assert.strictEqual(f.sql.prepare("SELECT canonicalPaymentId FROM PaymentSlot").get().canonicalPaymentId, first.canonicalPaymentId);
    assert.deepStrictEqual(f.sql.pragma("foreign_key_check"), []);
  });

  await fixtureTest("weak-only and missing identity evidence hold; equal amount/date do not merge payments", f => {
    const first = f.authority.confirmPayment(command("anchor", "one"));
    const weak = command("weak", "two");
    weak.receiptEvidence.visualHash = "visual-one";
    assert.strictEqual(f.authority.confirmPayment(weak).reasonCode, "WEAK_ALIAS_ONLY");
    const missing = command("no-evidence");
    missing.receiptEvidence = { receiptCaseId: null, exactHash: null, visualHash: null };
    assert.strictEqual(f.authority.confirmPayment(missing).reasonCode, "INSUFFICIENT_IDENTITY_EVIDENCE");
    const separate = f.authority.confirmPayment(command("different-real-payment", "different"));
    assert.strictEqual(separate.status, "CONFIRMED");
    assert.notStrictEqual(separate.canonicalPaymentId, first.canonicalPaymentId);
    assert.strictEqual(f.count("ConfirmedPayment"), 2);
  });

  await fixtureTest("invalid command/provenance creates no authority state", f => {
    assert.strictEqual(f.authority.confirmPayment({}).status, "REJECTED");
    const forgedAuto = command("forged");
    forgedAuto.payment.amount.provenance.source = "MANUAL_CORRECTION";
    assert.strictEqual(f.authority.confirmPayment(forgedAuto).status, "REJECTED");
    assert.deepStrictEqual(stateCounts(f), [0, 0, 0, 0, 0, 0]);
  });

  await fixtureTest("effect acknowledgement mismatch and null ID cannot claim completion", async f => {
    f.authority.confirmPayment(command("ack-mismatch"));
    await assert.rejects(f.authority.completePendingEffects({ applyEffect() { return {}; } }), /acknowledgement mismatch/);
    assert.ok(f.authority.getCommandCompletion("ack-mismatch").effects.every(effect => effect.state === "PENDING"));
    const store = new IsolatedProjectionStore(f.projectionFilename);
    try {
      const payload = { canonicalPaymentId: null };
      assert.throws(() => store.applyEffect({ effectId: "invalid", kind: "WRITE_CONFIRMED_PROJECTION", payload, payloadDigest: digest(stableJson(payload)) }));
      await f.authority.completePendingEffects(store);
      const effect = f.sql.prepare("SELECT * FROM FinancialEffect ORDER BY rowid LIMIT 1").get();
      const changed = JSON.parse(effect.payloadJson);
      changed.amount.minorUnits += 1;
      assert.throws(() => store.applyEffect({ effectId: effect.effectId, kind: effect.kind, payload: changed, payloadDigest: digest(stableJson(changed)) }), /reused/);
      assert.throws(() => f.sql.exec("UPDATE FinancialEffect SET state = 'PENDING'"), /monotonic/);
    } finally { store.close(); }
  });

  await fixtureTest("foreign DB and unsupported schema refused without migration", f => {
    const foreign = path.join(f.directory, "foreign.sqlite");
    const db = new Database(foreign);
    db.exec("CREATE TABLE Unrelated (value TEXT)");
    db.close();
    assert.throws(() => new PaymentAuthority(foreign), /foreign database/);
    assert.strictEqual(f.sql.pragma("user_version", { simple: true }), 2);
    const schemaBefore = f.sql.prepare("SELECT sql FROM sqlite_master ORDER BY name").all();
    for (const unsupportedVersion of [1, 3]) {
      f.sql.pragma("user_version = " + unsupportedVersion);
      assert.throws(() => new PaymentAuthority(f.filename), /migrations are not supported/);
      assert.strictEqual(f.sql.pragma("user_version", { simple: true }), unsupportedVersion);
      assert.deepStrictEqual(f.sql.prepare("SELECT sql FROM sqlite_master ORDER BY name").all(), schemaBefore);
    }
    f.sql.pragma("user_version = 2");
  });

  console.log("PASS: isolated durable SQLite PAS authority MVP; A-H and failure/constraint guards");
})().catch(error => { console.error(error); process.exitCode = 1; });
