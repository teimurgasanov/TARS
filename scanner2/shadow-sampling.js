"use strict";

const SHADOW_SAMPLE_BUCKETS = 10000;
const DEFAULT_SHADOW_SAMPLE_PERCENT = 0;
const DEFAULT_SHADOW_RETENTION_DAYS = 30;
const DEFAULT_SHADOW_MAX_RECORDS = 5000;
const MIN_SHADOW_RETENTION_DAYS = 1;
const MAX_SHADOW_RETENTION_DAYS = 90;
const MIN_SHADOW_MAX_RECORDS = 100;
const MAX_SHADOW_MAX_RECORDS = 50000;
const DEFAULT_RETENTION_TIMEOUT_MS = 25;
const DEFAULT_MAX_DELETES_PER_RUN = 32;
const CASE_TOKEN_PATTERN = /^anon-[a-z][a-z0-9_]{0,7}-([a-f0-9]{48})$/i;

const RetentionCode = Object.freeze({
  CLEANED: "CLEANED",
  UNCHANGED: "UNCHANGED",
  UNAVAILABLE: "UNAVAILABLE",
  FAILED: "FAILED",
  TIMEOUT: "TIMEOUT"
});

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseShadowSamplePercent(value) {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 100) return DEFAULT_SHADOW_SAMPLE_PERCENT;
  return parsed;
}

function parseBoundedInteger(value, fallback, minimum, maximum) {
  const parsed = parseFiniteNumber(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function parseShadowRetentionDays(value) {
  return parseBoundedInteger(value, DEFAULT_SHADOW_RETENTION_DAYS, MIN_SHADOW_RETENTION_DAYS, MAX_SHADOW_RETENTION_DAYS);
}

function parseShadowMaxRecords(value) {
  return parseBoundedInteger(value, DEFAULT_SHADOW_MAX_RECORDS, MIN_SHADOW_MAX_RECORDS, MAX_SHADOW_MAX_RECORDS);
}

function shadowSampleBucket(caseId) {
  const match = CASE_TOKEN_PATTERN.exec(String(caseId || ""));
  if (!match) return null;
  return parseInt(match[1].slice(0, 8), 16) % SHADOW_SAMPLE_BUCKETS;
}

function shouldSampleShadowCase(caseId, samplePercent) {
  const percent = parseShadowSamplePercent(samplePercent);
  const bucket = shadowSampleBucket(caseId);
  if (bucket === null || percent <= 0) return false;
  if (percent >= 100) return true;
  return bucket < Math.floor(percent * 100);
}

function normalizeRetentionEntries(entries) {
  const earliest = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || shadowSampleBucket(entry.caseId) === null || !Number.isSafeInteger(entry.capturedAt) || entry.capturedAt < 0) continue;
    const previous = earliest.get(entry.caseId);
    if (!previous || entry.capturedAt < previous.capturedAt) {
      earliest.set(entry.caseId, Object.freeze({ caseId: entry.caseId, capturedAt: entry.capturedAt }));
    }
  }
  return Array.from(earliest.values());
}

function planShadowRetention(entries, options = {}) {
  const now = Number.isSafeInteger(options.now) && options.now >= 0 ? options.now : Date.now();
  const retentionDays = parseShadowRetentionDays(options.retentionDays);
  const maxRecords = parseShadowMaxRecords(options.maxRecords);
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const normalized = normalizeRetentionEntries(entries);
  const active = [];
  const remove = [];
  for (const entry of normalized) {
    if (entry.capturedAt < cutoff) remove.push(entry);
    else active.push(entry);
  }
  active.sort((left, right) => right.capturedAt - left.capturedAt || left.caseId.localeCompare(right.caseId));
  const keep = active.slice(0, maxRecords);
  remove.push(...active.slice(maxRecords));
  remove.sort((left, right) => left.capturedAt - right.capturedAt || left.caseId.localeCompare(right.caseId));
  return Object.freeze({
    keep: Object.freeze(keep),
    remove: Object.freeze(remove),
    cutoff,
    retentionDays,
    maxRecords
  });
}

function boundedOutcome(promise, timeoutMs) {
  let timer;
  const guarded = Promise.resolve(promise).then(
    (value) => ({ type: "success", value }),
    (error) => ({ type: "failure", error })
  );
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ type: "timeout" }), timeoutMs);
  });
  return Promise.race([guarded, timeout]).then((outcome) => {
    clearTimeout(timer);
    return outcome;
  });
}

async function safeShadowRetentionCleanup(options = {}) {
  try {
    const persistence = options.persistence;
    if (!persistence || typeof persistence.readIndex !== "function" || typeof persistence.writeIndex !== "function" || typeof persistence.removeCase !== "function") {
      return Object.freeze({ ok: false, code: RetentionCode.UNAVAILABLE, removed: 0 });
    }
    if (shadowSampleBucket(options.caseId) === null) {
      return Object.freeze({ ok: false, code: RetentionCode.FAILED, removed: 0 });
    }
    const now = Number.isSafeInteger(options.now) && options.now >= 0 ? options.now : Date.now();
    const timeoutMs = Number.isSafeInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_RETENTION_TIMEOUT_MS;
    const maxDeletes = Number.isSafeInteger(options.maxDeletesPerRun) && options.maxDeletesPerRun > 0
      ? options.maxDeletesPerRun : DEFAULT_MAX_DELETES_PER_RUN;
    const task = (async () => {
      const existing = normalizeRetentionEntries(await persistence.readIndex());
      if (!existing.some((entry) => entry.caseId === options.caseId)) {
        existing.push(Object.freeze({ caseId: options.caseId, capturedAt: now }));
      }
      const plan = planShadowRetention(existing, {
        now,
        retentionDays: options.retentionDays,
        maxRecords: options.maxRecords
      });
      const currentRemovals = plan.remove.slice(0, maxDeletes);
      for (const entry of currentRemovals) await persistence.removeCase(entry.caseId);
      const pendingRemovals = plan.remove.slice(currentRemovals.length);
      await persistence.writeIndex([...plan.keep, ...pendingRemovals]);
      return Object.freeze({
        ok: true,
        code: currentRemovals.length ? RetentionCode.CLEANED : RetentionCode.UNCHANGED,
        removed: currentRemovals.length
      });
    })();
    const outcome = await boundedOutcome(task, timeoutMs);
    if (outcome.type === "timeout") return Object.freeze({ ok: false, code: RetentionCode.TIMEOUT, removed: 0 });
    if (outcome.type === "failure") return Object.freeze({ ok: false, code: RetentionCode.FAILED, removed: 0 });
    return outcome.value;
  } catch (_error) {
    return Object.freeze({ ok: false, code: RetentionCode.FAILED, removed: 0 });
  }
}

module.exports = {
  SHADOW_SAMPLE_BUCKETS,
  DEFAULT_SHADOW_SAMPLE_PERCENT,
  DEFAULT_SHADOW_RETENTION_DAYS,
  DEFAULT_SHADOW_MAX_RECORDS,
  MIN_SHADOW_RETENTION_DAYS,
  MAX_SHADOW_RETENTION_DAYS,
  MIN_SHADOW_MAX_RECORDS,
  MAX_SHADOW_MAX_RECORDS,
  RetentionCode,
  parseShadowSamplePercent,
  parseShadowRetentionDays,
  parseShadowMaxRecords,
  shadowSampleBucket,
  shouldSampleShadowCase,
  normalizeRetentionEntries,
  planShadowRetention,
  safeShadowRetentionCleanup
};
