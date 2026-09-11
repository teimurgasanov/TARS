# WP-022: isolated PAS authority MVP

Base: `develop@f79b582f18069c071724d6f9a23f5012936dae2e`.
Branch: `financial-core/wp-022-pas-authority-mvp`.

This module is a local authority core, not a deployed service. It is not imported
by `TarsReportApp.js` or `tools/tars-build-entry.js`. It has no Rocket.Chat writer,
network listener, credentials, migration, scheduler, cutover, or deployment path.
The native SQLite dependency is installed in this separate private package and
is not added to TARS's root dependencies or production ZIP.

## Contract boundary

`PaymentAuthority.confirmPayment(command)` implements the existing WP-021 method
and command/result shapes. It can be passed to the existing caller seam. All
successful results must pass `assertDurableAuthorityResult`, requiring a nonempty
opaque `canonicalPaymentId`, before commit, replay, and effect dispatch. SQL also
prohibits success command records without a canonical ID. IDs are random UUIDs
created by PAS; no amount/date key or caller-created canonical identity is used.

WP-021's `contracts.js` and `caller-seam.js` are unchanged. Their permissive nullable
validator and demonstration callback gate are **not** the durable effect boundary.
Do not pass financial callbacks to that gate for this core: use the durable
outbox/consumer API below. A `CONFIRMED` response proves authority commit, not
downstream completion. `getCommandCompletion(commandId)` explicitly reports
`PENDING`, `COMPLETED`, or `NOT_APPLICABLE` from durable records.

## Data and invariants

| Record | Meaning / database constraint |
| --- | --- |
| PaymentSlot | Stable opaque `canonicalPaymentId` primary key; immutable identity; only `liveConfirmationId` can change |
| ConfirmedPayment | Separate immutable `confirmationId` primary key; canonical FK to PaymentSlot; many versions per canonical payment; immutable amount, currency, date and first command with provenance |
| IdentityAlias | Globally unique `(kind, aliasValue)` within this isolated DB; immutable canonical owner FK to PaymentSlot, independent of confirmation versions |
| CommandLog | Unique command ID; normalized full command and deterministic response; immutable |
| CommandEvidence | Successful command's observation/evidence association to the canonical payment |
| FinancialEffect | Durable PENDING/COMPLETED outbox; immutable payload and ID; unique `(canonicalPaymentId, kind, dedupeKey)`; monotonic state and attempt counter |
| CommandEffect | Links every successful command to its required effects, including an existing payment's shared financial effect |

`PaymentSlot(canonicalPaymentId, liveConfirmationId)` has a composite foreign key
to `ConfirmedPayment(canonicalPaymentId, confirmationId)`, deferred until commit.
It cannot point at another payment's version or a missing version. The reverse
canonical FK is immediate. New confirmation creates the slot and its first version
in the same transaction; no incomplete reference can commit. Liveness is determined
only by the slot pointer, not by a mutable status on immutable confirmation history.
Aliases, CommandLog, CommandEvidence and FinancialEffect reference the stable slot.

Both identity/history tables are `WITHOUT ROWID`. Update/delete triggers and
duplicate-ID insert guards prohibit identity changes, history deletion and history
rewrites, including `INSERT OR REPLACE` with recursive triggers disabled; there is
no hidden rowid through which REPLACE can bypass those guards.

The schema can append version B under the same canonical ID as historical version A
and atomically change the live pointer A -> B. A null pointer can represent an
identity with no live version without deleting history. These are schema capabilities
only: this MVP exposes no void/replace operation, never changes an existing pointer,
and fails closed on a new confirm command for a slot without a live version.
An exact old command still replays its committed result. Replacement authorization,
void records, reversal effects and downstream reconciliation require a separate task.

The reference downstream database has `Projection`, `ObservationProjection`, and
`EffectInbox`. It models local projections exclusively for the isolated MVP;
these tables are not TARS financial records.

## Transaction and resolution

