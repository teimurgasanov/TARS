"use strict";

const {
  assertConfirmPaymentCommand,
  assertPaymentAuthorityResult
} = require("../../pas/contracts");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// TEST-ONLY response injector. It models neither payment identity nor uniqueness.
class FakePaymentAuthority {
  constructor(resultsByCommandId) {
    if (!resultsByCommandId || typeof resultsByCommandId !== "object" || Array.isArray(resultsByCommandId)) {
      throw new TypeError("resultsByCommandId must be an object");
    }
    this.resultsByCommandId = new Map();
    Object.entries(resultsByCommandId).forEach(([commandId, result]) => {
      this.resultsByCommandId.set(commandId, cloneJson(assertPaymentAuthorityResult(result)));
    });
    this.calls = [];
  }

  async confirmPayment(command) {
    assertConfirmPaymentCommand(command);
    this.calls.push(cloneJson(command));
    if (!this.resultsByCommandId.has(command.commandId)) {
      throw new Error("No fake PAS result configured for commandId " + command.commandId);
    }
    return cloneJson(this.resultsByCommandId.get(command.commandId));
  }
}

module.exports = {
  FakePaymentAuthority
};
