"use strict";

const {
  MAX_SHADOW_OBSERVATIONS,
  MAX_SHADOW_SNAPSHOT_BYTES,
  validateShadowSnapshot,
  shadowRecordState
} = require("./shadow-contract");

const RecorderCode = Object.freeze({
  RECORDED: "RECORDED",
  UNCHANGED: "UNCHANGED",
  OFF: "OFF",
  PRIVACY_REJECTED: "PRIVACY_REJECTED",
  PERSISTENCE_UNAVAILABLE: "PERSISTENCE_UNAVAILABLE",
  WRITE_FAILED: "WRITE_FAILED",
  WRITE_TIMEOUT: "WRITE_TIMEOUT",
  CIRCUIT_OPEN: "CIRCUIT_OPEN"
});

function result(recorded, code, state) {
  return Object.freeze({ recorded, code, state: state || null });
}

function createCircuitBreaker(options = {}) {
  const threshold = Number.isSafeInteger(options.failureThreshold) && options.failureThreshold > 0 ? options.failureThreshold : 3;
  const cooldownMs = Number.isSafeInteger(options.cooldownMs) && options.cooldownMs >= 0 ? options.cooldownMs : 60 * 1e3;
  const now = typeof options.now === "function" ? options.now : Date.now;
  let failures = 0;
  let openUntil = 0;
  return Object.freeze({
    canAttempt() {
      if (!openUntil) return true;
      if (now() < openUntil) return false;
      failures = 0;
      openUntil = 0;
      return true;
    },
    recordSuccess() {
      failures = 0;
      openUntil = 0;
    },
    recordFailure() {
      failures += 1;
      if (failures >= threshold) openUntil = now() + cooldownMs;
    },
    state() {
      return Object.freeze({ failures, open: Boolean(openUntil && now() < openUntil), openUntil });
    }
  });
}

function mergeShadowRecords(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;
  if (existing.caseId !== incoming.caseId) throw new TypeError("shadow record caseId mismatch");
  if (existing.state === "FINAL") return existing;
  if (incoming.state === "FINAL") return incoming;
  return incoming;
}

function isOfflineReady(record) {
  return Boolean(record && record.state === "FINAL" && record.snapshot && record.snapshot.legacyDecision !== null);
}

function boundedWrite(promise, timeoutMs) {
  let timeout;
  const guarded = Promise.resolve(promise).then(
    (value) => ({ type: "success", value }),
    (error) => ({ type: "failure", error })
  );
  const bounded = new Promise((resolve) => {
    timeout = setTimeout(() => resolve({ type: "timeout" }), timeoutMs);
  });
  return Promise.race([guarded, bounded]).then((outcome) => {
    clearTimeout(timeout);
    return outcome;
  });
}

function prepareShadowSnapshot(snapshotDraft, dependencies) {
  const options = {
    maxObservations: Number.isSafeInteger(dependencies.maxObservations) ? dependencies.maxObservations : MAX_SHADOW_OBSERVATIONS,
    maxBytes: Number.isSafeInteger(dependencies.maxSnapshotBytes) ? dependencies.maxSnapshotBytes : MAX_SHADOW_SNAPSHOT_BYTES
  };
  const original = validateShadowSnapshot(snapshotDraft, options);
  if (!dependencies.tokenizer || dependencies.tokenizer.tokenKeyVersion !== original.tokenKeyVersion || typeof dependencies.tokenizer.shiftSnapshotDates !== "function") {
    throw new TypeError("shadow tokenizer is unavailable or uses another key version");
  }
  return validateShadowSnapshot(dependencies.tokenizer.shiftSnapshotDates(original), options);
}

async function safeShadowRecord(snapshotDraft, dependencies = {}) {
  try {
    if (dependencies.enabled !== true || !dependencies.tokenizer) return result(false, RecorderCode.OFF);
    if (!dependencies.persistence || typeof dependencies.persistence.upsert !== "function") {
      return result(false, RecorderCode.PERSISTENCE_UNAVAILABLE);
    }
    const breaker = dependencies.circuitBreaker;
    if (breaker && typeof breaker.canAttempt === "function" && !breaker.canAttempt()) {
      return result(false, RecorderCode.CIRCUIT_OPEN);
    }

    let snapshot;
    try {
      snapshot = prepareShadowSnapshot(snapshotDraft, dependencies);
    } catch (_error) {
      return result(false, RecorderCode.PRIVACY_REJECTED);
    }

    const state = shadowRecordState(snapshot);
    const record = Object.freeze({ caseId: snapshot.caseId, state, snapshot });
    const timeoutMs = Number.isSafeInteger(dependencies.writeTimeoutMs) && dependencies.writeTimeoutMs > 0 ? dependencies.writeTimeoutMs : 50;
    const write = Promise.resolve().then(() => dependencies.persistence.upsert(record, mergeShadowRecords));
    const outcome = await boundedWrite(write, timeoutMs);
    if (outcome.type === "timeout") {
      if (breaker && typeof breaker.recordFailure === "function") breaker.recordFailure();
      return result(false, RecorderCode.WRITE_TIMEOUT, state);
    }
    if (outcome.type === "failure") {
      if (breaker && typeof breaker.recordFailure === "function") breaker.recordFailure();
      return result(false, RecorderCode.WRITE_FAILED, state);
    }
    if (breaker && typeof breaker.recordSuccess === "function") breaker.recordSuccess();
    const unchanged = outcome.value === "UNCHANGED";
    return result(!unchanged, unchanged ? RecorderCode.UNCHANGED : RecorderCode.RECORDED, state);
  } catch (_error) {
    return result(false, RecorderCode.WRITE_FAILED);
  }
}

module.exports = {
  RecorderCode,
  createCircuitBreaker,
  mergeShadowRecords,
  isOfflineReady,
  prepareShadowSnapshot,
  safeShadowRecord
};
