"use strict";

const ConfirmPaymentCommandType = "CONFIRM_PAYMENT";
const ConfirmPaymentCommandVersion = "PAS_CONFIRM_PAYMENT_V1";

const ConfirmPaymentMode = Object.freeze({
  AUTO: "AUTO",
  MANUAL: "MANUAL"
});

const PaymentActorKind = Object.freeze({
  SYSTEM: "SYSTEM",
  OPERATOR: "OPERATOR"
});

const PaymentFieldSource = Object.freeze({
  EXTRACTED: "EXTRACTED",
  MANUAL_CORRECTION: "MANUAL_CORRECTION"
});

const PaymentAuthorityResultStatus = Object.freeze({
  CONFIRMED: "CONFIRMED",
  ALREADY_CONFIRMED: "ALREADY_CONFIRMED",
  REJECTED: "REJECTED",
  CONFLICT: "CONFLICT",
  AUTHORITY_UNAVAILABLE: "AUTHORITY_UNAVAILABLE"
});

const MODES = new Set(Object.values(ConfirmPaymentMode));
const ACTOR_KINDS = new Set(Object.values(PaymentActorKind));
const FIELD_SOURCES = new Set(Object.values(PaymentFieldSource));
const RESULT_STATUSES = new Set(Object.values(PaymentAuthorityResultStatus));

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isAmount(value) {
  return isPlainObject(value)
    && Number.isSafeInteger(value.minorUnits)
    && value.minorUnits > 0
    && typeof value.currency === "string"
    && value.currency.length === 3;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(label + " must be a non-empty string");
  }
}

function assertNullableReference(value, label) {
  if (value !== null) assertNonEmptyString(value, label);
}

function cloneAmount(value) {
  return { minorUnits: value.minorUnits, currency: value.currency };
}

function cloneFieldValue(field, value) {
  return field === "amount" ? cloneAmount(value) : value;
}

function assertFieldValue(field, value, label) {
  if (field === "amount" && !isAmount(value)) {
    throw new TypeError(label + " must be a positive minor-unit amount");
  }
  if (field === "date" && !isIsoDate(value)) {
    throw new TypeError(label + " must be an ISO calendar date");
  }
}

function buildPaymentField(field, extractedValue, manualValue) {
  const hasExtracted = extractedValue !== undefined && extractedValue !== null;
  const hasManual = manualValue !== undefined && manualValue !== null;
  if (!hasExtracted && !hasManual) {
    throw new TypeError("payment." + field + " requires extracted or manual data");
  }
  if (hasExtracted) assertFieldValue(field, extractedValue, "extracted." + field);
  if (hasManual) assertFieldValue(field, manualValue, "manualCorrections." + field);

  return {
    value: cloneFieldValue(field, hasManual ? manualValue : extractedValue),
    provenance: {
      source: hasManual ? PaymentFieldSource.MANUAL_CORRECTION : PaymentFieldSource.EXTRACTED,
      supersedesSource: hasManual && hasExtracted ? PaymentFieldSource.EXTRACTED : null
    }
  };
}

function assertActor(actor, mode) {
  if (!isPlainObject(actor)) throw new TypeError("actor is required");
  if (!ACTOR_KINDS.has(actor.kind)) throw new TypeError("actor.kind is invalid");
  assertNonEmptyString(actor.reference, "actor.reference");
  if (mode === ConfirmPaymentMode.AUTO && actor.kind !== PaymentActorKind.SYSTEM) {
    throw new TypeError("AUTO confirmation requires a SYSTEM actor");
  }
  if (mode === ConfirmPaymentMode.MANUAL && actor.kind !== PaymentActorKind.OPERATOR) {
    throw new TypeError("MANUAL confirmation requires an OPERATOR actor");
  }
}

function assertObservation(observation) {
  if (!isPlainObject(observation)) throw new TypeError("observation is required");
  assertNullableReference(observation.messageId, "observation.messageId");
  assertNullableReference(observation.uploadId, "observation.uploadId");
  if (observation.messageId === null && observation.uploadId === null) {
    throw new TypeError("observation requires a messageId or uploadId");
  }
}

function assertReceiptEvidence(receiptEvidence) {
  if (!isPlainObject(receiptEvidence)) throw new TypeError("receiptEvidence is required");
  assertNullableReference(receiptEvidence.receiptCaseId, "receiptEvidence.receiptCaseId");
  assertNullableReference(receiptEvidence.exactHash, "receiptEvidence.exactHash");
  assertNullableReference(receiptEvidence.visualHash, "receiptEvidence.visualHash");
}

