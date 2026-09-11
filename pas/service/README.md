# WP-023: local separate-process PAS service

Baseline: `develop@4abc18c65af70d8d0ef677390ed42aaf992cae7b`.
This is an isolated, non-production service MVP under FINAL FREEZE v1.0 and
WP-019 preflight. It does not wire any live TARS writer, change receipt recognition,
migrate authority data, cut over, or deploy. The production bundle retains its
existing WP-021 pure contracts/seam; it contains none of this service, transport,
authority core, or native SQLite. The HTTP client imports only built-ins and pure
validators. PAS alone opens the authority SQLite file.

## Startup and trust

Use **Node 20** and the existing lock files:

```sh
npm ci
npm ci --prefix pas/authority
```

The entrypoint is `node pas/service/entrypoint.js`. Configuration is injected via
the child process environment; no credential is checked in or accepted in a URL:

| Variable | Meaning |
| --- | --- |
| `PAS_LOCAL_ONLY` | Must be `1`; explicit local/test opt-in |
| `PAS_DB_PATH` | Required absolute persistent SQLite path |
| `PAS_DB_MODE` | `existing` by default; `test-init` for a new isolated fixture only |
| `PAS_PORT` | Optional local port, default `0` (OS-assigned) |
| `PAS_PRINCIPALS_JSON` | Required array of `{id, token, roles}` injected by the launcher |

Each token is 32–256 base64url-alphabet characters. Roles are `command` and
`consumer`. At least one command principal and exactly one logical consumer
principal are required. A single principal may have both roles only if explicitly
configured. Tokens and principal IDs must be unique. There is no anonymous or
legacy fallback. Credential hashes are compared with `timingSafeEqual`.
The process binds **127.0.0.1 only**, and the client accepts only that loopback
HTTP destination with no URL credentials/query/fragment. Test code generates
synthetic credentials and injects them into child environments. Production secret
storage, TLS, proxies, topology, key rotation, and remote deployment are undefined.

Normal startup uses SQLite `fileMustExist`, refuses an empty/missing/foreign DB,
requires application ID `0x50415331` and schema version `2`, and checks the exact
tables/indexes/triggers against the existing schema, `quick_check`, and foreign
keys. Startup also acquires a bounded write lock. Schema inspection uses a temporary
in-memory schema reference, never an alternative authority. No migration occurs.
`test-init` exclusively creates a new file (`wx`, mode 0600); any existing path is
refused. If initialization fails, inspect/discard that test fixture explicitly;
normal startup will never adopt an empty file. Parent directories are not created.
The WP-022 standalone test constructors retain their original bootstrap behavior;
the service always reopens with `existingOnly: true` before listening.

## HTTP contract

`POST /v1/operation`, `Content-Type: application/json`,
`Authorization: Bearer <injected token>`:

```json
{
  "protocol": "PAS_HTTP_V1",
  "requestId": "unique-network-attempt",
  "operation": "GetCommandCompletion",
  "payload": { "commandId": "original-business-intention" }
}
```

Success envelope: `{protocol, requestId, operation, data}`. Error envelope:
`{protocol, requestId, operation, error: {code}}`; IDs can be null when envelope
validation failed. Limits: 64 KiB request body, 8 KiB headers, 2-second body deadline,
and no content encoding. Invalid UTF-8, malformed JSON, unknown fields, invalid
dates/amounts, protocol versions and command versions fail closed before mutation.

| Operation | Role | Payload / result |
| --- | --- | --- |
| `ConfirmPayment` | command | Unchanged `PAS_CONFIRM_PAYMENT_V1` command / typed authority result |
| `GetCommandCompletion` | command | `{commandId}` / existing `{result,effects,completion}` or `null` |
| `ReadFinancialEffects` | consumer | `{after,limit,includeCompleted}` / `{effects,nextCursor}` |
| `AcknowledgeFinancialEffect` | consumer | `{effectId,payloadDigest}` / `COMPLETED`, `UNKNOWN_EFFECT`, or `EFFECT_DIGEST_MISMATCH` |

All other operation names return `UNSUPPORTED_OPERATION` without mutation,
including AssociateObservation, ResolvePayment, GetPayment,
CorrectPendingObservation and VoidAndReplacePayment. Observation association
internal to ConfirmPayment and its existing effect remain unchanged.

AUTO and MANUAL call the same authority method with the original amount, date,
evidence, actor and provenance. Transport performs no OCR, normalization, alias
invention or canonical resolution. No live Rocket.Chat callbacks are called.

