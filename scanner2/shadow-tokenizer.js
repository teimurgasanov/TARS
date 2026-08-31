"use strict";

const crypto = require("crypto");
const { isIsoDate, isAmount } = require("./contracts");

const TOKEN_TAGS = Object.freeze({
  document: "doc",
  transaction: "txn",
  exact: "ex",
  visual: "vis",
  duplicate: "dup",
  composite: "cmp"
});

function validSecret(secret) {
  if (Buffer.isBuffer(secret)) return secret.length >= 32;
  return typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= 32;
}

function validKeyVersion(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,7}$/.test(value);
}

function secretBuffer(secret) {
  return Buffer.isBuffer(secret) ? Buffer.from(secret) : Buffer.from(secret, "utf8");
}

function assertTokenInput(value, label) {
  if (typeof value !== "string" || !value || value.length > 4096) {
    throw new TypeError(label + " must be a non-empty bounded string");
  }
}

function addDays(date, offset) {
  if (!isIsoDate(date)) throw new TypeError("date must be an ISO calendar date");
  const parsed = new Date(date + "T00:00:00Z");
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createShadowTokenizer(options = {}) {
  if (!validSecret(options.secret) || !validKeyVersion(options.tokenKeyVersion)) return null;
  const secret = secretBuffer(options.secret);
  const tokenKeyVersion = options.tokenKeyVersion;

  const digest = (domain, value) => {
    assertTokenInput(value, domain);
    return crypto.createHmac("sha256", secret)
      .update("scanner2-shadow:v1\0" + domain + "\0" + value, "utf8")
      .digest();
  };

  const shortDigest = (domain, value) => digest(domain, value).toString("hex").slice(0, 48);
  const tokenize = (domain, value) => "tok-" + tokenKeyVersion + "-" + TOKEN_TAGS[domain] + "-" + shortDigest(domain, value);
  const tokenizeCase = (value) => "anon-" + tokenKeyVersion + "-" + shortDigest("case", value);

  const tokenizeCompositeTransaction = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("composite transaction must be an object");
    }
    if (!isIsoDate(value.date)) throw new TypeError("composite transaction date is invalid");
    if (typeof value.exactTime !== "string" || !/^\d{2}:\d{2}:\d{2}$/.test(value.exactTime)) {
      throw new TypeError("composite transaction exactTime is invalid");
    }
    if (!isAmount(value.amount)) throw new TypeError("composite transaction amount is invalid");
    if (typeof value.bank !== "string" || !value.bank.trim() || value.bank.length > 160) {
      throw new TypeError("composite transaction bank is invalid");
    }
    const canonical = [
      value.date,
      value.exactTime,
      String(value.amount.minorUnits),
      value.amount.currency,
      value.bank.trim().toLowerCase().replace(/\s+/g, " ")
    ].join("|");
    return tokenize("composite", canonical);
  };

  const dateOffsetForCase = (caseId) => {
    assertTokenInput(caseId, "caseId");
    const value = digest("date-shift", caseId);
    const magnitude = value.readUInt32BE(0) % 365 + 1;
    return value[4] & 1 ? magnitude : -magnitude;
  };

  const shiftSnapshotDates = (snapshot) => {
    const shifted = cloneJson(snapshot);
    const offset = dateOffsetForCase(shifted.caseId);
    const shift = (value) => value === null ? null : addDays(value, offset);
    shifted.acceptedDates = shifted.acceptedDates.map(shift);
    shifted.legacyOcrResults.forEach((item) => { item.date = shift(item.date); });
    shifted.legacyVisionResults.forEach((item) => { item.date = shift(item.date); });
    if (shifted.legacyDecision !== null) shifted.legacyDecision.date = shift(shifted.legacyDecision.date);
    return shifted;
  };

  return Object.freeze({
    tokenKeyVersion,
    tokenizeCase,
    tokenizeDocument: (value) => tokenize("document", value),
    tokenizeTransaction: (value) => tokenize("transaction", value),
    tokenizeExact: (value) => tokenize("exact", value),
    tokenizeVisual: (value) => tokenize("visual", value),
    tokenizeDuplicateReference: (value) => tokenize("duplicate", value),
    tokenizeCompositeTransaction,
    shiftDateForCase: (caseId, date) => addDays(date, dateOffsetForCase(caseId)),
    shiftSnapshotDates
  });
}

module.exports = {
  createShadowTokenizer,
  validSecret,
  validKeyVersion
};
