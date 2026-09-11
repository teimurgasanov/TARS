"use strict";

// Only authenticated GitHub run/artifact metadata supplies review authority.
// A caller-supplied manifest or a green run without matching evidence is insufficient.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SCHEMA, unzip, git, packageMembers } = require("./tars-canonical-manifest");

function assertRun(run, workflow, repository, runId) {
  assert.match(String(runId), /^[1-9][0-9]*$/, "review_run_id is required");
  assert.strictEqual(String(run.id), String(runId), "wrong review run");
  assert.strictEqual(run.repository.full_name, repository, "wrong review repository");
  assert.strictEqual(run.workflow_id, workflow.id, "wrong review workflow");
  assert.strictEqual(workflow.path, ".github/workflows/tars-guarded-review-build.yml");
  assert.strictEqual(run.event, "pull_request", "only PR review runs are eligible");
  assert.strictEqual(run.status, "completed", "review is incomplete");
  assert.strictEqual(run.conclusion, "success", "review did not succeed");
  assert.ok(Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
}

function assertEvidence(reviewed, local, run, pr, reviewedCommit) {
  assert.strictEqual(reviewed.schema, SCHEMA, "missing or unsupported provenance schema");
  assert.strictEqual(reviewed.tree, local.tree, "reviewed tree differs from deploy tree");
  assert.deepStrictEqual(reviewed.toolchain, { node_major: 20, esbuild: "0.12.29" }, "canonical toolchain differs");
  const evidence = reviewed.review;
  assert.ok(evidence, "review provenance missing");
  assert.strictEqual(evidence.repository, run.repository.full_name);
  assert.strictEqual(evidence.run_id, String(run.id), "wrong provenance run");
  assert.strictEqual(evidence.run_attempt, String(run.run_attempt), "stale provenance attempt");
  assert.strictEqual(evidence.head_sha, run.head_sha, "run is for another PR head");
  assert.strictEqual(pr.number, evidence.pr_number);
  assert.strictEqual(pr.base.repo.full_name, evidence.repository);
  assert.strictEqual(pr.base.ref, "develop");
  assert.strictEqual(pr.head.sha, evidence.head_sha, "PR head changed after review");
  assert.strictEqual(pr.merged, true, "PR is not merged");
  assert.strictEqual(pr.merge_commit_sha, local.commit, "target is not this PR's resulting commit");
  assert.match(reviewed.commit, /^[0-9a-f]{40}$/);
  assert.strictEqual(reviewedCommit.sha, reviewed.commit, "wrong reviewed Git commit");
  assert.strictEqual(reviewedCommit.tree.sha, reviewed.tree, "wrong reviewed Git tree");
  assert.deepStrictEqual(reviewedCommit.parents.map((parent) => parent.sha), [evidence.base_sha, evidence.head_sha],
    "reviewed commit is not the attested PR merge candidate");
}

async function verifyReviewedProvenance({ github, context, runId }) {
  assert.match(String(runId || ""), /^[1-9][0-9]*$/, "review_run_id is required");
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  const params = { ...context.repo, run_id: Number(runId) };
  assert.ok(Number.isSafeInteger(params.run_id), "invalid run ID");
  const workflow = (await github.rest.actions.getWorkflow({ ...context.repo,
    workflow_id: "tars-guarded-review-build.yml" })).data;
  const run = (await github.rest.actions.getWorkflowRun(params)).data;
  assertRun(run, workflow, repository, runId);
  const name = `reviewed-tars-${run.id}-${run.run_attempt}`;
  const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, params);
  const matches = artifacts.filter((artifact) => artifact.name === name);
  assert.strictEqual(matches.length, 1, "exact review attempt artifact missing or ambiguous");
  const artifact = matches[0];
  assert.strictEqual(artifact.expired, false, "review artifact expired");
  assert.strictEqual(artifact.workflow_run.id, run.id, "artifact belongs to another run");
  assert.strictEqual(artifact.workflow_run.head_sha, run.head_sha, "artifact has another head");
  const archive = await github.rest.actions.downloadArtifact({ ...context.repo,
    artifact_id: artifact.id, archive_format: "zip" });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tars-review-evidence-"));
  try {
    const archivePath = path.join(temp, "artifact.zip");
    fs.writeFileSync(archivePath, Buffer.from(archive.data));
    const version = JSON.parse(fs.readFileSync("app.json", "utf8")).version;
    assert.match(version, /^[0-9]+\.[0-9]+\.[0-9]+$/, "invalid package version");
    const zipName = `tars-report_${version}.zip`;
    assert.deepStrictEqual(unzip("-Z1", archivePath).toString().trim().split("\n").sort(),
      ["reviewed-provenance.json", zipName].sort(), "unexpected reviewed artifact members");
    const reviewed = JSON.parse(unzip("-p", archivePath, "reviewed-provenance.json").toString());
    assert.ok(reviewed.review && Number.isSafeInteger(reviewed.review.pr_number) && reviewed.review.pr_number > 0);
    assert.match(reviewed.commit || "", /^[0-9a-f]{40}$/);
    const reviewedZip = path.join(temp, zipName);
    fs.writeFileSync(reviewedZip, unzip("-p", archivePath, zipName));
    const local = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
    // Re-verify the downloaded package itself; the JSON cannot vouch for a raw ZIP.
    assert.deepStrictEqual(packageMembers(reviewedZip), reviewed.members, "artifact does not match its manifest");
    const pr = (await github.rest.pulls.get({ ...context.repo, pull_number: reviewed.review.pr_number })).data;
    const reviewedCommit = (await github.rest.git.getCommit({ ...context.repo, commit_sha: reviewed.commit })).data;
    assertEvidence(reviewed, local, run, pr, reviewedCommit);
    // A rerun starting during verification must not change which attempt is accepted.
    const finalRun = (await github.rest.actions.getWorkflowRun(params)).data;
    assertRun(finalRun, workflow, repository, runId);
    assert.strictEqual(finalRun.run_attempt, run.run_attempt, "review attempt changed during verification");
    return {
      schema: SCHEMA,
      review_run_id: String(run.id),
      review_run_attempt: String(run.run_attempt),
      review_artifact_id: String(artifact.id),
      reviewed_commit: reviewed.commit,
      target_commit: local.commit,
      tree: local.tree,
      toolchain: reviewed.toolchain,
      members: reviewed.members
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { assertRun, assertEvidence, verifyReviewedProvenance };
