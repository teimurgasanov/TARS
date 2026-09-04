#!/usr/bin/env node
"use strict";

const fs = require("fs");

const SAFE_KEYS = new Set([
  "attempt",
  "authority",
  "classification",
  "confidence",
  "error_code",
  "kind",
  "outcome",
  "parser",
  "provider",
  "reason_code",
  "source",
  "stage",
  "status",
  "status_code",
  "transport",
]);

const EVENT_RULES = [
  [/\bRECEIPT_STAGE\b/i, "receipt_stage"],
  [/\bRECEIPT_REPLAY\b/i, "receipt_replay"],
  [/\bRECEIPT_(?:VISION|FIELD|AMOUNT|DATE)\b/i, "receipt_extraction"],
  [/\bYANDEX\s+AI\s+STUDIO\b/i, "yandex_ai_studio"],
  [/\bYANDEX\s+OCR\b/i, "yandex_ocr"],
  [/\bOPENAI\b/i, "openai"],
  [/\bFAST_PHOTO_FORWARD\b/i, "work_photo_forward"],
  [/\bAUTO_MAILING\b/i, "mailing"],
  [/\bCLAIM_PROBE\b/i, "message_claim"],
  [/\bARCHIVE_PROBE\b/i, "receipt_archive"],
  [/\binitialize\b/i, "app_initialize"],
  [/\bonEnable\b/i, "app_enable"],
  [/\bsetStatus\b/i, "app_status"],
];

const FAILURE_RULES = [
  [/\b429\b|rate[ _-]?limit/i, "provider_rate_limited"],
  [/\b401\b|unauth(?:orized|enticated)/i, "provider_unauthorized"],
  [/\b403\b|forbidden/i, "provider_forbidden"],
  [/\b5\d\d\b|server[ _-]?error/i, "provider_5xx"],
  [/time(?:d)?[ _-]?out|etimedout/i, "provider_timeout"],
  [/invalid[ _-]?json|no[ _-]?json/i, "invalid_json"],
  [/schema[ _-]?mismatch|invalid[ _-]?schema/i, "schema_mismatch"],
  [/amount[ _-]?(?:conflict|disagreement)/i, "amount_conflict"],
  [/date[ _-]?(?:conflict|disagreement)/i, "date_conflict"],
  [/persist(?:ence)?[ _-]?(?:fail|error)/i, "persistence_failure"],
  [/network|econn|dns|socket/i, "network_failure"],
  [/duplicate/i, "duplicate_detected"],
];

function scalarStrings(value, depth = 0, output = []) {
  if (depth > 6 || output.length >= 4000 || value == null) return output;
  if (typeof value === "string") output.push(value);
  else if (typeof value === "number" || typeof value === "boolean") output.push(String(value));
  else if (Array.isArray(value)) value.forEach((item) => scalarStrings(item, depth + 1, output));
  else if (typeof value === "object") Object.values(value).forEach((item) => scalarStrings(item, depth + 1, output));
  return output;
}

function safeEnum(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  if (!normalized || /(?:token|secret|password|authorization|api[_-]?key)/i.test(normalized)) return "unknown";
  if (/\d{7,}/.test(normalized)) return "redacted";
  return normalized;
}

function safeAttributeValue(key, value) {
  const normalized = safeEnum(value);
  if (normalized === "unknown" || normalized === "redacted") return normalized;
  if (key === "attempt") return /^[1-9]\d?$/.test(normalized) ? normalized : "redacted";
  if (key === "confidence") return /^(?:high|medium|low|0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/.test(normalized) ? normalized : "redacted";
  if (key === "status_code") return /^[1-5]\d\d$/.test(normalized) ? normalized : "redacted";
  if (key === "provider") {
    return /^(?:yandex_ai_studio|yandex_ocr|openai|legacy|cache|unknown)$/.test(normalized) ? normalized : "redacted";
  }
  if (key === "source" || key === "authority") {
    return /^(?:yandex_ai_studio|yandex_ocr|openai|legacy|receipt_vision|targeted_amount|targeted_date|primary|secondary|cache|control|unknown)$/.test(normalized)
      ? normalized
      : "redacted";
  }
  return /^[a-z][a-z0-9_-]{0,47}$/.test(normalized) ? normalized : "redacted";
}

function safeMethod(value) {
  const method = String(value || "").slice(0, 96);
  if (!/^(?:app:)?[A-Za-z][A-Za-z0-9:_-]{0,80}$/.test(method)) return "unknown";
  return method.toLowerCase();
}

function hourBucket(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toISOString().slice(0, 13) + ":00Z";
}

function eventCode(text, method) {
  for (const [pattern, code] of EVENT_RULES) if (pattern.test(text)) return code;
  const normalizedMethod = safeMethod(method);
  return normalizedMethod === "unknown" ? "unclassified_event" : normalizedMethod.replace(/[:]/g, "_");
}

function failureCode(text, severity) {
  for (const [pattern, code] of FAILURE_RULES) if (pattern.test(text)) return code;
  return severity === "error" ? "unclassified_error" : severity === "warn" ? "unclassified_warning" : "none";
}

function safeAttributes(text) {
  const attributes = {};
  const pairPattern = /\b([a-z][a-z0-9_-]{1,32})=([^\s,;]+)/gi;
  for (const match of text.matchAll(pairPattern)) {
    const key = match[1].toLowerCase();
    if (!SAFE_KEYS.has(key)) continue;
    attributes[key] = safeAttributeValue(key, match[2]);
  }
  const http = text.match(/\bHTTP(?:\s+|=)([1-5]\d\d)\b/i);
  if (http) attributes.status_code = http[1];
  return attributes;
}

function normalizeSeverity(value) {
  const severity = String(value || "").toLowerCase();
  return ["debug", "info", "log", "warn", "warning", "error"].includes(severity)
    ? severity === "warning" ? "warn" : severity
    : "unknown";
}

function recordTimestamp(record) {
  if (record && record.timestamp) return record.timestamp;
  if (record && record.startTime) return record.startTime;
  if (record && record._createdAt) return record._createdAt;
  const entries = record && Array.isArray(record.entries) ? record.entries : [];
  return entries.length ? entries[0].timestamp : null;
}

function sanitizeRecord(record) {
  const entries = record && Array.isArray(record.entries) ? record.entries : [];
  const strings = scalarStrings(entries.length ? entries : record);
  const joined = strings.join(" ").slice(0, 24000);
  const severity = normalizeSeverity(
    entries.reduce((current, entry) => {
      const next = normalizeSeverity(entry && entry.severity);
      const rank = { unknown: 0, debug: 1, log: 2, info: 2, warn: 3, error: 4 };
      return rank[next] > rank[current] ? next : current;
    }, "unknown"),
  );
  const method = safeMethod(record && record.method || entries[0] && entries[0].method);
  return {
    hour: hourBucket(recordTimestamp(record)),
    severity,
    method,
    event_code: eventCode(joined, method),
    failure_code: failureCode(joined, severity),
    attributes: safeAttributes(joined),
  };
}

function extractRecords(input) {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];
  for (const key of ["logs", "data", "items", "result"]) {
    if (Array.isArray(input[key])) return input[key];
    if (input[key] && Array.isArray(input[key].logs)) return input[key].logs;
  }
  return [];
}

