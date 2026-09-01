# Stage 3B-2.8 — Safe Shadow Sampling and Retention

## Scope

Parent develop commit: `232a6fd493735bc70ab770429b95d817e526cd37`.

This stage adds deterministic sampling and bounded best-effort retention only to the existing Scanner 2.0 `RECORD_ONLY` recorder. Scanner 2.0 decision modules remain offline, and legacy TARS remains the only source of receipt, financial, duplicate, report, photo, and Rocket.Chat decisions. The application version remains `0.10.18`.

## Settings and safe defaults

- `scanner2_shadow_sample_percent`: default `0`, accepted range `0..100`. Missing, non-numeric, negative, or above-range input safely resolves to `0`.
- `scanner2_shadow_retention_days`: default `30`, accepted integer range `1..90`. Invalid input safely resolves to `30`.
- `scanner2_shadow_max_records`: default `5000`, accepted integer range `100..50000`. Invalid input safely resolves to `5000`.

`scanner2_shadow_mode` remains `OFF` by default. Even if it is later set to `RECORD_ONLY`, the default sample of `0` prevents every shadow write.

## Deterministic sampling algorithm

Sampling receives only the already HMAC-tokenized anonymous case ID. It validates the `anon-<key-version>-<hex-digest>` shape, derives a stable bucket in `0..9999` from the first 32 digest bits, and compares it with `floor(samplePercent * 100)`. It never calls `Math.random()` and never persists or needs raw message, user, room, upload, receipt, OCR, or provider identifiers.

The runtime gate order is:

1. mode is exactly `RECORD_ONLY`;
2. HMAC secret and token key version create a valid tokenizer;
3. parsed sample percent is greater than zero;
4. the raw case inputs are immediately converted into an anonymous case token;
5. the anonymous token's stable bucket is selected;
6. only a selected case may build and write a privacy-validated snapshot.

## Retention and maximum records

Shadow snapshots remain isolated under `scanner2-shadow:v1:<anonymous-case-token>`. A separate `scanner2-shadow:v1:index` record stores only anonymous case tokens and integer capture timestamps.

On a selected shadow write, bounded maintenance:

- removes records older than the parsed retention period;
- keeps the newest records within `max_records`;
- deletes at most 32 records per maintenance pass so a large cleanup converges over later sampled writes;
- has a 25 ms internal bound and remains inside the recorder's existing 50 ms write bound;
- serializes index maintenance in-process to reduce concurrent lost updates.

No production receipt index is read or changed.

## Fail-open guarantees

Sampling parsing, token validation, retention planning, index persistence, record deletion, timeouts, and cleanup exceptions are contained within the shadow path. Cleanup never throws to the caller. The existing outer recorder guard, bounded write, circuit breaker, and runtime `try/catch` remain in place. A failure cannot alter legacy acceptance/rejection, duplicate detection, confirmed transfers, calculations, reports, photos, message routing, or deletion behavior.

## Tests

- Default sample `0` produces no writes.
- A 5% sample selects exactly 500 of 10,000 stable buckets.
- Repeated evaluation of one case token is stable.
- A 100% sample captures every valid anonymous case token.
- Invalid, negative, and above-100 sample inputs safely resolve to zero.
- Expired index entries are selected and removed.
- `max_records` caps retained index state.
- Cleanup persistence failure is returned as a safe failure and leaves a representative legacy result unchanged.
- The runtime contains no Scanner 2.0 decision-engine calls.
- Privacy and dependency-boundary tests cover the new `shadow-*` module.
- Scanner 2.0 tests: 19/19 passed.
- Legacy TARS tests: 77/77 passed.
- Node syntax, workflow YAML parsing, and `git diff --check`: passed.
- Canonical `./build-tars.sh` and `unzip -t`: passed.
- ZIP contents remained exactly `app.json`, `TarsReportApp.js`, `en.json`, `ru.json`, and `icon.png`.
- Tracked source SHA-256: `c47cbed1ba3b1185b5d4cb42763e0d4cd91470ef27b94b096b26ba2a093d3f04`.
- Bundled executable SHA-256: `0fabf18eaef0a120e8ef3b9de88ba42ac82cb0ef41c8fbd222545cb3e4e3d51a`.
- `app.json` SHA-256 remained `609ccd4712ebe10c5bc533a2d5e4982b457877f07c8a14c9240a07a4c436b87e`; version remained `0.10.18`.

## Risks

- The retention index adds small write amplification to selected shadow cases. Sampling defaults to zero and the first planned rollout is only 5%, limiting exposure.
- A prolonged persistence outage can temporarily leave records beyond age/count targets. Cleanup is intentionally best-effort and converges on later sampled writes instead of risking legacy latency.
- The index can approach several hundred kilobytes near 5,000 records. Its data is bounded and contains only anonymous tokens/timestamps, but persistence latency should be monitored before increasing sampling.
- Multiple application processes cannot share the in-memory serialization queue. The index is therefore best-effort under cross-process races; this affects only cleanup completeness, never legacy behavior or financial state.

## Next step

Review this isolated feature commit and its Packaging CI result. Do not enable `RECORD_ONLY`, change the sample from zero, merge, or deploy without a separate rollout authorization.
