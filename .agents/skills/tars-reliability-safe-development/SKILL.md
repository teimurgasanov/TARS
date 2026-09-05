---
name: tars-reliability-safe-development
description: Safely analyze, modify, review, test, integrate, or deploy the TARS Rocket.Chat application while preserving production behavior, receipt safeguards, privacy, and explicit authorization boundaries. Use only for work in the TARS repository or its Rocket.Chat runtime.
metadata:
  short-description: Safe TARS development and reliability workflow
---

# TARS Reliability & Safe Development

Work conservatively in the TARS repository. Prefer small, isolated, reversible changes with evidence that unrelated production behavior is unchanged.

Read the repository `AGENTS.md` before acting. The user’s current instructions override this skill when they are more specific.

## Authorization boundaries

Treat these as separate authorization stages:

1. Read-only analysis
2. Code changes
3. Commit
4. Push
5. Pull request
6. Merge
7. Runtime installation or deploy
8. Production settings changes

Authorization for one stage does not authorize later stages.

Never merge, deploy, change production settings, enable feature flags, bump the version, or publish runtime messages unless the user explicitly authorizes that exact action.

A request to “finish everything” permits completion only inside the already authorized scope. It does not implicitly authorize merge or deploy.

Never deploy automatically.

## Establish the exact state

Before changing anything, confirm:

- repository root;
- current branch;
- current HEAD;
- relevant base and remote HEAD;
- TARS version;
- working-tree status;
- unrelated tracked and untracked changes;
- the exact user-authorized scope.

Fetch remote refs when current remote state matters.

Do not discard, overwrite, clean, stash, or stage unrelated user work. Preserve existing `docs/codex-reports` files unless the user explicitly includes them.

Do not use destructive Git commands such as `reset --hard`. Do not merge or rebase unless explicitly requested. When synchronization must be fast-forward-only, enforce that condition and stop if it cannot be satisfied.

When creating a branch, use the exact base and branch name requested by the user. If no exact base is supplied, verify the intended base before branching.

## Change isolation rule

One problem = one branch = one PR.

Do not combine independent production fixes, features, reliability changes, or CI fixes in the same branch or PR unless the user explicitly authorizes combining them.

If the current branch already contains unrelated commits, do not open a PR from it. Create a clean branch from the authorized base and transfer only the authorized change.

## Analyze before editing

Inspect only files and functions relevant to the request. Do not scan or refactor the whole repository without a demonstrated need.

Before a production-code change, identify:

- affected files;
- affected functions and call sites;
- current decision path;
- intended insertion or replacement point;
- preserved fallbacks;
- possible effects on receipts, duplicate detection, OCR, reports, photos, calculations, payroll, and Rocket.Chat;
- required targeted and regression tests.

For a read-only audit or review, do not edit files.

## Patch discipline

Prefer the smallest targeted patch that satisfies the request.

Do not change unrelated:

- receipt classification or routing;
- work-photo or personal-image routing;
- mailing routing;
- duplicate or receipt-identity safeguards;
- OCR prompts, provider selection, retry counts, timeouts, cache, or queue behavior;
- reports, running totals, payroll, or calculations;
- Rocket.Chat publishers, messages, settings, or scheduler behavior.

If an existing general helper would broaden behavior outside the requested domain, introduce or use a domain-specific selector instead of changing all callers.

Do not mix product changes with CI-only infrastructure changes unless the user explicitly authorizes both.

Use `apply_patch` for manual source edits.

## Bug regression rule

For every confirmed production bug, when technically possible:

- reproduce the failure;
- add a regression test that fails before the fix;
- apply the minimal fix;
- prove the regression test passes afterward;
- retain that test permanently unless the underlying feature is intentionally removed.

A production bug should normally make the permanent regression suite stronger.

## Reliability and telemetry invariants

Reliability telemetry observes production behavior; it must not decide production behavior.

Telemetry must be fail-open:

- telemetry failures never alter a return value, exception, routing decision, provider result, or persistence result;
- emission performs no HTTP request;
- emission performs no persistence write;
- emission does not add a required `await`;
- emission is never used in an `if`, retry, or routing decision;
- optional telemetry context must preserve existing behavior when absent.

Use strict field allowlists. Never log or persist:

- raw message, upload, room, or sender IDs;
- filenames or URLs;
- image bytes or base64;
- raw OCR text;
- raw provider responses;
- receipt identity or exact/visual hashes;
- API keys, authorization headers, tokens, or secrets;
- personal or financial data.

Correlation identifiers must be one-way tokens, stable only as required for the intended trace. Failure to create or tokenize an identifier must be fail-open.

Bound event size. Oversized or invalid telemetry must be safely dropped or reduced without affecting production.

When adding tracing, prove structural parity where relevant:

- provider call counts and order;
- publisher call counts and order;
- persistence calls;
- retry counts;
- timeout values;
- existing `await` boundaries;
- return and throw structure.

## Shadow-mode invariants

A shadow feature must:

- default to disabled;
- run only after the production result is determined;
- never return its result into production routing;
- never accept or reject a receipt;
- never change reports, calculations, duplicate state, or user-visible messages;
- fail open on queue, provider, parser, cache, or persistence errors;
- have lower priority than production work;
- never make production wait for shadow work;
- store only privacy-safe observations.

