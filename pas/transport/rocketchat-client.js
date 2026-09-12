"use strict";

const { randomBytes } = require("crypto");
const { PROTOCOL, MAX_BODY, keys, assertPayload, assertData } = require("./protocol");
const { makePaymentAuthorityResult } = require("../contracts");

// Uses the Apps-Engine HTTP capability, never native sockets or the authority DB.
// Empty configuration is intentionally unavailable; there is no legacy fallback.
class RocketChatPaymentAuthority {
  constructor(http, { baseUrl = "", token = "", timeoutMs = 2000 } = {}) {
    this.http = http;
    this.baseUrl = baseUrl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async confirmPayment(command) {
    const unavailable = () => makePaymentAuthorityResult("AUTHORITY_UNAVAILABLE", { reasonCode: "AUTHORITY_CALL_FAILED" });
    const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/?$/.exec(this.baseUrl);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535
      || !/^[A-Za-z0-9_-]{32,256}$/.test(this.token)
      || !this.http || typeof this.http.post !== "function"
      || !Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 30000) return unavailable();
    let timer;
    try {
      assertPayload("ConfirmPayment", command);
      const requestId = randomBytes(16).toString("hex");
      const content = JSON.stringify({ protocol: PROTOCOL, requestId, operation: "ConfirmPayment", payload: command });
      if (Buffer.byteLength(content) > MAX_BODY) return unavailable();
      const response = await Promise.race([
        this.http.post(this.baseUrl.replace(/\/$/, "") + "/v1/operation", {
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + this.token },
          // Keep the defensive option. Host support must be verified before any
          // activation; a returned non-200 response is always rejected below.
          content, timeout: this.timeoutMs, followRedirects: false
        }),
        new Promise(resolve => { timer = setTimeout(() => resolve(null), this.timeoutMs); })
      ]);
      if (!response || response.statusCode !== 200 || typeof response.content !== "string"
        || Buffer.byteLength(response.content) > MAX_BODY) return unavailable();
      const value = JSON.parse(response.content);
      keys(value, ["protocol", "requestId", "operation", "data"]);
      if (value.protocol !== PROTOCOL || value.requestId !== requestId || value.operation !== "ConfirmPayment") return unavailable();
      assertData("ConfirmPayment", value.data, command);
      return value.data;
    } catch (_) { return unavailable(); }
    finally { clearTimeout(timer); }
  }
}

module.exports = { RocketChatPaymentAuthority };