function sanitize(input, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const lookbackMinutes = Math.max(1, Math.min(1440, Number(options.lookbackMinutes) || 60));
  const cutoff = now - lookbackMinutes * 60 * 1000;
  const records = extractRecords(input)
    .filter((record) => {
      const timestamp = new Date(recordTimestamp(record)).getTime();
      return !Number.isFinite(timestamp) || timestamp >= cutoff;
    })
    .slice(0, 500)
    .map(sanitizeRecord);
  const counts = { total: records.length, debug: 0, info: 0, log: 0, warn: 0, error: 0, unknown: 0 };
  const failureCounts = {};
  for (const record of records) {
    counts[record.severity] = (counts[record.severity] || 0) + 1;
    if (record.failure_code !== "none") failureCounts[record.failure_code] = (failureCounts[record.failure_code] || 0) + 1;
  }
  return {
    schema_version: "tars-redacted-diagnostics-v1",
    lookback_minutes: lookbackMinutes,
    generated_at_hour: new Date(now).toISOString().slice(0, 13) + ":00Z",
    counts,
    failure_counts: failureCounts,
    events: records.filter((record) => record.severity === "warn" || record.severity === "error").slice(0, 150),
  };
}

function assertPrivacySafe(value) {
  const text = JSON.stringify(value);
  const forbidden = [
    /https?:\/\//i,
    /data:image/i,
    /(?:sk|api)[_-][a-z0-9_-]{12,}/i,
    /authorization/i,
    /password/i,
    /base64/i,
    /\b[A-Za-z0-9+/]{160,}={0,2}\b/,
    /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
    /\b\d{10,}\b/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(text)) throw new Error(`privacy assertion failed: ${pattern}`);
  }
  return true;
}

function selfTest() {
  const fixture = {
    logs: [{
      _id: "private-log-id-1234567890",
      appId: "private-app-id-1234567890",
      method: "app:executePostMessageSent",
      timestamp: "2026-09-04T18:12:00.000Z",
      entries: [{
        severity: "error",
        args: [
          "RECEIPT_STAGE case=secret-case upload=private-upload filename=receipt.jpg stage=provider outcome=failed provider=yandex_ai_studio HTTP 429",
          { raw_ocr_text: "Customer +7 999 123-45-67 amount 1900", api_key: "sk-secret-secret-secret", url: "https://chat.invalid/file" },
        ],
      }],
    }],
  };
  const result = sanitize(fixture, { now: Date.parse("2026-09-04T18:30:00.000Z"), lookbackMinutes: 60 });
  if (result.events.length !== 1) throw new Error("expected one sanitized event");
  if (result.events[0].failure_code !== "provider_rate_limited") throw new Error("expected rate-limit classification");
  if (result.events[0].attributes.stage !== "provider") throw new Error("expected safe stage attribute");
  assertPrivacySafe(result);
  process.stdout.write("PASS: Rocket.Chat app logs are reduced to privacy-safe diagnostic codes\n");
}

function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const inputPath = argv[0];
  const outputPath = argv[1];
  const lookbackIndex = argv.indexOf("--lookback-minutes");
  const lookbackMinutes = lookbackIndex >= 0 ? Number(argv[lookbackIndex + 1]) : 60;
  if (!inputPath || !outputPath) throw new Error("usage: sanitize-rocketchat-app-logs.js INPUT OUTPUT [--lookback-minutes N]");
  const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const output = sanitize(input, { lookbackMinutes });
  assertPrivacySafe(output);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(JSON.stringify({ counts: output.counts, failure_counts: output.failure_counts }) + "\n");
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`sanitizer failed: ${error && error.message || "unknown"}\n`);
    process.exit(1);
  }
}

module.exports = { assertPrivacySafe, sanitize, sanitizeRecord };
