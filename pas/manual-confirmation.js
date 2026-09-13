"use strict";

const { buildConfirmPaymentCommand, makePaymentAuthorityResult } = require("./contracts");
const { receiptIdentityEvidence } = require("./receipt-identity");
const { confirmPaymentThroughAuthority } = require("./caller-seam");
const { createHash } = require("crypto");

// Serializes this caller's index projections, not payment resolution. PAS's DB
// transaction remains the only RESOLVE/CREATE serialization across processes.
let queue = Promise.resolve();
function serializeManualConfirmation(run) {
  const operation = queue.then(run, run);
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}

function receiptAmount(value) {
  const amount = Number(value);
  const minorUnits = Math.round(amount * 100);
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0 || Math.abs(amount * 100 - minorUnits) > 0.000001) {
    throw new TypeError("Invalid receipt amount");
  }
  return { minorUnits, currency: "RUB" };
}

function manualCommandId(entry) {
  // Retry correlation only. Payment identity is resolved exclusively in PAS.
  return "manual:" + createHash("sha256").update(JSON.stringify([
    entry.roomId || null, entry.messageId || null, entry.uploadId || null, entry.exact || null
  ])).digest("hex");
}

function buildManualConfirmation(entry, actor, receiptCaseId, commandId) {
  return buildConfirmPaymentCommand({
    commandId, mode: "MANUAL", actor: { kind: "OPERATOR", reference: actor.id },
    observation: { messageId: entry.messageId || null, uploadId: entry.uploadId || null },
    receiptEvidence: {
      receiptCaseId: receiptCaseId || null, exactHash: entry.exact || null, visualHash: entry.visual || null,
      paymentIdentity: receiptIdentityEvidence(entry.receiptIdentity)
    },
    extracted: { amount: receiptAmount(entry.receiptAmount), date: entry.receiptDate }
  });
}

async function requestManualConfirmation(authority, command) {
  try {
    const outcome = await confirmPaymentThroughAuthority(authority, command);
    if ((outcome.decision.allowNewConfirmedFinancialState || outcome.decision.allowObservationAssociation)
      && (typeof outcome.result.canonicalPaymentId !== "string" || !outcome.result.canonicalPaymentId.trim())) {
      throw new Error("Invalid authority result");
    }
    return outcome;
  } catch (_) {
    return { result: makePaymentAuthorityResult("AUTHORITY_UNAVAILABLE", { reasonCode: "AUTHORITY_CALL_FAILED" }), decision: {} };
  }
}

module.exports = { serializeManualConfirmation, receiptAmount, manualCommandId, buildManualConfirmation, requestManualConfirmation };
