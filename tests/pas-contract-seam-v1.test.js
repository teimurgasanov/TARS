"use strict";

const assert = require("assert");
const fs = require("fs");
const {
  ConfirmPaymentMode,
  PaymentActorKind,
  PaymentFieldSource,
  PaymentAuthorityResultStatus,
  assertConfirmPaymentCommand,
  buildConfirmPaymentCommand,
  makePaymentAuthorityResult
} = require("../pas/contracts");
const {
  PaymentProjectionEffect,
  decidePaymentAuthorityResult,
  executePaymentProjectionGate,
  confirmPaymentThroughAuthority
} = require("../pas/caller-seam");
const { FakePaymentAuthority } = require("./helpers/fake-payment-authority");

function baseInput(mode, commandId) {
  return {
    commandId,
    mode,
    actor: mode === ConfirmPaymentMode.AUTO
      ? { kind: PaymentActorKind.SYSTEM, reference: "system-fixture" }
      : { kind: PaymentActorKind.OPERATOR, reference: "operator-fixture" },
    observation: { messageId: "message-fixture", uploadId: "upload-fixture" },
    receiptEvidence: {
      receiptCaseId: "case-fixture",
      exactHash: "exact-hash-fixture",
      visualHash: "visual-hash-fixture"
    },
    extracted: {
      amount: { minorUnits: 125000, currency: "RUB" },
      date: "2026-09-09"
    }
  };
}

function commandShape(value) {
  if (Array.isArray(value)) return [];
  if (!value || typeof value !== "object") return "scalar";
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, commandShape(value[key])]));
}

function effectRecorder() {
  const calls = [];
  return {
    calls,
    effects: {
      async writeConfirmedProjection(context) {
        calls.push({ name: "writeConfirmedProjection", canonicalPaymentId: context.result.canonicalPaymentId });
      },
      async associateObservation(context) {
        calls.push({ name: "associateObservation", canonicalPaymentId: context.result.canonicalPaymentId });
      },
      async rebuildConfirmedProjection(context) {
        calls.push({ name: "rebuildConfirmedProjection", canonicalPaymentId: context.result.canonicalPaymentId });
      }
    }
  };
}