**HTTP 200 is not financial confirmation.** `PasClient` returns
`{outcome: "KNOWN", data}` only after validating the response envelope and domain
data. The caller must inspect `data.status`; CONFLICT/REJECTED are not success.
CONFIRMED/ALREADY_CONFIRMED require a nonempty canonicalPaymentId.
Transport failure, timeout, malformed/unknown responses return
`{outcome: "UNKNOWN", commandId, errorCode}`. No fallback writes occur. A missing
command completion (`data: null`) also does not prove rejection or confirmation.

Create/persist commandId and its command **before the first send**. On an uncertain
result, read completion or resend the same command with the **original commandId**.
requestId identifies one attempt and can change on every retry. The durable
CommandLog controls replay/conflict; there is no memory/TTL/network duplicate cache.
The client does not provide a durable outbound queue; persistence of intentions is
the future caller's responsibility. Its methods never create command IDs.

## Effects and synthetic durable consumer

No new claim state machine or schema is introduced. Existing immutable effectId,
payload/digest and PENDING/COMPLETED are exposed. Retrieval is read-only and does
not increment dispatch attempts or complete an effect. `attempts` retains its
WP-022 in-process dispatch meaning; it is not an HTTP delivery count.
Acknowledgement only changes the matching existing effect's completion state;
it does not confirm/void/replace a payment or alter financial values or identity.
Exact repeated acknowledgements succeed. Wrong digests and unknown effects fail.

Delivery is **at least once** to one logical consumer. The authenticated ack is
that consumer's attestation that it atomically committed its inbox/deduplication
record **and** projection mutation. The service cannot independently inspect a
remote commit. The isolated `IsolatedProjectionStore` supplies the tested durable
transaction, and is not evidence about Rocket.Chat persistence atomicity.

Page size is 1–100, default 50 in the client. `after` is a nonnegative SQLite outbox
row position; stable because this authority does not delete/replace effect rows.
Scan in ascending cursor order, preserving effect dependencies. An empty page
returns the input cursor. Restart each pending delivery sweep at cursor **0** so
unacknowledged earlier effects are retried; a cursor is never a durable ack.
For a fresh projection, scan from 0 with `includeCompleted: true`, apply every effect
transactionally with the inbox, and do not reset authority completion. This also
reconstructs payment projections needed by subsequent observation effects.
Multiple consumers/namespaces and exactly-once network delivery are unsupported.

## Lifecycle

`GET /livez` reports the process is alive only. `GET /readyz` reports whether startup
opened a compatible DB with valid configuration and an available service contract.
Both probes are anonymous and contain no financial data. They are never cutover
or NO_LEGACY_CAPABLE_RUNTIME evidence. After an observed storage/contract failure,
readiness latches false and operations return 503; restart revalidates the DB.
This MVP has no background integrity/availability monitor or automatic recovery loop.

SIGTERM/SIGINT first stop readiness and admission. Fully accepted authority work is
synchronous with a 500 ms DB lock timeout and completes before signal handling can
run. The listener then closes, unfinished sockets get up to 2 seconds to drain,
remaining sockets close, and the DB closes. Requests still uploading at shutdown
are not accepted commands. Fixed READY/STOPPED/STARTUP_FAILED logs omit request
content, identifiers, credentials and exception details. Abnormal termination may
lose a response; the WAL/CommandLog/effects recover from the same DB on restart.

## Verification and limits

`node tests/pas-service-transport.test.js` starts real child service processes and
loopback fault proxies. The consumer helper stops inside the actual inbox/projection
transaction or immediately after its commit; the parent SIGKILLs it at that barrier.
The accepted-command helper exposes a test-only barrier before the real authority
transaction for the graceful-shutdown test. Production code has no fault switches.
Only temporary synthetic SQLite files and test credentials are used.

```sh
node tests/pas-service-transport.test.js
for test_file in tests/*.test.js; do node "$test_file" || exit 1; done
npm run build
git diff --check
```

CI adds one discovered `pas-*.test.js`: PAS file count 3 → 4, total 115 → 116.
Only the PAS count assertion in each classified workflow and its registration test
changes. Legacy count stays 83; guarded review already discovers all tests. No
workflow permissions, artifact provenance or deployment authorization changes.

Existing WP-022 limitations remain: uniqueness requires resolvable existing aliases;
this is not proof of global real-world payment identity. No production durability,
backup/restore, filesystem-failure, performance or operational readiness claim.
Real caller intention persistence, TARS consumer integration and manual field-editing
UX remain future work. No Sergey-attributed technical contribution was supplied;
no coauthor trailer is added. Commit/push/PR/merge/deploy remain outside this WO.
