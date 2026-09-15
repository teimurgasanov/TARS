"use strict";

const { createHash } = require("crypto");
const { buildConfirmPaymentCommand, makePaymentAuthorityResult } = require("./contracts");
const { receiptIdentityEvidence } = require("./receipt-identity");
const { confirmPaymentThroughAuthority } = require("./caller-seam");

function receiptAmount(value) {
  const amount = Number(value);
  const minorUnits = Math.round(amount * 100);
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0 || Math.abs(amount * 100 - minorUnits) > 0.000001) {
    throw new TypeError("Invalid receipt amount");
  }
  return { minorUnits, currency: "RUB" };
}

function automaticCommandId(entry) {
  if (!entry || typeof entry !== "object") throw new TypeError("Automatic receipt entry is required");
  const observation = [
    String(entry.messageId || "") || null,
    String(entry.uploadId || entry.uploadAttemptKey || "") || null
  ];
  if (!observation[0] && !observation[1]) throw new TypeError("Automatic receipt observation requires a message or upload");
  return "auto:" + createHash("sha256").update(JSON.stringify(observation)).digest("hex");
}

function buildAutomaticConfirmation(entry, commandId = automaticCommandId(entry)) {
  const receiptEvidence = {
    receiptCaseId: entry.receiptCaseId || null,
    exactHash: entry.exact || null,
    visualHash: entry.visual || null
  };
  if (entry.receiptIdentity) receiptEvidence.paymentIdentity = receiptIdentityEvidence(entry.receiptIdentity);
  return buildConfirmPaymentCommand({
    commandId,
    mode: "AUTO",
    actor: { kind: "SYSTEM", reference: "tars:auto-receipt" },
    observation: { messageId: entry.messageId || null, uploadId: entry.uploadId || entry.uploadAttemptKey || null },
    receiptEvidence,
    extracted: { amount: receiptAmount(entry.receiptAmount), date: entry.receiptDate }
  });
}

async function requestAutomaticConfirmation(authority, command) {
  try {
    const outcome = await confirmPaymentThroughAuthority(authority, command);
    if ((outcome.decision.allowNewConfirmedFinancialState || outcome.decision.allowObservationAssociation)
      && (typeof outcome.result.canonicalPaymentId !== "string" || !outcome.result.canonicalPaymentId.trim())) throw new Error("Invalid authority result");
    return outcome;
  } catch (_) {
    return { result: makePaymentAuthorityResult("AUTHORITY_UNAVAILABLE", { reasonCode: "AUTHORITY_CALL_FAILED" }), decision: {} };
  }
}

module.exports = { receiptAmount, automaticCommandId, buildAutomaticConfirmation, requestAutomaticConfirmation };
