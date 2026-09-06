"use strict";

const assert = require("assert");
const fs = require("fs");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

function createPersistenceHarness(initialIndex) {
  let record = initialIndex;
  const reader = {
    getPersistenceReader() {
      return {
        async readByAssociation() {
          return JSON.parse(JSON.stringify(record ? [record] : []));
        }
      };
    }
  };
  const persistence = {
    async updateByAssociation(_association, value) {
      record = JSON.parse(JSON.stringify(value));
      return "receipt-index";
    }
  };
  return { reader, persistence };
}

async function reproduceLegacyRace(writeOrder) {
  const guard = loadTrackedAppWithGuard().__testGuard;
  const identity = "id:same-operation";
  const rejected = {
    exact: "manual-image-exact",
    receiptIdentity: identity,
    receiptDate: "2026-09-06",
    receiptAmount: 600,
    source: "rejected",
    uploadedAt: 100
  };
  const harness = createPersistenceHarness({ version: 1, photos: [rejected] });
  const manualSnapshot = await guard.readIndex(harness.reader, guard.PROTECTED_ROOMS.kassa.index);
  // The automatic event took its snapshot before the rejected/control row
  // became visible; the manual actor took its snapshot after it was stored.
  const automaticSnapshot = { version: 1, photos: [] };

  manualSnapshot.photos[0] = {
    ...manualSnapshot.photos[0],
    source: "confirmed",
    approvedAt: 300,
    postProcessedAt: 300
  };
  automaticSnapshot.photos.push({
    exact: "automatic-image-exact",
    receiptIdentity: identity,
    receiptDate: "2026-09-06",
    receiptAmount: 600,
    source: "confirmed",
    uploadedAt: 200,
    postProcessedAt: 400
  });

  const writes = {
    automatic: () => guard.writeIndex(harness.persistence, guard.PROTECTED_ROOMS.kassa.index, automaticSnapshot),
    manual: () => guard.writeIndex(harness.persistence, guard.PROTECTED_ROOMS.kassa.index, manualSnapshot)
  };
  for (const writer of writeOrder) await writes[writer]();

  const finalIndex = await guard.readIndex(harness.reader, guard.PROTECTED_ROOMS.kassa.index);
  return finalIndex.photos.filter((entry) => entry.source === "confirmed" && entry.receiptIdentity === identity);
}

async function runGuardedAcceptanceOrder(acceptanceOrder) {
  const guard = loadTrackedAppWithGuard().__testGuard;
  assert.strictEqual(typeof guard.commitReceiptAcceptanceV1, "function");
  const identity = "id:same-operation";
  const rejected = {
    exact: "manual-image-exact",
    receiptIdentity: identity,
    receiptDate: "2026-09-06",
    receiptAmount: 600,
    source: "rejected",
    uploadedAt: 100
  };
  const unrelated = {
    exact: "unrelated-exact",
    receiptIdentity: "id:unrelated-operation",
    receiptDate: "2026-09-06",
    receiptAmount: 900,
    source: "confirmed",
    uploadedAt: 50
  };
  const harness = createPersistenceHarness({ version: 1, photos: [unrelated, rejected] });
  const candidates = {
    automatic: {
      exact: "automatic-image-exact",
      receiptIdentity: identity,
      receiptDate: "2026-09-06",
      receiptAmount: 600,
      source: "confirmed",
      uploadedAt: 200,
      postProcessedAt: 400
    },
    manual: {
      ...rejected,
      source: "confirmed",
      approvedAt: 300,
      postProcessedAt: 300
    }
  };
  const results = await Promise.all(acceptanceOrder.map((actor) =>
    guard.commitReceiptAcceptanceV1(
      harness.reader,
      harness.persistence,
      candidates[actor],
      actor === "manual" ? { requireExistingSource: "rejected", confirmedOnlyDuplicate: true } : { recordDuplicate: true }
    )
  ));
  const finalIndex = await guard.readIndex(harness.reader, guard.PROTECTED_ROOMS.kassa.index);
  return {
    results,
    finalIndex,
    confirmed: finalIndex.photos.filter((entry) => entry.source === "confirmed" && entry.receiptIdentity === identity)
  };
}