Provider results must remain independently observable. Do not silently replace one provider’s error with another provider’s result in quality statistics.

Add a parity test proving identical production outcomes with shadow disabled and enabled.

## Receipt invariants

Unless explicitly included in the task, preserve:

- strict date validation;
- operation-status validation;
- exact, visual, and identity duplicate protection;
- receipt identity construction;
- accepted, rejected, and control behavior;
- archive and ledger writes;
- reports, totals, and payroll;
- receipt-control publishing;
- work-photo and mailing behavior.

Do not allow an unconfirmed candidate, first OCR number, commission, balance, card digits, phone number, date, time, or operation ID to become an accepted amount.

Provider or extraction changes intended for receipts must remain receipt-specific and must not affect work-photo or general personal-image paths.

## Safe replay invariants

Diagnostic replay must be explicitly requested and read-only.

Replay must:

- require owner/admin authorization before reading an upload;
- use a proven canonical original, never a preview or thumbnail;
- reuse production extraction functions instead of copying their logic;
- have no writable persistence, modifier, publisher, notifier, upload creator, scheduler, report, totals, payroll, duplicate, or identity capability;
- use production Vision admission at lower priority;
- process at most the authorized cases;
- return only privacy-safe normalized diagnostics;
- separate replay outcome from strict production outcome.

If the canonical original cannot be proven, stop with a clear blocked result.

## Testing

Run tests proportional to the change and any explicit user checklist.

For relevant product changes, consider:

- syntax checking;
- targeted feature tests;
- receipt date and amount tests;
- Receipt Vision and provider tests;
- OCR tests;
- duplicate and receipt-identity tests;
- work-photo and personal-image routing tests;
- mailing tests;
- reports, running totals, and payroll tests;
- claim race and persistence tests;
- Scanner 2.0 suite;
- complete legacy suite;
- packaging, build, and bundle-policy checks;
- `git diff --check`.

Do not claim PASS when a requested test was skipped, unavailable, or run against a different HEAD. Report it as blocked or unverified.

If a test fails, stop before unrelated automatic fixes. Diagnose the failure and keep changes inside the authorized scope.

If a source-integrity SHA changes only because of an authorized source edit, compute the actual current SHA and update only the corresponding expected value after verifying the source diff.

## Diff and staging review

Before commit, inspect:

- `git status`;
- diff against the exact base;
- diff stat;
- changed-file list;
- staged diff;
- unrelated and untracked files.

Stage files explicitly. Never use broad staging when unrelated files exist.

Confirm that the patch contains only the requested behavior and necessary tests or integrity updates.

## Commit, push, and PR

Commit only after explicit permission. Use the exact requested commit message when provided.

Push only the authorized branch. Never push `develop`, `main`, or a production branch unless explicitly authorized.

Create a PR only after explicit permission.

Before creating a PR:

- verify head and base;
- inspect the complete PR diff;
- confirm no accumulated unrelated commits;
- check for conflicts;
- rerun required tests.

Creating a PR does not authorize merge.

## Guarded Review

Review the exact requested HEAD against the exact requested base.

Confirm that CI belongs to:

- that exact head SHA; or
- a PR merge ref whose `headSha` is the requested HEAD.

A Guarded Review result must be one of:

- `PASS`
- `BLOCKED`
- `FAILED`

Use `BLOCKED` for incomplete evidence or infrastructure failure. Do not treat an infrastructure failure as a code failure.

A PASS requires:

- isolated diff;
- successful required tests;
- preserved production routing and safeguards;
- privacy compliance;
- fail-open behavior;
- no unapproved production changes.

Do not change code during a review unless separately authorized.

## Merge and post-merge validation

Merge only the explicitly authorized PR into the explicitly named base.

Before merging, verify:

- PR number;
- expected head SHA;
- base branch;
- CI and review status.

After merge:

- report the merge commit;
- fetch remote refs;
- confirm the new base HEAD;
- wait for post-merge validation when requested;
- report Scanner, legacy, and overall conclusions.

Do not deploy after merge without separate permission.

## Runtime installation and deploy

Install or deploy only the exact authorized product SHA.

Do not accidentally deploy:

- a CI-only commit as product code;
- local or untracked changes;
- another feature branch;
- an unreviewed artifact.

Before deploy, verify artifact provenance and source SHA.

After deploy, check only the authorized scope:

- deployment result;
- installed SHA and version;
- application enabled status;
- Rocket.Chat/API availability;
- initialization and startup logs;
- new runtime errors;
- requested smoke paths.

Do not change settings or feature flags unless explicitly authorized.

Sending a message, upload, or command into Rocket.Chat is a production-side action. Obtain explicit authorization for the exact smoke event and avoid real financial documents when a synthetic or read-only check is sufficient.

If authentication is required, ask the user to sign in. Never bypass authentication or retrieve credentials from browser/session storage.

## Reporting

Lead with the outcome and evidence.

Clearly distinguish:

- verified facts;
- inference;
- skipped or blocked checks;
- product commits;
- CI-only commits;
- installed SHA;
- merged SHA;
- deployed SHA.

Never expose secrets, raw production identifiers, receipt contents, or personal information.

When the user specifies an exact final format, follow it and stop after the requested result.
