"use strict";

// Representation of the baseline TARS extractReceiptIdentity / normalizedReceiptIdentityKey.
// No OCR, amount/date identity construction, or canonical payment ID lives here.
const FUNCTION_VERSION = "TARS_RECEIPT_IDENTITY_V1";

function assertReceiptIdentityEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
    || Object.keys(evidence).sort().join(",") !== "functionVersion,kind,rawValue"
    || evidence.functionVersion !== FUNCTION_VERSION
    || !["id", "txn", "text"].includes(evidence.kind)
    || typeof evidence.rawValue !== "string" || evidence.rawValue.length > 4096
    || !evidence.rawValue.startsWith(evidence.kind + ":")) throw new TypeError("Invalid payment identity evidence");
  const raw = evidence.rawValue;
  const date = "\\d{4}-\\d{2}-\\d{2}";
  const amount = "\\d+(?:\\.\\d+)?";
  const patterns = {
    id: new RegExp("^id:[A-ZА-Я0-9]+\\|(?:" + date + ")?\\|(?:" + amount + ")?$"),
    txn: new RegExp("^txn:" + date + "\\|\\d{1,2}:\\d{1,2}(?::\\d{1,2})?\\|" + amount + "$"),
    text: new RegExp("^text:" + date + "\\|" + amount + "\\|[a-f0-9]{8}$")
  };
  if (!patterns[evidence.kind].test(raw)
    || evidence.kind === "id" && !/\d/.test(raw.split("|")[0])) throw new TypeError("Unsafe payment identity evidence");
  if (evidence.kind === "txn") {
    const time = raw.split("|")[1].split(":").map(Number);
    if (time[0] > 23 || time[1] > 59 || (time[2] || 0) > 59) throw new TypeError("Unsafe payment identity time");
  }
  return evidence;
}

function receiptIdentityEvidence(rawValue) {
  return assertReceiptIdentityEvidence({ kind: String(rawValue || "").split(":")[0], functionVersion: FUNCTION_VERSION, rawValue });
}

function normalizedReceiptIdentityKey(receiptIdentity) {
  const identity = String(receiptIdentity || "");
  if (identity.indexOf("txn:") !== 0) return identity;
  const parts = identity.slice(4).split("|");
  const date = parts[0] || "";
  const timeParts = String(parts[1] || "").split(":");
  const hour = String(Number(timeParts[0] || 0)).padStart(2, "0");
  const minute = String(Number(timeParts[1] || 0)).padStart(2, "0");
  const second = timeParts.length > 2 ? ":" + String(Number(timeParts[2] || 0)).padStart(2, "0") : "";
  const amount = parts[2] || "";
  return date && amount ? `txn:${date}|${hour}:${minute}${second}|${amount}` : identity;
}

function paymentIdentityAliasValue(evidence) {
  assertReceiptIdentityEvidence(evidence);
  return JSON.stringify([evidence.functionVersion, evidence.kind, normalizedReceiptIdentityKey(evidence.rawValue)]);
}

module.exports = { FUNCTION_VERSION, receiptIdentityEvidence, assertReceiptIdentityEvidence, paymentIdentityAliasValue };