(async () => {
  const source = fs.readFileSync("TarsReportApp.js", "utf8");
  const automatic = source.slice(source.indexOf("async function rejectDuplicateMessage"), source.indexOf("async function processPersonalMediaV2"));
  const manualCommand = source.slice(source.indexOf("async handleApproveReceiptCommand"), source.indexOf("async handleApproveReceiptButton"));
  const manualButton = source.slice(source.indexOf("async handleApproveReceiptButton"), source.indexOf("photoReportIntentAssociation", source.indexOf("async handleApproveReceiptButton")));
  const repair = source.slice(source.indexOf("async function repairTodayReceiptIndex"), source.indexOf("async function sendTodayTransferSummary"));
  assert.ok((automatic.match(/commitReceiptAcceptanceV1\(/g) || []).length >= 2, "both automatic confirmed-entry branches must use the shared guard");
  assert.match(manualCommand, /G\.commitReceiptAcceptanceV1\(/);
  assert.match(manualButton, /G\.commitReceiptAcceptanceV1\(/);
  assert.doesNotMatch(manualCommand, /G\.writeIndex\(t, G\.PROTECTED_ROOMS\.kassa\.index/);
  assert.doesNotMatch(manualButton, /G\.writeIndex\(t, G\.PROTECTED_ROOMS\.kassa\.index/);
  assert.ok((repair.match(/commitReceiptAcceptanceV1\(/g) || []).length >= 2, "repair promotions must use the shared guard");
  assert.ok(automatic.indexOf("commitReceiptAcceptanceV1") < automatic.lastIndexOf("publishAcceptedReceipt"), "automatic acceptance must commit before accepted publishing");
  assert.ok(manualCommand.indexOf("commitReceiptAcceptanceV1") < manualCommand.indexOf("scheduleTarsMemoryHumanReceiptConfirmationV1"), "manual command must commit before Memory/report effects");
  assert.ok(manualButton.indexOf("commitReceiptAcceptanceV1") < manualButton.indexOf("scheduleTarsMemoryHumanReceiptConfirmationV1"), "manual button must commit before Memory/report effects");

  const legacyManualThenAutomatic = await reproduceLegacyRace(["manual", "automatic"]);
  assert.strictEqual(legacyManualThenAutomatic.length, 2, "clean develop must reproduce the stale-snapshot defect");

  const manualThenAutomatic = await runGuardedAcceptanceOrder(["manual", "automatic"]);
  assert.strictEqual(
    manualThenAutomatic.confirmed.length,
    1,
    "manual then automatic must not confirm two images of one receipt identity"
  );
  assert.deepStrictEqual(manualThenAutomatic.results.map((result) => result.status), ["accepted", "duplicate"]);
  assert.strictEqual(manualThenAutomatic.results.filter((result) => result.status === "accepted").length, 1, "only one path may proceed to ledger/report effects");
  assert.ok(manualThenAutomatic.finalIndex.photos.some((entry) => entry.exact === "unrelated-exact" && entry.source === "confirmed"), "guard must preserve unrelated confirmed updates");
  assert.strictEqual(manualThenAutomatic.finalIndex.photos.filter((entry) => entry.source === "confirmed").reduce((sum, entry) => sum + Number(entry.receiptAmount || 0), 0), 1500, "running totals must contain the receipt once and preserve unrelated receipts");

  const legacyAutomaticThenManual = await reproduceLegacyRace(["automatic", "manual"]);
  assert.strictEqual(legacyAutomaticThenManual.length, 2, "clean develop must reproduce the reverse stale-snapshot defect");

  const automaticThenManual = await runGuardedAcceptanceOrder(["automatic", "manual"]);
  assert.strictEqual(
    automaticThenManual.confirmed.length,
    1,
    "automatic then manual must not confirm two images of one receipt identity"
  );
  assert.deepStrictEqual(automaticThenManual.results.map((result) => result.status), ["duplicate", "accepted"]);
  assert.strictEqual(automaticThenManual.results.filter((result) => result.status === "accepted").length, 1, "reverse order may authorize only one financial path");
  assert.ok(automaticThenManual.finalIndex.photos.some((entry) => entry.exact === "unrelated-exact" && entry.source === "confirmed"), "reverse order must preserve unrelated confirmed updates");
  assert.strictEqual(automaticThenManual.finalIndex.photos.filter((entry) => entry.source === "confirmed").reduce((sum, entry) => sum + Number(entry.receiptAmount || 0), 0), 1500, "reverse order must not double the financial total");

  console.log("PASS: automatic/manual receipt acceptance is identity-idempotent in both orders");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
