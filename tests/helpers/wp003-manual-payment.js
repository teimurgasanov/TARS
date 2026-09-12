"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PaymentAuthority } = require("../../pas/authority");
const Database = require("../../pas/authority/node_modules/better-sqlite3");
const { buildConfirmPaymentCommand } = require("../../pas/contracts");
const { assertPayload } = require("../../pas/transport/protocol");
const { RocketChatPaymentAuthority } = require("../../pas/transport/rocketchat-client");
const { receiptIdentityEvidence, paymentIdentityAliasValue } = require("../../pas/receipt-identity");
const { loadTrackedAppWithGuard } = require("./canonical-tars-runtime");
const { createRuntime, prepareControl } = require("../receipt-private-control-handler.runtime");
const { manualCommandId } = require("../../pas/manual-confirmation");
const clone = value => JSON.parse(JSON.stringify(value));

function identity(rawValue = "id:DOC1234567890|2026-09-06|600") {
  return { kind: rawValue.split(":")[0], functionVersion: "TARS_RECEIPT_IDENTITY_V1", rawValue };
}

module.exports = async function testManualPaymentUniqueness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wp003-test-"));
  const filename = path.join(directory, "authority.sqlite");
  const authority = new PaymentAuthority(filename);
  const sql = new Database(filename);
  const command = n => buildConfirmPaymentCommand({
    commandId: "wp003-command-" + n, mode: "MANUAL",
    actor: { kind: "OPERATOR", reference: "synthetic-operator" },
    observation: { messageId: "message-" + n, uploadId: "upload-" + n },
    receiptEvidence: { receiptCaseId: "case-" + n, exactHash: String(n).repeat(64), paymentIdentity: identity() },
    extracted: { amount: { minorUnits: 60000, currency: "RUB" }, date: "2026-09-06" }
  });
  try {
    const first = authority.confirmPayment(command(1));
    const second = authority.confirmPayment(command(2));
    assert.strictEqual(first.status, "CONFIRMED");
    assert.strictEqual(second.status, "ALREADY_CONFIRMED", "same stable identity / different observation must not mint another payment");
    assert.strictEqual(second.canonicalPaymentId, first.canonicalPaymentId);
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM ConfirmedPayment").get().n, 1);
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM FinancialEffect WHERE kind='WRITE_CONFIRMED_PROJECTION'").get().n, 1);
    assert.deepStrictEqual(authority.confirmPayment(command(1)), first, "same command replay is deterministic");
    const different = command(3);
    different.receiptEvidence.paymentIdentity = identity("id:DOC9876543210|2026-09-06|600");
    assert.strictEqual(authority.confirmPayment(different).status, "CONFIRMED", "same amount/date is not identity");
    const collision = command(4);
    collision.receiptEvidence.exactHash = different.receiptEvidence.exactHash;
    assert.strictEqual(authority.confirmPayment(collision).reasonCode, "ALIAS_CONFLICT");
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM ConfirmedPayment").get().n, 2);
    const changedValue = command(5);
    changedValue.payment.amount.value.minorUnits += 100;
    assert.strictEqual(authority.confirmPayment(changedValue).reasonCode, "CONFIRMED_VALUES_CONFLICT");
    const absent = command(6);
    delete absent.receiptEvidence.paymentIdentity;
    assert.strictEqual(authority.confirmPayment(absent).reasonCode, "STABLE_PAYMENT_IDENTITY_REQUIRED");
    for (const rawValue of ["", "id:", "id:message-123", "txn:2026-09-06|99:00|600", "text:2026-09-06|600|unsafe", "amount:600", null]) {
      const invalid = command(7);
      invalid.receiptEvidence.paymentIdentity = { ...identity(), rawValue };
      assert.strictEqual(authority.confirmPayment(invalid).status, "REJECTED");
      assert.throws(() => assertPayload("ConfirmPayment", invalid));
    }
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM ConfirmedPayment").get().n, 2);
    const alias = sql.prepare("SELECT * FROM IdentityAlias WHERE kind='tarsReceiptIdentityV1' LIMIT 1").get();
    assert.throws(() => sql.prepare("INSERT OR REPLACE INTO IdentityAlias VALUES (?, ?, ?)")
      .run(alias.kind, alias.aliasValue, first.canonicalPaymentId), /immutable alias/);
    const evidence = JSON.parse(sql.prepare("SELECT evidenceJson FROM CommandEvidence WHERE commandId=?").get(command(1).commandId).evidenceJson);
    assert.deepStrictEqual(evidence.receiptEvidence.paymentIdentity, identity(), "raw evidence and function version are immutable command evidence");
    const reopened = new PaymentAuthority(filename);
    try { assert.deepStrictEqual(reopened.confirmPayment(command(1)), first); }
    finally { reopened.close(); }
    console.log("PASS: WP-003 stable payment identity survives different observations");
  } finally { sql.close(); authority.close(); fs.rmSync(directory, { recursive: true, force: true }); }
  testIdentityParity();
  for (const entrypoint of ["M1", "M2", "M3"]) await testEntrypoint(entrypoint);
  await testTransportFailures();
};

