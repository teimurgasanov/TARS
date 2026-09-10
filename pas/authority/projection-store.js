"use strict";

const { openDatabase } = require("./database");
const { stableJson, digest, assertDurableAuthorityResult } = require("./index");

// Reference local consumer proving durable retry semantics; never imported by live TARS.
class IsolatedProjectionStore {
  #db;

  constructor(filename) {
    this.#db = openDatabase(filename, "projection-schema.sql", 0x50415332);
  }

  close() { this.#db.close(); }

  applyEffect(effect) {
    if (!effect || typeof effect.effectId !== "string" || !effect.effectId.trim()) throw new TypeError("Invalid effect ID");
    assertDurableAuthorityResult({ status: "CONFIRMED", canonicalPaymentId: effect.payload && effect.payload.canonicalPaymentId, reasonCode: null });
    const payloadJson = stableJson(effect.payload);
    if (digest(payloadJson) !== effect.payloadDigest) throw new Error("Effect digest mismatch");
    return this.#db.transaction(() => {
      const prior = this.#db.prepare("SELECT * FROM EffectInbox WHERE effectId = ?").get(effect.effectId);
      if (prior) {
        if (prior.kind !== effect.kind || prior.payloadJson !== payloadJson || prior.payloadDigest !== effect.payloadDigest) {
          throw new Error("Effect ID reused with different content");
        }
      } else {
        const payload = effect.payload;
        if (effect.kind === "WRITE_CONFIRMED_PROJECTION") {
          this.#db.prepare("INSERT INTO Projection (canonicalPaymentId, amountMinorUnits, currency, paymentDate) VALUES (?, ?, ?, ?)")
            .run(payload.canonicalPaymentId, payload.amount.minorUnits, payload.amount.currency, payload.date);
        } else if (effect.kind === "ASSOCIATE_OBSERVATION") {
          this.#db.prepare("INSERT INTO ObservationProjection (canonicalPaymentId, observationJson) VALUES (?, ?)")
            .run(payload.canonicalPaymentId, stableJson(payload.observation));
        } else {
          throw new Error("Unknown effect kind");
        }
        // If the process dies before commit, BOTH mutation and inbox insert roll back.
        this.#db.prepare("INSERT INTO EffectInbox (effectId, kind, payloadJson, payloadDigest) VALUES (?, ?, ?, ?)")
          .run(effect.effectId, effect.kind, payloadJson, effect.payloadDigest);
      }
      return { effectId: effect.effectId, payloadDigest: effect.payloadDigest };
    }).immediate();
  }
}

module.exports = { IsolatedProjectionStore };
