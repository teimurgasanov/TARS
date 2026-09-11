"use strict";
// Test-only instrumentation reports entry into an accepted authority command.
// A parent-held SQLite lock then keeps the real transaction in its bounded wait.
const { PaymentAuthority } = require("../../pas/authority");
const original = PaymentAuthority.prototype.confirmPayment;
PaymentAuthority.prototype.confirmPayment = function (command) {
  process.send({ accepted: true });
  return original.call(this, command);
};
require("../../pas/service/entrypoint").main().catch(() => { process.exitCode = 1; });
