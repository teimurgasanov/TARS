"use strict";

const fs = require("fs");
const assert = require("assert");
const { evaluateRules } = require("../scanner2/rule-engine");
const { resolveConflicts } = require("../scanner2/conflict-resolver");
const { buildIdentity } = require("../scanner2/identity-builder");
const { makeDecision } = require("../scanner2/decision-engine");
const { assertScanner2Result } = require("../scanner2/contracts");

const cases = JSON.parse(fs.readFileSync("tests/fixtures/scanner2/cases.json", "utf8"));
assert.ok(cases.length >= 10, "at least ten offline fixtures are required");

for (const fixture of cases) {
  const frozenInput = JSON.parse(JSON.stringify({
    acceptedDates: fixture.acceptedDates,
    observations: fixture.observations,
    duplicateEvidence: fixture.duplicateEvidence
  }));
  const snapshot = JSON.stringify(frozenInput);
  const evaluation = evaluateRules(frozenInput);
  const resolved = resolveConflicts(evaluation);
  const identity = buildIdentity({
    ...fixture.identityInput,
    date: fixture.identityInput.date === undefined ? resolved.date : fixture.identityInput.date,
    amount: fixture.identityInput.amount === undefined ? resolved.amount : fixture.identityInput.amount
  });
  const result = makeDecision(resolved, { identity });

  assertScanner2Result(result);
  assert.strictEqual(JSON.stringify(frozenInput), snapshot, fixture.name + ": pipeline mutated input");
  assert.strictEqual(result.decision, fixture.expected.decision, fixture.name + ": decision");
  assert.strictEqual(result.reasonCode, fixture.expected.reasonCode, fixture.name + ": reasonCode");
  assert.deepStrictEqual(result.amount, fixture.expected.amount, fixture.name + ": amount");
  assert.strictEqual(result.date, fixture.expected.date, fixture.name + ": date");
  assert.strictEqual(result.documentType, fixture.expected.documentType, fixture.name + ": documentType");
  assert.strictEqual(result.identity, fixture.expected.identity, fixture.name + ": identity");
  assert.deepStrictEqual(resolved.conflicts.map((item) => item.code), fixture.expected.conflicts, fixture.name + ": conflicts");

  const repeated = makeDecision(resolveConflicts(evaluateRules(frozenInput)), { identity });
  assert.deepStrictEqual(repeated, result, fixture.name + ": result must be deterministic");
}

const identityOptionalAcceptance = cases.find((item) => item.name === "normal receipt without durable identity");
assert.strictEqual(identityOptionalAcceptance.expected.decision, "ACCEPT");
assert.strictEqual(identityOptionalAcceptance.expected.identity, null);

const pending = cases.find((item) => item.name === "operation is still pending");
assert.strictEqual(pending.expected.decision, "REVIEW");
assert.strictEqual(pending.expected.reasonCode, "OPERATION_PENDING");

console.log("PASS: Scanner2Decision fixtures validate decisions, fields, identities and conflicts");
