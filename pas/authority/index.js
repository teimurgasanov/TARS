"use strict";

const { randomUUID, createHash } = require("crypto");
const { assertConfirmPaymentCommand, assertPaymentAuthorityResult, makePaymentAuthorityResult } = require("../contracts");
const { openDatabase } = require("./database");

const SUCCESS = new Set(["CONFIRMED", "ALREADY_CONFIRMED"]);

function stableJson(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stableJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

// WP-021 permits nullable IDs. This stronger, isolated boundary never does on success.
// Use before committing authority state, replaying a result, or dispatching an effect.
function assertDurableAuthorityResult(result) {
  assertPaymentAuthorityResult(result);
  if (SUCCESS.has(result.status) && (typeof result.canonicalPaymentId !== "string" || !result.canonicalPaymentId.trim())) {
    throw new TypeError("Successful durable PAS result requires canonicalPaymentId");
  }
  return result;
}

function result(status, canonicalPaymentId = null, reasonCode = null) {
  return assertDurableAuthorityResult(makePaymentAuthorityResult(status, { canonicalPaymentId, reasonCode }));
}

class Hold extends Error {
  constructor(reasonCode) {
    super(reasonCode);
    this.reasonCode = reasonCode;
  }
}

function observationKey(command) {
  // A message may contain several uploads: messageId alone must not collapse them.
  return stableJson(command.observation);
}

function aliasesFor(command) {
  const observationIdentity = command.observation.uploadId !== null
    ? { uploadId: command.observation.uploadId } : { messageId: command.observation.messageId };
  const aliases = [{ kind: "observation", value: stableJson(observationIdentity), strong: true }];
  for (const kind of ["receiptCaseId", "exactHash", "visualHash"]) {
    if (command.receiptEvidence[kind] !== null) {
      aliases.push({ kind, value: command.receiptEvidence[kind], strong: kind !== "visualHash" });
    }
  }
  return aliases;
}

class PaymentAuthority {
  #db;

  constructor(filename, { timeout = 5000 } = {}) {
    this.#db = openDatabase(filename, "schema.sql", 0x50415331, timeout, 2);
  }

  close() { this.#db.close(); }

  confirmPayment(input) {
    let command;
    let commandJson;
    try {
      // Snapshot before validation so a caller cannot mutate inputs during processing.
      command = JSON.parse(JSON.stringify(input));
      assertConfirmPaymentCommand(command);
      if (command.mode === "AUTO" && [command.payment.amount, command.payment.date]
        .some(field => field.provenance.source !== "EXTRACTED")) {
        return result("REJECTED", null, "AUTO_MANUAL_PROVENANCE");
      }
      commandJson = stableJson(command);
    } catch (_error) {
      return result("REJECTED", null, "INVALID_COMMAND");
    }

    try {
      return this.#db.transaction(() => {
        const prior = this.#db.prepare("SELECT * FROM CommandLog WHERE commandId = ?").get(command.commandId);
        if (prior) {
          if (prior.commandJson !== commandJson) return result("CONFLICT", null, "COMMAND_ID_REUSED");
          return assertDurableAuthorityResult(JSON.parse(prior.resultJson));
        }

        let authorityResult;
        try {
          // A savepoint rolls back ALL tentative authority changes on a semantic conflict.
          // The outer transaction can then durably remember the HOLD response alone.
          authorityResult = this.#db.transaction(() => this.#resolve(command, commandJson))();
        } catch (error) {
          if (!(error instanceof Hold)) throw error;
          authorityResult = result("CONFLICT", null, error.reasonCode);
        }
        assertDurableAuthorityResult(authorityResult);
        this.#db.prepare(`INSERT INTO CommandLog
          (commandId, commandJson, status, canonicalPaymentId, resultJson) VALUES (?, ?, ?, ?, ?)`)
          .run(command.commandId, commandJson, authorityResult.status, authorityResult.canonicalPaymentId, stableJson(authorityResult));

        if (SUCCESS.has(authorityResult.status)) {
          this.#recordEffects(command, authorityResult);
        }
        return authorityResult;
      }).immediate(); // SQLite write serialization starts BEFORE any lookup, including command replay.
    } catch (_error) {
      // Never expose SQL/receipt data; uncertain storage outcomes require retry by commandId.
      return result("AUTHORITY_UNAVAILABLE", null, "AUTHORITY_STORAGE_FAILED");
    }
  }

  #resolve(command, commandJson) {
    const aliases = aliasesFor(command);
    const resolved = aliases.map(alias => ({ ...alias, payment: this.#db.prepare(
      "SELECT canonicalPaymentId FROM IdentityAlias WHERE kind = ? AND aliasValue = ?"
    ).get(alias.kind, alias.value) }));
    const owners = new Set(resolved.filter(alias => alias.payment).map(alias => alias.payment.canonicalPaymentId));
    if (owners.size > 1) throw new Hold("ALIAS_CONFLICT");
    const knownStrong = resolved.some(alias => alias.strong && alias.payment);
    if (owners.size && !knownStrong) throw new Hold("WEAK_ALIAS_ONLY");
    // No amount/date key; no canonical identity supplied or computed by TARS.
    // New slots need a case or exact evidence anchor, not merely a new message or visual similarity.
    if (!owners.size && !command.receiptEvidence.receiptCaseId && !command.receiptEvidence.exactHash) {
      throw new Hold("INSUFFICIENT_IDENTITY_EVIDENCE");
    }
    let canonicalPaymentId = owners.values().next().value;
    const status = canonicalPaymentId ? "ALREADY_CONFIRMED" : "CONFIRMED";
    const amount = command.payment.amount.value;
    const paymentDate = command.payment.date.value;
    if (canonicalPaymentId) {
      const payment = this.#db.prepare(`SELECT p.* FROM PaymentSlot s
        JOIN ConfirmedPayment p ON p.canonicalPaymentId = s.canonicalPaymentId
          AND p.confirmationId = s.liveConfirmationId
        WHERE s.canonicalPaymentId = ?`).get(canonicalPaymentId);
      if (!payment) throw new Error("No live confirmation; operation is not supported by this MVP");
      if (payment.amountMinorUnits !== amount.minorUnits || payment.currency !== amount.currency || payment.paymentDate !== paymentDate) {
        throw new Hold("CONFIRMED_VALUES_CONFLICT");
      }
    } else {
      canonicalPaymentId = randomUUID();
      const confirmationId = randomUUID();
      // The deferred composite FK is checked at the outer commit, after both inserts.
      this.#db.prepare("INSERT INTO PaymentSlot (canonicalPaymentId, liveConfirmationId) VALUES (?, ?)")
        .run(canonicalPaymentId, confirmationId);
      this.#db.prepare(`INSERT INTO ConfirmedPayment
        (confirmationId, canonicalPaymentId, amountMinorUnits, currency, paymentDate, firstCommandJson)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(confirmationId, canonicalPaymentId, amount.minorUnits, amount.currency, paymentDate, commandJson);
    }
    for (const alias of resolved) {
      if (!alias.payment) this.#db.prepare(
        "INSERT INTO IdentityAlias (kind, aliasValue, canonicalPaymentId) VALUES (?, ?, ?)"
      ).run(alias.kind, alias.value, canonicalPaymentId);
    }
    return result(status, canonicalPaymentId);
  }

  #recordEffects(command, authorityResult) {
    assertDurableAuthorityResult(authorityResult);
    const canonicalPaymentId = authorityResult.canonicalPaymentId;
    this.#db.prepare("INSERT INTO CommandEvidence (commandId, canonicalPaymentId, evidenceJson) VALUES (?, ?, ?)")
      .run(command.commandId, canonicalPaymentId, stableJson({ receiptEvidence: command.receiptEvidence, observation: command.observation }));
    const definitions = [
      { kind: "WRITE_CONFIRMED_PROJECTION", key: "payment", payload: {
        canonicalPaymentId, amount: command.payment.amount.value, date: command.payment.date.value
      } },
      { kind: "ASSOCIATE_OBSERVATION", key: observationKey(command), payload: {
        canonicalPaymentId, observation: command.observation
      } }
    ];
    for (const definition of definitions) {
      let effect = this.#db.prepare("SELECT * FROM FinancialEffect WHERE canonicalPaymentId = ? AND kind = ? AND dedupeKey = ?")
        .get(canonicalPaymentId, definition.kind, definition.key);
      if (!effect) {
        const payloadJson = stableJson(definition.payload);
        effect = { effectId: randomUUID() };
        this.#db.prepare(`INSERT INTO FinancialEffect
          (effectId, canonicalPaymentId, kind, dedupeKey, payloadJson, payloadDigest) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(effect.effectId, canonicalPaymentId, definition.kind, definition.key, payloadJson, digest(payloadJson));
      }
      this.#db.prepare("INSERT INTO CommandEffect (commandId, effectId) VALUES (?, ?)").run(command.commandId, effect.effectId);
    }
  }

  getCommandCompletion(commandId) {
    const command = this.#db.prepare("SELECT resultJson FROM CommandLog WHERE commandId = ?").get(commandId);
    if (!command) return null;
    const authorityResult = assertDurableAuthorityResult(JSON.parse(command.resultJson));
    const effects = this.#db.prepare(`SELECT e.effectId, e.kind, e.state, e.attempts
      FROM FinancialEffect e JOIN CommandEffect c ON c.effectId = e.effectId
      WHERE c.commandId = ? ORDER BY e.kind, e.effectId`).all(commandId);
    return {
      result: authorityResult, effects,
      completion: !SUCCESS.has(authorityResult.status) ? "NOT_APPLICABLE"
        : effects.length === 2 && effects.every(effect => effect.state === "COMPLETED") ? "COMPLETED" : "PENDING"
    };
  }

  async completePendingEffects(consumer) {
    if (!consumer || typeof consumer.applyEffect !== "function") throw new TypeError("An idempotent durable effect consumer is required");
    // Delivery is at least once: parallel dispatchers and lost acknowledgements may repeat an effect.
    // The consumer MUST atomically deduplicate effectId with its own durable mutation (see projection-store.js).
    const effects = this.#db.prepare("SELECT * FROM FinancialEffect WHERE state = 'PENDING' ORDER BY rowid").all();
    for (const effect of effects) {
      assertDurableAuthorityResult(result("CONFIRMED", effect.canonicalPaymentId));
      this.#db.prepare("UPDATE FinancialEffect SET attempts = attempts + 1 WHERE effectId = ? AND state = 'PENDING'").run(effect.effectId);
      const acknowledgement = await consumer.applyEffect({
        effectId: effect.effectId, kind: effect.kind, payload: JSON.parse(effect.payloadJson), payloadDigest: effect.payloadDigest
      });
      if (!acknowledgement || acknowledgement.effectId !== effect.effectId || acknowledgement.payloadDigest !== effect.payloadDigest) {
        throw new Error("Effect acknowledgement mismatch; completion remains pending");
      }
      this.#db.prepare("UPDATE FinancialEffect SET state = 'COMPLETED' WHERE effectId = ? AND state = 'PENDING'").run(effect.effectId);
    }
    return { pending: this.#db.prepare("SELECT count(*) AS n FROM FinancialEffect WHERE state = 'PENDING'").get().n };
  }
}

module.exports = { PaymentAuthority, assertDurableAuthorityResult, stableJson, digest };