1. Validate and snapshot the WP-021 command. AUTO cannot claim manual provenance.
2. Acquire SQLite `BEGIN IMMEDIATE` **before** command or alias lookup.
3. Replay a known command's stored result. Reusing an ID with different input
   returns `CONFLICT / COMMAND_ID_REUSED` and leaves the original untouched.
4. Resolve all supplied aliases inside the serialized transaction:
   - case ID and exact hash are strong evidence anchors;
   - an existing upload alias (or message alias when no upload exists) also resolves
     an observation; distinct uploads within one message are not collapsed;
   - visual hash is a conservative conflict guard, never sufficient by itself
     to resolve a known payment;
   - matching aliases owned by multiple canonical payments cause `ALIAS_CONFLICT`;
   - only a visual match causes `WEAK_ALIAS_ONLY`;
   - a new slot needs a case ID or exact hash; otherwise HOLD;
   - amount and date are authoritative values, not identity keys. Different real
     payments can have the same amount/date and must not be merged for that reason.
5. Create one PAS slot/confirmation with separate IDs and a live pointer if unresolved;
   otherwise follow the slot's live pointer and verify its amount, currency and date match. Changes to confirmed values HOLD
   with `CONFIRMED_VALUES_CONFLICT`, even for MANUAL. No history is overwritten.
6. Add previously unowned aliases; record command/evidence and required effects.
7. Commit all successful authority records and outbox work together. Storage
   failure rolls the transaction back and returns `AUTHORITY_UNAVAILABLE`.

Semantic conflicts roll back the authority savepoint. The outer transaction
records only their immutable HOLD response in CommandLog, so retries also return
the same HOLD. No payment, alias, evidence association, or effect is created by
the conflicting command. Malformed commands and unavailable-storage responses
are not committed as command outcomes; a corrected/recovered request can retry.

SQLite uses foreign keys, WAL and `synchronous=FULL`. Write contention exceeding
the bounded timeout fails closed. Files must be explicit absolute persistent
paths; `:memory:` is refused. The schema is created only in an empty file.
Application ID/version mismatches and foreign databases are refused, not migrated.
The corrected authority schema uses `user_version = 2`; version 1 files from
`2127ec0787c93e98e94a076bae34e5d208e414d7` are refused without modification.
The separate projection schema remains version 1. No migration is provided.
Initialization errors throw before an authority can be used; operational storage
errors return unavailable. Completion API storage failures throw, never return
completed.

