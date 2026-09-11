"use strict";

// Content identity deliberately excludes ZIP container timestamps.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { assertBundlePolicy } = require("./verify-tars-bundle");

const MEMBERS = Object.freeze(["app.json", "TarsReportApp.js", "en.json", "ru.json", "icon.png"]);
const SCHEMA = "tars-reviewed-canonical-v1";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const unzip = (...args) => execFileSync("unzip", args, { maxBuffer: 16 * 1024 * 1024 });

function packageMembers(zipPath) {
  unzip("-t", zipPath);
  assert.deepStrictEqual(unzip("-Z1", zipPath).toString().trim().split("\n"), MEMBERS,
    "canonical package must contain exactly the five ordered members");
  const members = {};
  for (const name of MEMBERS) {
    const bytes = unzip("-p", zipPath, name);
    if (name === "TarsReportApp.js") {
      const source = bytes.toString("utf8");
      assertBundlePolicy(source);
      assert.ok(source.includes("scanner2-shadow:v1:"), "missing shadow namespace");
      assert.doesNotMatch(source, /(evaluateRules|resolveConflicts|makeDecision|runOfflineComparison|runOfflineDataset)\s*\(/,
        "runtime Scanner decision call in production bundle");
      assert.notStrictEqual(sha256(bytes), sha256(fs.readFileSync(name)), "raw tracked JS is not a canonical bundle");
    } else {
      assert.strictEqual(sha256(bytes), sha256(fs.readFileSync(name)), `packaged ${name} differs from checkout`);
    }
    members[name] = sha256(bytes);
  }
  return members;
}

function canonicalManifest(zipPath) {
  assert.strictEqual(process.versions.node.split(".")[0], "20", "canonical validation requires Node 20");
  assert.strictEqual(require(require.resolve("esbuild/package.json", { paths: [process.cwd()] })).version,
    "0.12.29", "unexpected esbuild version");
  return {
    schema: SCHEMA,
    commit: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    toolchain: { node_major: 20, esbuild: "0.12.29" },
    members: packageMembers(zipPath)
  };
}

function reviewedManifest(zipPath, event, env = process.env) {
  const manifest = canonicalManifest(zipPath);
  const pr = event.pull_request;
  assert.ok(env.GITHUB_EVENT_NAME === "pull_request" && pr, "deployable review requires a PR event");
  assert.strictEqual(pr.base.ref, "develop", "review must target develop");
  assert.strictEqual(pr.base.repo.full_name, env.GITHUB_REPOSITORY);
  assert.strictEqual(manifest.commit, env.GITHUB_SHA, "checkout drift from reviewed merge candidate");
  assert.deepStrictEqual(git("show", "-s", "--format=%P", "HEAD").split(" "), [pr.base.sha, pr.head.sha],
    "reviewed checkout must be the exact PR merge candidate");
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) {
    assert.match(env[key] || "", /^[1-9][0-9]*$/);
  }
  manifest.review = {
    repository: env.GITHUB_REPOSITORY,
    run_id: env.GITHUB_RUN_ID,
    run_attempt: env.GITHUB_RUN_ATTEMPT,
    pr_number: pr.number,
    head_sha: pr.head.sha,
    base_sha: pr.base.sha
  };
  return manifest;
}

function assertCanonicalMatch(zipPath, evidence) {
  const local = canonicalManifest(zipPath);
  assert.strictEqual(local.commit, evidence.target_commit, "deployment commit changed after review verification");
  assert.strictEqual(local.tree, evidence.tree, "deployment tree changed after review verification");
  assert.deepStrictEqual(local.toolchain, evidence.toolchain, "canonical toolchain differs");
  assert.deepStrictEqual(local.members, evidence.members, "canonical member hashes differ");
}

if (require.main === module) {
  const [zipPath, outputPath] = process.argv.slice(2);
  assert.ok(zipPath && outputPath, "usage: node tools/tars-canonical-manifest.js <canonical.zip> <manifest.json>");
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  fs.writeFileSync(outputPath, JSON.stringify(reviewedManifest(zipPath, event), null, 2) + "\n", { flag: "wx" });
  console.log("REVIEWED_CANONICAL_MANIFEST=PASS");
}

module.exports = { MEMBERS, SCHEMA, sha256, unzip, git, packageMembers, canonicalManifest, reviewedManifest, assertCanonicalMatch };
