"use strict";

const {
  PaymentAuthorityResultStatus,
  assertConfirmPaymentCommand,
  assertPaymentAuthorityResult,
  makePaymentAuthorityResult
} = require("./contracts");

const PaymentProjectionEffect = Object.freeze({
  WRITE_NEW_CONFIRMED_PROJECTION: "WRITE_NEW_CONFIRMED_PROJECTION",
  ASSOCIATE_OBSERVATION: "ASSOCIATE_OBSERVATION",
  REBUILD_EXISTING_CONFIRMED_PROJECTION: "REBUILD_EXISTING_CONFIRMED_PROJECTION"
});

function decidePaymentAuthorityResult(result) {
  assertPaymentAuthorityResult(result);
  const confirmed = result.status === PaymentAuthorityResultStatus.CONFIRMED;
  const associated = result.status === PaymentAuthorityResultStatus.ALREADY_CONFIRMED;
  return Object.freeze({
    status: result.status,
    allowNewConfirmedFinancialState: confirmed,
    allowObservationAssociation: confirmed || associated,
    allowExistingConfirmedProjectionRebuild: associated,
    holdForManualReconciliation: result.status === PaymentAuthorityResultStatus.CONFLICT,
    authorityUnavailable: result.status === PaymentAuthorityResultStatus.AUTHORITY_UNAVAILABLE
  });
}

function optionalEffect(effects, name) {
  if (effects[name] === undefined) return null;
  if (typeof effects[name] !== "function") throw new TypeError("effects." + name + " must be a function");
  return effects[name];
}

async function executePaymentProjectionGate(result, effects = {}) {
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) {
    throw new TypeError("effects must be an object");
  }
  const decision = decidePaymentAuthorityResult(result);
  const context = Object.freeze({ result, decision });
  const executedEffects = [];

  if (decision.allowNewConfirmedFinancialState) {
    const writeConfirmedProjection = optionalEffect(effects, "writeConfirmedProjection");
    if (writeConfirmedProjection) {
      await writeConfirmedProjection(context);
      executedEffects.push(PaymentProjectionEffect.WRITE_NEW_CONFIRMED_PROJECTION);
    }
  }
  if (decision.allowObservationAssociation) {
    const associateObservation = optionalEffect(effects, "associateObservation");
    if (associateObservation) {
      await associateObservation(context);
      executedEffects.push(PaymentProjectionEffect.ASSOCIATE_OBSERVATION);
    }
  }
  if (decision.allowExistingConfirmedProjectionRebuild) {
    const rebuildConfirmedProjection = optionalEffect(effects, "rebuildConfirmedProjection");
    if (rebuildConfirmedProjection) {
      await rebuildConfirmedProjection(context);
      executedEffects.push(PaymentProjectionEffect.REBUILD_EXISTING_CONFIRMED_PROJECTION);
    }
  }

  return Object.freeze({
    result,
    decision,
    executedEffects: Object.freeze(executedEffects)
  });
}

async function confirmPaymentThroughAuthority(authority, command, effects = {}) {
  assertConfirmPaymentCommand(command);
  if (!authority || typeof authority.confirmPayment !== "function") {
    throw new TypeError("authority.confirmPayment is required");
  }

  let result;
  try {
    result = await authority.confirmPayment(command);
  } catch (_error) {
    result = makePaymentAuthorityResult(PaymentAuthorityResultStatus.AUTHORITY_UNAVAILABLE, {
      reasonCode: "AUTHORITY_CALL_FAILED"
    });
  }
  assertPaymentAuthorityResult(result);
  return executePaymentProjectionGate(result, effects);
}

module.exports = {
  PaymentProjectionEffect,
  decidePaymentAuthorityResult,
  executePaymentProjectionGate,
  confirmPaymentThroughAuthority
};