The transaction behavior follows the [SQLite transaction specification](https://www.sqlite.org/lang_transaction.html)
and the driver's [synchronous transaction API](https://github.com/WiseLibs/better-sqlite3/blob/v11.10.0/docs/api.md).
There is no async callback or external side effect inside the authority transaction.

## Durable effect completion

Each new confirmation creates a `WRITE_CONFIRMED_PROJECTION` effect and an
`ASSOCIATE_OBSERVATION` effect. New observations share the existing financial
effect and add their own association. Exact retries create no effects. A later
command cannot hide an earlier incomplete financial effect.

`completePendingEffects(consumer)` retries durable pending rows with stable
effect IDs and payload digests. It marks an effect completed only after a matching
acknowledgement. Failure leaves that row pending; previously completed rows remain
completed. Attempt counts are persisted before delivery. If the consumer commits
and its response is lost, PAS repeats the same effect ID.

Delivery is **at least once**. Consumers must atomically record effect-ID
deduplication together with their mutation in their own durable transaction.
`IsolatedProjectionStore.applyEffect` provides the working SQLite example: its
inbox insert and projection write commit together under `BEGIN IMMEDIATE`. It
returns the prior acknowledgement on an exact retry, and rejects changed content
under the same effect ID. Parallel dispatchers are safe with such a consumer;
in-memory callback bookkeeping is insufficient. No distributed exactly-once
delivery claim is made, and an arbitrary consumer's durability cannot be inferred
from the mere presence of an acknowledgement.

## AUTO / MANUAL

Both use the identical resolution and transaction path. `payment.amount.value`
and `payment.date.value` are the authoritative inputs. The first command, including
actor, mode and field provenance, is retained in immutable history. Later command
provenance is retained in CommandLog. Original OCR values superseded by corrections
are not present in the WP-021 built command; this module does not invent or
re-extract them. Evidence references are associated with the payment, never used
to construct a competing identity from extracted amount/date values.

## Local use and validation

Use Node 20 (validated locally with 20.20.2). Installation:

```sh
npm ci
npm ci --prefix pas/authority
node tests/pas-authority-mvp.test.js
node tests/pas-contract-seam-v1.test.js
node tests/pas-ci-registration.test.js
for test_file in tests/*.test.js; do node "$test_file" || exit 1; done
npm run build
node tests/scanner2-packaging.test.js
git diff --check
```

The top-level test count is 115: PAS 3, legacy 83, Scanner 22, and 7 other registered
feature suites. Both classified CI workflows install this package only in their
PAS testing step and count all 3 PAS files. The guarded review's all-tests loop
also installs the isolated dependency. Deployment conditions and actions are
unchanged.

Tests use only synthetic commands and temporary SQLite files. The authority race
uses worker threads with separate SQLite connections, a shared barrier and an
initial write lock. It is not `Promise.all` around two synchronous confirmations.

| Required case | Test evidence |
| --- | --- |
| A | First command confirms with non-null opaque ID and two pending effects |
| B | Exact replay, reopen, concurrent same command, changed-input rejection |
| C | New observation and newly learned alias resolve the same payment; financial effect shared |
| D | Competing connections return one CONFIRMED and one ALREADY_CONFIRMED; one slot, one version, one live pointer |
| E | Cross-owner aliases HOLD; all authority/effect counts unchanged; only conflict response recorded |
| F | Lost transport response and abrupt process exit after commit; durable replay without duplicate |
| G | Partial completion, lost consumer ack, parallel dispatch, inbox write failure and retry |
| H | Corrected MANUAL inputs/provenance retained; AUTO resolves the same canonical ID |

Additional guards cover rollback after late outbox failure, unavailable/locked
storage, SQL uniqueness/immutability, null success IDs, weak/missing identity,
invalid input, wrong acknowledgements and schema refusal.

The same registered `pas-authority-mvp.test.js` also proves stable identity/version
separation, A -> B pointer switching with historical A and aliases preserved,
live-version lookup, exact old-command replay, cross-identity/missing-target rejection
at commit with rollback, orphan-version rejection, update/delete/upsert/REPLACE
immutability, canonical FK targets, and fail-closed behavior for a null live pointer.
The A -> B setup is direct synthetic SQL; it does not deliver replacement effects or
claim that a production void/replacement workflow exists. No test files were added
or renamed, so CI registration is unchanged.

## Limits and review scope

- The uniqueness proof is for **resolvable payments sharing accepted aliases**.
  WP-021 has no bank transaction ID or external verification source. Completely
  unlinked representations of one real-world payment cannot be recognized by this
  MVP; this is not a proof of global real-world deduplication. Case/exact/upload
  alias quality must be established before any future production authority work.
- One local database represents one authority namespace. There is no tenant or
  bank namespace, authenticated service, authorization layer or public endpoint.
- No operational reversals, replacements, refunds, voids, historic migration, or cutover.
  Confirmed values cannot be corrected in place; conflicting commands HOLD.
- Outbox draining is explicit and synchronous per consumer call, with no background
  scheduler, paging, leases, network delivery, or production recovery operation.
  Safe duplicate delivery depends on the documented consumer inbox contract.
- Native SQLite installation may download a prebuilt binary or require a compiler.
  SQLite/filesystem durability is tested locally, not against production hardware
  failure, backups, multiple hosts or network filesystems.
- Original WP-021 seam null-ID/callback permissiveness remains isolated and must
  not be mistaken for the stricter durable authority boundary.
- No Sergey contribution was supplied or incorporated in this candidate.
  `COAUTHORSHIP_ELIGIBLE = NO`; no coauthor trailer is warranted.
- No new project-memory rule was derived from this package.