function assertPaymentField(field, value) {
  const label = "payment." + field;
  if (!isPlainObject(value)) throw new TypeError(label + " is required");
  assertFieldValue(field, value.value, label + ".value");
  if (!isPlainObject(value.provenance)) throw new TypeError(label + ".provenance is required");
  if (!FIELD_SOURCES.has(value.provenance.source)) {
    throw new TypeError(label + ".provenance.source is invalid");
  }
  if (value.provenance.supersedesSource !== null
    && value.provenance.supersedesSource !== PaymentFieldSource.EXTRACTED) {
    throw new TypeError(label + ".provenance.supersedesSource is invalid");
  }
  if (value.provenance.source === PaymentFieldSource.EXTRACTED
    && value.provenance.supersedesSource !== null) {
    throw new TypeError(label + " extracted data cannot supersede another source");
  }
}

function assertConfirmPaymentCommand(command) {
  if (!isPlainObject(command)) throw new TypeError("ConfirmPaymentCommand must be an object");
  if (command.type !== ConfirmPaymentCommandType) throw new TypeError("ConfirmPaymentCommand.type is invalid");
  if (command.version !== ConfirmPaymentCommandVersion) throw new TypeError("ConfirmPaymentCommand.version is invalid");
  assertNonEmptyString(command.commandId, "ConfirmPaymentCommand.commandId");
  if (!MODES.has(command.mode)) throw new TypeError("ConfirmPaymentCommand.mode is invalid");
  assertActor(command.actor, command.mode);
  assertObservation(command.observation);
  assertReceiptEvidence(command.receiptEvidence);
  if (!isPlainObject(command.payment)) throw new TypeError("ConfirmPaymentCommand.payment is required");
  assertPaymentField("amount", command.payment.amount);
  assertPaymentField("date", command.payment.date);
  return command;
}

function buildConfirmPaymentCommand(input) {
  if (!isPlainObject(input)) throw new TypeError("ConfirmPaymentCommand input is required");
  if (!MODES.has(input.mode)) throw new TypeError("mode is invalid");
  const extracted = isPlainObject(input.extracted) ? input.extracted : {};
  const manualCorrections = isPlainObject(input.manualCorrections) ? input.manualCorrections : {};
  if (input.mode === ConfirmPaymentMode.AUTO && Object.keys(manualCorrections).length > 0) {
    throw new TypeError("AUTO confirmation cannot contain manual corrections");
  }

  const command = {
    type: ConfirmPaymentCommandType,
    version: ConfirmPaymentCommandVersion,
    commandId: input.commandId,
    mode: input.mode,
    actor: {
      kind: input.actor && input.actor.kind,
      reference: input.actor && input.actor.reference
    },
    observation: {
      messageId: input.observation && input.observation.messageId === undefined ? null : input.observation && input.observation.messageId,
      uploadId: input.observation && input.observation.uploadId === undefined ? null : input.observation && input.observation.uploadId
    },
    receiptEvidence: {
      receiptCaseId: input.receiptEvidence && input.receiptEvidence.receiptCaseId === undefined ? null : input.receiptEvidence && input.receiptEvidence.receiptCaseId,
      exactHash: input.receiptEvidence && input.receiptEvidence.exactHash === undefined ? null : input.receiptEvidence && input.receiptEvidence.exactHash,
      visualHash: input.receiptEvidence && input.receiptEvidence.visualHash === undefined ? null : input.receiptEvidence && input.receiptEvidence.visualHash
    },
    payment: {
      amount: buildPaymentField("amount", extracted.amount, manualCorrections.amount),
      date: buildPaymentField("date", extracted.date, manualCorrections.date)
    }
  };
  return assertConfirmPaymentCommand(command);
}

function assertPaymentAuthorityResult(result) {
  if (!isPlainObject(result)) throw new TypeError("PaymentAuthorityResult must be an object");
  if (!RESULT_STATUSES.has(result.status)) throw new TypeError("PaymentAuthorityResult.status is invalid");
  assertNullableReference(result.canonicalPaymentId, "PaymentAuthorityResult.canonicalPaymentId");
  if (result.reasonCode !== null) assertNonEmptyString(result.reasonCode, "PaymentAuthorityResult.reasonCode");
  return result;
}

function makePaymentAuthorityResult(status, options = {}) {
  const result = {
    status,
    canonicalPaymentId: options.canonicalPaymentId === undefined ? null : options.canonicalPaymentId,
    reasonCode: options.reasonCode === undefined ? null : options.reasonCode
  };
  return assertPaymentAuthorityResult(result);
}

module.exports = {
  ConfirmPaymentCommandType,
  ConfirmPaymentCommandVersion,
  ConfirmPaymentMode,
  PaymentActorKind,
  PaymentFieldSource,
  PaymentAuthorityResultStatus,
  assertConfirmPaymentCommand,
  buildConfirmPaymentCommand,
  assertPaymentAuthorityResult,
  makePaymentAuthorityResult
};