module.exports.identity = identity;

function testIdentityParity() {
  const source = fs.readFileSync(path.join(__dirname, "../../TarsReportApp.js"), "utf8");
  const extract = new Function(source.slice(source.indexOf("function textFingerprint"), source.indexOf("function receiptStatusRejection")) + "; return extractReceiptIdentity;")();
  const normalize = new Function(source.slice(source.indexOf("function normalizedReceiptIdentityKey"), source.indexOf("function findReceiptIdentityDuplicate")) + "; return normalizedReceiptIdentityKey;")();
  for (const text of ["Номер документа 1234567890", "ID операции AB12345678", "Чек № 9876543210", "06.09.2026 9:05:02 Перевод 600", "06.09.2026 9:05 Перевод 600", "Перевод выполнен 600 рублей"]) {
    const raw = extract(text, "2026-09-06", 600);
    const evidence = receiptIdentityEvidence(raw);
    assert.strictEqual(JSON.parse(paymentIdentityAliasValue(evidence))[2], normalize(raw));
    assert.strictEqual(evidence.rawValue, raw);
  }
  assert.strictEqual(paymentIdentityAliasValue(identity("txn:2026-09-06|9:5|600")), paymentIdentityAliasValue(identity("txn:2026-09-06|09:05|600")));
  assert.notStrictEqual(paymentIdentityAliasValue(identity("txn:2026-09-06|09:05|600")), paymentIdentityAliasValue(identity("txn:2026-09-06|09:05:00|600")), "baseline distinguishes absent seconds");
  assert.throws(() => receiptIdentityEvidence("id:upload-123"));
  assert.notStrictEqual(manualCommandId({ exact: "same", messageId: "one", uploadId: "one" }),
    manualCommandId({ exact: "same", messageId: "two", uploadId: "two" }), "retry keys must preserve separate observations even with equal bytes");
  console.log("PASS: WP-003 identity representation matches baseline derivation/normalization");
}