(async () => {
  const automatic = buildConfirmPaymentCommand(baseInput(ConfirmPaymentMode.AUTO, "command-auto-fixture"));
  const manual = buildConfirmPaymentCommand({
    ...baseInput(ConfirmPaymentMode.MANUAL, "command-manual-fixture"),
    manualCorrections: {
      amount: { minorUnits: 127500, currency: "RUB" },
      date: "2026-09-08"
    }
  });

  assert.strictEqual(assertConfirmPaymentCommand(automatic), automatic);
  assert.strictEqual(assertConfirmPaymentCommand(manual), manual);
  assert.deepStrictEqual(commandShape(automatic), commandShape(manual), "AUTO and MANUAL must use one command shape");
  assert.strictEqual(manual.payment.amount.value.minorUnits, 127500, "manual amount is command data");
  assert.strictEqual(manual.payment.date.value, "2026-09-08", "manual date is command data");
  assert.strictEqual(manual.payment.amount.provenance.source, PaymentFieldSource.MANUAL_CORRECTION);
  assert.strictEqual(manual.payment.amount.provenance.supersedesSource, PaymentFieldSource.EXTRACTED);
  assert.strictEqual(manual.payment.date.provenance.source, PaymentFieldSource.MANUAL_CORRECTION);
  assert.strictEqual(manual.payment.date.provenance.supersedesSource, PaymentFieldSource.EXTRACTED);
  assert.strictEqual(automatic.payment.amount.provenance.source, PaymentFieldSource.EXTRACTED);
  assert.strictEqual(automatic.payment.amount.provenance.supersedesSource, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(automatic, "canonicalPaymentKey"));
  assert.ok(!Object.prototype.hasOwnProperty.call(manual, "canonicalPaymentKey"));

  const buildEntry = fs.readFileSync("tools/tars-build-entry.js", "utf8");
  assert.match(buildEntry, /require\("\.\.\/pas\/contracts"\)/);
  assert.match(buildEntry, /require\("\.\.\/pas\/caller-seam"\)/);
  assert.doesNotMatch(buildEntry, /fake-payment-authority|tests\/helpers/, "production build must not include the test fake");

  for (const status of [
    PaymentAuthorityResultStatus.AUTHORITY_UNAVAILABLE,
    PaymentAuthorityResultStatus.CONFLICT,
    PaymentAuthorityResultStatus.REJECTED
  ]) {
    const recorder = effectRecorder();
    const result = makePaymentAuthorityResult(status, { reasonCode: "SYNTHETIC_" + status });
    const outcome = await executePaymentProjectionGate(result, recorder.effects);
    assert.strictEqual(outcome.decision.allowNewConfirmedFinancialState, false, status);
    assert.deepStrictEqual(outcome.executedEffects, [], status + " must not write success projections");
    assert.deepStrictEqual(recorder.calls, [], status + " must not run financial effects");
  }

  const conflictDecision = decidePaymentAuthorityResult(makePaymentAuthorityResult(
    PaymentAuthorityResultStatus.CONFLICT,
    { reasonCode: "SYNTHETIC_CONFLICT" }
  ));
  assert.strictEqual(conflictDecision.holdForManualReconciliation, true);

  const confirmedRecorder = effectRecorder();
  const confirmed = makePaymentAuthorityResult(PaymentAuthorityResultStatus.CONFIRMED, {
    canonicalPaymentId: "opaque-pas-payment-fixture"
  });
  const confirmedOutcome = await executePaymentProjectionGate(confirmed, confirmedRecorder.effects);
  assert.strictEqual(confirmedOutcome.decision.allowNewConfirmedFinancialState, true);
  assert.deepStrictEqual(confirmedOutcome.executedEffects, [
    PaymentProjectionEffect.WRITE_NEW_CONFIRMED_PROJECTION,
    PaymentProjectionEffect.ASSOCIATE_OBSERVATION
  ]);
  assert.deepStrictEqual(confirmedRecorder.calls, [
    { name: "writeConfirmedProjection", canonicalPaymentId: "opaque-pas-payment-fixture" },
    { name: "associateObservation", canonicalPaymentId: "opaque-pas-payment-fixture" }
  ]);

  const associatedRecorder = effectRecorder();
  const alreadyConfirmed = makePaymentAuthorityResult(PaymentAuthorityResultStatus.ALREADY_CONFIRMED, {
    canonicalPaymentId: "opaque-existing-payment-fixture"
  });
  const associatedOutcome = await executePaymentProjectionGate(alreadyConfirmed, associatedRecorder.effects);
  assert.strictEqual(associatedOutcome.decision.allowNewConfirmedFinancialState, false);
  assert.strictEqual(associatedOutcome.decision.allowExistingConfirmedProjectionRebuild, true);
  assert.deepStrictEqual(associatedOutcome.executedEffects, [
    PaymentProjectionEffect.ASSOCIATE_OBSERVATION,
    PaymentProjectionEffect.REBUILD_EXISTING_CONFIRMED_PROJECTION
  ]);
  assert.deepStrictEqual(associatedRecorder.calls.map((call) => call.name), [
    "associateObservation",
    "rebuildConfirmedProjection"
  ]);

  const fake = new FakePaymentAuthority({
    "command-auto-fixture": confirmed
  });
  const firstRetryResult = await fake.confirmPayment(automatic);
  const secondRetryResult = await fake.confirmPayment(automatic);
  assert.deepStrictEqual(secondRetryResult, firstRetryResult, "same commandId must receive the configured deterministic response");
  assert.strictEqual(fake.calls.length, 2);
  assert.strictEqual(fake.calls[0].commandId, fake.calls[1].commandId);

  const unavailableRecorder = effectRecorder();
  const unavailableOutcome = await confirmPaymentThroughAuthority({
    async confirmPayment() {
      throw new Error("synthetic authority outage");
    }
  }, automatic, unavailableRecorder.effects);
  assert.strictEqual(unavailableOutcome.result.status, PaymentAuthorityResultStatus.AUTHORITY_UNAVAILABLE);
  assert.deepStrictEqual(unavailableRecorder.calls, [], "authority exceptions must fail closed");

  console.log("PASS: PAS v1 contract, manual provenance, deterministic fake and projection gate");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
