"use strict";

const assert = require("assert");
const { buildIdentity, buildWeakFingerprint } = require("../scanner2/identity-builder");

const amount = { minorUnits: 130000, currency: "RUB" };
assert.strictEqual(
  buildIdentity({ documentId: "SYNTHETIC-42", date: "2026-08-30", amount }),
  "scanner2:v1:id:synthetic42|2026-08-30|130000"
);
assert.strictEqual(
  buildIdentity({ transactionId: " TX 9001 ", date: "2026-08-30", amount }),
  "scanner2:v1:txn:tx9001|2026-08-30|130000"
);
assert.strictEqual(
  buildIdentity({ bank: "Demo Bank", time: "12:34:56", date: "2026-08-30", amount }),
  "scanner2:v1:time:2026-08-30|123456|130000|demobank"
);
assert.strictEqual(buildIdentity({ bank: "Demo Bank", time: "12:34", date: "2026-08-30", amount }), null);
assert.strictEqual(buildIdentity({ documentId: "SYNTHETIC-42", date: null, amount }), null);
assert.strictEqual(buildIdentity({ date: "2026-08-30", amount }), null);

const sourceA = buildIdentity({ documentId: "SYNTHETIC-42", date: "2026-08-30", amount });
const sourceB = buildIdentity({ documentId: "synthetic 42", date: "2026-08-30", amount });
assert.strictEqual(sourceA, sourceB, "equivalent source formatting must build the same identity");

const templateA = {
  textFingerprint: "Перевод выполнен. Сумма операции. Получатель.",
  date: "2026-08-30",
  amount
};
const templateB = {
  textFingerprint: "Перевод выполнен. Сумма операции. Получатель.",
  date: "2026-08-30",
  amount
};
assert.strictEqual(buildIdentity(templateA), null, "text fingerprint must not create strong identity");
assert.strictEqual(buildIdentity(templateB), null, "same template must not create strong identity for another document");
const weakA = buildWeakFingerprint(templateA);
const weakB = buildWeakFingerprint(templateB);
assert.ok(weakA.startsWith("scanner2:v1:weak:"));
assert.strictEqual(weakA, weakB, "template similarity may only produce a separate weak signal");

console.log("PASS: Scanner2IdentityBuilder is stable and fail-closed");