async function testEntrypoint(entrypoint) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wp003-entry-"));
  const filename = path.join(directory, "authority.sqlite");
  const authority = new PaymentAuthority(filename);
  const sql = new Database(filename);
  const loaded = loadTrackedAppWithGuard();
  let runtime = createRuntime(loaded);
  const commands = [];
  const faults = {};
  const setup = () => {
    delete runtime.app.manualPaymentAuthority; // Exercise the real settings and HTTP adapter.
    runtime.read.getEnvironmentReader = () => ({ getSettings: () => ({
      getValueById: async key => key === "pas_manual_authority_url" ? "http://127.0.0.1:12345" : "synthetic_" + "x".repeat(32)
    }) });
    runtime.guard.scheduleTarsMemoryHumanReceiptConfirmationV1 = () => { runtime.counters.memory++; };
    runtime.guard.publishMasterTransferSummary = async () => { runtime.counters.summary++; };
  };
  setup();
  runtime.entry.exact = runtime.guard.exactHash(Buffer.from("synthetic first receipt observation"));
  runtime.records.get("receipt-duplicate-index-v1").photos[0].exact = runtime.entry.exact;
  const http = { async post(url, options) {
    assert.strictEqual(url, "http://127.0.0.1:12345/v1/operation");
    const envelope = JSON.parse(options.content);
    assertPayload("ConfirmPayment", envelope.payload);
    assert(Array.from(runtime.records.values()).some(record => record.command && JSON.stringify(record.command) === JSON.stringify(envelope.payload)), "full intention must be persisted before send");
    commands.push(clone(envelope.payload));
    if (faults.outage) throw new Error("synthetic transport failure");
    const data = faults.status ? { status: faults.status, canonicalPaymentId: null, reasonCode: "SYNTHETIC" } : authority.confirmPayment(envelope.payload);
    if (faults.lostResponse) { faults.lostResponse = false; throw new Error("synthetic response loss after commit"); }
    return { statusCode: 200, content: JSON.stringify({ ...envelope, payload: undefined, data }) };
  } };
  const getIndex = () => runtime.records.get("receipt-duplicate-index-v1");
  const add = (n, raw = identity().rawValue) => {
    const entry = { ...clone(runtime.entry), exact: runtime.guard.exactHash(Buffer.from("synthetic receipt observation " + n)), messageId: "wp003-message-" + n,
      uploadId: "wp003-upload-" + n, receiptIdentity: raw, uploadedAt: Date.now() + n };
    getIndex().photos.push(entry);
    return entry;
  };
  const invoke = async entry => {
    if (entrypoint === "M3") {
      const command = new loaded.__testApproveReceiptCommand(runtime.app);
      await command.executor({ getRoom: () => runtime.room, getSender: () => runtime.teimur,
        getArguments: () => ["@master", "600", "06.09.2026"] }, runtime.read, runtime.modify, http, runtime.persistence);
    } else {
      const action = { user: runtime.teimur,
        room: entrypoint === "M1" ? runtime.room : { id: "synthetic-control", slugifiedName: "cheki-kontrol", type: "c" },
        value: entrypoint === "M1" ? runtime.guard.receiptPrivateControlEntryTokenV1(entry) : entry.exact };
      action.actionId = "approve-rejected-receipt";
      const context = { getInteractionData: () => action, getInteractionResponder: () => ({ successResponse() { return true; } }) };
      const dispatch = entrypoint === "M1" ? "executeBlockActionHandler" : "executeActionButtonHandler";
      await runtime.app[dispatch](context, runtime.read, http, runtime.persistence, runtime.modify);
    }
  };
  const assertCount = expected => {
    const accepted = getIndex().photos.filter(entry => entry.source === "confirmed");
    assert.strictEqual(accepted.length, expected, entrypoint + " local financial count");
    assert.strictEqual(accepted.reduce((sum, entry) => sum + entry.receiptAmount, 0), expected * 600);
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM ConfirmedPayment").get().n, expected);
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM FinancialEffect WHERE kind='WRITE_CONFIRMED_PROJECTION'").get().n, expected);
  };
  try {
    const firstCase = await prepareControl(runtime);
    await invoke(runtime.entry);
    assertCount(1);
    assert.strictEqual(commands[0].mode, "MANUAL");
    assert.strictEqual(commands[0].actor.kind, "OPERATOR");
    assert.strictEqual(commands[0].receiptEvidence.receiptCaseId, firstCase.caseId);
    assert.strictEqual(commands[0].payment.amount.provenance.source, entrypoint === "M3" ? "MANUAL_CORRECTION" : "EXTRACTED");
    assert.strictEqual(commands[0].payment.date.provenance.source, entrypoint === "M3" ? "MANUAL_CORRECTION" : "EXTRACTED");
    const second = add(2);
    assert.notStrictEqual(second.exact, runtime.entry.exact, "different bytes must have different exact hashes");
    const secondCase = await runtime.guard.findOrCreateReceiptCaseV1({ sourceMessageId: second.messageId, sourceUploadId: second.uploadId, masterId: second.userId }, runtime.read, runtime.persistence);
    assert.notStrictEqual(secondCase.caseId, firstCase.caseId);
    await invoke(second);
    assertCount(1);
    assert.strictEqual(commands[1].receiptEvidence.receiptCaseId, secondCase.caseId);
    assert.strictEqual(getIndex().photos.find(entry => entry.exact === second.exact).source, "duplicate");
    assert.deepStrictEqual([runtime.counters.memory, runtime.counters.summary, runtime.counters.report], [1, 1, 1], "duplicate must not repeat financial/report effects");
    await invoke(second);
    assertCount(1);
    const q = add(3, "id:DOC9876543210|2026-09-06|600");
    await Promise.all([invoke(q), invoke(q)]);
    assertCount(2);
    assert.deepStrictEqual([runtime.counters.memory, runtime.counters.summary, runtime.counters.report], [2, 2, 2]);

    const pending = add(4, "id:DOC1111111111|2026-09-06|600");
    for (const status of ["CONFLICT", "REJECTED", "AUTHORITY_UNAVAILABLE"]) {
      faults.status = status;
      await invoke(pending);
      assertCount(2);
      assert.strictEqual(getIndex().photos.find(entry => entry.exact === pending.exact).source, "rejected");
    }
    delete faults.status;
    faults.outage = true;
    await invoke(pending);
    assertCount(2);
    delete faults.outage;
    const retryCommand = clone(commands[commands.length - 1]);
    faults.lostResponse = true;
    await invoke(pending);
    assert.strictEqual(getIndex().photos.filter(entry => entry.source === "confirmed").length, 2, "uncertain response must not cause local confirmation");
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM ConfirmedPayment").get().n, 3);
    runtime = createRuntime(loadTrackedAppWithGuard(), runtime.records, runtime.messages);
    setup();
    await invoke(pending);
    assertCount(3);
    assert.deepStrictEqual(commands[commands.length - 1], retryCommand, "restart must resend original commandId, evidence, actor, provenance");
    for (const raw of [undefined, "", "id:", "id:upload-123", "txn:2026-09-06|99:00|600"]) {
      const unsafe = add(5, raw);
      unsafe.receiptIdentity = raw;
      const before = commands.length;
      await invoke(unsafe);
      assertCount(3);
      assert.strictEqual(commands.length, before, "unsafe identity must not reach authority or fallback");
      getIndex().photos = getIndex().photos.filter(entry => entry !== unsafe);
    }
    const recovery = add(6, "id:DOC2222222222|2026-09-06|600");
    const write = runtime.persistence.updateByAssociation.bind(runtime.persistence);
    runtime.persistence.updateByAssociation = async (association, ...args) => {
      if (String(association.key).startsWith("pas-manual-command-v1:")) throw new Error("synthetic intention write failure");
      return write(association, ...args);
    };
    const beforeIntentFailure = commands.length;
    await invoke(recovery);
    assertCount(3);
    assert.strictEqual(commands.length, beforeIntentFailure, "failed intention persistence must prevent send");
    runtime.persistence.updateByAssociation = async (association, ...args) => {
      if (association.key === "receipt-duplicate-index-v1") throw new Error("synthetic projection write failure");
      return write(association, ...args);
    };
    await invoke(recovery);
    assert.strictEqual(sql.prepare("SELECT count(*) n FROM ConfirmedPayment").get().n, 4);
    assert.strictEqual(getIndex().photos.filter(entry => entry.source === "confirmed").length, 3);
    assert.match(runtime.notifications[runtime.notifications.length - 1].message.text, /запись результата не завершена/);
    runtime.persistence.updateByAssociation = write;
    await invoke(recovery);
    assertCount(4);
    const afterCommit = add(7, "id:DOC3333333333|2026-09-06|600");
    runtime.persistence.updateByAssociation = async (association, ...args) => {
      const result = await write(association, ...args);
      if (association.key === "receipt-duplicate-index-v1") throw new Error("synthetic acknowledgement loss after projection commit");
      return result;
    };
    await invoke(afterCommit);
    assertCount(5);
    assert.match(runtime.notifications[runtime.notifications.length - 1].message.text, /запись результата не завершена/);
    runtime.persistence.updateByAssociation = write;
    await invoke(afterCommit);
    assertCount(5);
    const unconfigured = add(8, "id:DOC4444444444|2026-09-06|600");
    delete runtime.read.getEnvironmentReader;
    const beforeUnconfigured = commands.length;
    await invoke(unconfigured);
    assertCount(5);
    assert.strictEqual(commands.length, beforeUnconfigured, "unconfigured TARS must not use a local confirmation fallback");
    console.log("PASS: WP-003 " + entrypoint + " P=one credit; duplicate/no effects; Q; concurrency; unavailable; lost response/restart; unsafe identity; intention/projection storage faults");
  } finally { sql.close(); authority.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function testTransportFailures() {
  const input = buildConfirmPaymentCommand({ commandId: "transport-test", mode: "MANUAL", actor: { kind: "OPERATOR", reference: "synthetic" },
    observation: { messageId: "synthetic" }, receiptEvidence: { paymentIdentity: identity() },
    extracted: { amount: { minorUnits: 60000, currency: "RUB" }, date: "2026-09-06" } });
  const config = { baseUrl: "http://127.0.0.1:12345", token: "synthetic_" + "x".repeat(32), timeoutMs: 5 };
  for (const http of [{ post: async () => new Promise(() => {}) }, { post: async () => { throw new Error("timeout"); } },
    { post: async () => ({ statusCode: 200, content: "{}" }) }, { post: async () => ({ statusCode: 302, content: "{}" }) }]) {
    assert.strictEqual((await new RocketChatPaymentAuthority(http, config).confirmPayment(input)).status, "AUTHORITY_UNAVAILABLE");
  }
  assert.strictEqual((await new RocketChatPaymentAuthority().confirmPayment(input)).status, "AUTHORITY_UNAVAILABLE");
  console.log("PASS: WP-003 HTTP deadline, transport/malformed/non-200 responses and absent configuration fail closed");
}
