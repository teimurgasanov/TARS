"use strict";

const crypto = require("crypto");
const { isIsoDate, isAmount } = require("./contracts");

function normalizedToken(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizedTime(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return "";
  return match[1] + match[2] + match[3];
}

function amountKey(amount) {
  return isAmount(amount) ? String(amount.minorUnits) : "";
}

function buildIdentity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Identity input must be an object");
  }
  const date = isIsoDate(input.date) ? input.date : "";
  const amount = amountKey(input.amount);
  if (!date || !amount) return null;

  const documentId = normalizedToken(input.documentId);
  if (documentId) return "scanner2:v1:id:" + documentId + "|" + date + "|" + amount;

  const transactionId = normalizedToken(input.transactionId);
  if (transactionId) return "scanner2:v1:txn:" + transactionId + "|" + date + "|" + amount;

  const time = normalizedTime(input.time);
  const bank = normalizedToken(input.bank);
  if (time && bank) return "scanner2:v1:time:" + date + "|" + time + "|" + amount + "|" + bank;

  return null;
}

function buildWeakFingerprint(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Weak fingerprint input must be an object");
  }
  const date = isIsoDate(input.date) ? input.date : "";
  const amount = amountKey(input.amount);
  const fingerprint = normalizedToken(input.textFingerprint);
  if (!date || !amount || !fingerprint) return null;
  const digest = crypto.createHash("sha256")
    .update(fingerprint + "|" + date + "|" + amount)
    .digest("hex")
    .slice(0, 32);
  return "scanner2:v1:weak:" + digest;
}

module.exports = {
  buildIdentity,
  buildWeakFingerprint
};
