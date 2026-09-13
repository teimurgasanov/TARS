"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "../..");
const guarded = fs.readFileSync(path.join(root, ".github/workflows/tars-guarded-review-build.yml"), "utf8");
assert.match(guarded, /\.\/build-tars\.sh/, "guarded review must build the canonical package");
assert.doesNotMatch(guarded, /zip -q -j/, "raw tracked JS must never be packaged as reviewed deployment code");

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `workflow step is missing: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next >= 0 ? next : workflow.length);
}

module.exports = async function testReviewedArtifactProvenance() {
  const { canonicalManifest, reviewedManifest, assertCanonicalMatch, sha256 } = require("../../tools/tars-canonical-manifest");
  const { verifyReviewedProvenance } = require("../../tools/tars-reviewed-provenance");
  const deploy = fs.readFileSync(path.join(root, ".github/workflows/deploy-rocketchat.yml"), "utf8");
  assert.match(guarded, /needs: \[tests, claude-review\]/);
  assert.strictEqual((guarded.match(/ref: \$\{\{ github.sha \}\}/g) || []).length, 3,
    "tests, Claude and artifact build must use the immutable merge candidate");
  assert.match(guarded, /node tools\/tars-canonical-manifest.js/);
  assert.match(guarded, /name: reviewed-tars-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
  assert.match(guarded, /actions\/setup-node@v4[\s\S]*node-version: "20"/);
  assert.match(guarded, /test -z "\$\(git status --porcelain=v1 --untracked-files=no\)"/);
  assert.match(deploy, /review_run_id:[\s\S]*required: false/);
  const gateStart = deploy.indexOf("      - name: Verify immutable guarded review provenance");
  const gateEnd = deploy.indexOf("\n      - name:", gateStart + 1);
  const gate = deploy.slice(gateStart, gateEnd);
  assert.ok(gateStart > 0 && gateStart < deploy.indexOf("      - name: Validate Rocket.Chat deployment secrets"));
  assert.match(gate, /if: github.event_name == 'workflow_dispatch' && inputs.action == 'DEPLOY' && inputs.confirm == 'DEPLOY'/);
  assert.match(gate, /await verifyReviewedProvenance/);
  assert.match(gate, /RUNNER_TEMP.*tars-provenance-control/);
  assert.ok(gateStart < deploy.indexOf("      - name: Install pinned build dependency"),
    "reviewed code identity must be proven before executing candidate npm scripts or tests");
  assert.match(deploy, /CONTROL_SHA: \$\{\{ github.workflow_sha \}\}/);
  assert.match(deploy, /git show "\$CONTROL_SHA:tools\/\$file"/);
  assert.match(deploy, /assertCanonicalMatch\(process.env.ZIP_PATH, JSON.parse\(process.env.REVIEW_EVIDENCE\)\)/);
  assert.ok(deploy.indexOf("      - name: Match deployment package to reviewed evidence") > deploy.indexOf("      - name: Verify canonical package gate"));
  assert.ok(deploy.indexOf("      - name: Match deployment package to reviewed evidence") < deploy.indexOf("      - name: Validate Rocket.Chat deployment secrets"));
  assert.doesNotMatch(gate, /continue-on-error|try\s*\{|catch\s*\(/);
  assert.match(deploy, /review_evidence: \$\{\{ steps.reviewed.outputs.evidence \}\}/);
  assert.match(deploy, /reviewed_canonical: reviewEvidence/);
  assert.deepStrictEqual(guarded.match(/\b[\w-]+: write/g), ["id-token: write"]);
  assert.deepStrictEqual(deploy.match(/\b[\w-]+: write/g), ["deployments: write"]);
  assert.deepStrictEqual(guarded.match(/uses: anthropics\/claude-code-action@\S+/g),
    ["uses: anthropics/claude-code-action@9cdae7f0d995e3ba7c33f226087fdf82a59cd520"],
    "Claude review behavior must be pinned to the independently verified action commit");
  assert.doesNotMatch(guarded, /anthropics\/claude-code-action@v1\b/,
    "the mutable v1 tag must not control verdict/reason parsing");
  assert.match(guarded, /display_report: 'false'/, "full action report must stay hidden");
  assert.match(guarded, /show_full_output: 'false'/, "full Claude transcript must stay hidden");
  const reviewStep = workflowStep(guarded, "Review PR diff");
  const normalizeStep = workflowStep(guarded, "Normalize Claude review result");
  assert.doesNotMatch(reviewStep, /--json-schema/,
    "the gate must not depend on flaky SDK structured-output retries");
  assert.match(reviewStep, /FINAL_REASON:/,
    "the reviewer must emit an explicit bounded reason sentinel");
  assert.match(reviewStep, /FINAL_VERDICT: PASS/);
  assert.match(reviewStep, /FINAL_VERDICT: BLOCK/);
  assert.match(normalizeStep, /CLAUDE_EXECUTION_FILE: \$\{\{ steps\.claude\.outputs\.execution_file \}\}/,
    "the local normalizer must read the pinned action execution file");
  assert.match(normalizeStep, /message\.type === 'result'/);
  assert.match(normalizeStep, /message\.subtype === 'success'/);
  assert.doesNotMatch(normalizeStep, /console\.log|process\.stdout/,
    "the transcript parser must not print execution-file content");
  assert.doesNotMatch(workflowStep(guarded, "Enforce Claude verdict"), /execution_file|CLAUDE_EXECUTION_FILE/,
    "the enforcement step must not read or expose the full execution transcript");

  const wp003Scope = fs.readFileSync(path.join(root, ".github/review-scopes/pr-50.md"), "utf8");
  for (const required of ["M1/M2/M3", "at most one live authoritative confirmation",
    "PAS unavailable means no local financial confirmation", "duplicate observation grants no additional credit",
    "recovery and adjudication through PAS"]) assert.match(wp003Scope, new RegExp(required));
  for (const forbiddenDelta of ["`/prinyat` selector", "OCR behavior", "Date or calendar",
    "Report or workday", "`approvedBy`", "Automatic confirmation", "Deployment or cutover",
    "Migration", "Production topology"]) assert.match(wp003Scope, new RegExp(forbiddenDelta));

  // Execute the actual verdict parser. It must fail closed and print only the bounded report.
  const parser = guarded.match(/python3 - <<'PY'\n([\s\S]*?)\n          PY/)[1]
    .split("\n").map((line) => line.slice(10)).join("\n");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tars-provenance-test-"));
  try {
    const transcriptMarker = "FULL_TRANSCRIPT_MUST_NOT_APPEAR";
    const secretMarker = "sk-ant-sensitive-fixture-value";
    const verdictCases = [
      ["missing output", "success", "", false, "Reviewer output is missing or malformed."],
      ["missing verdict", "success", JSON.stringify({ reason: "A reason without a verdict." }), false,
        "Reviewer output does not match the required contract."],
      ["reviewer block", "success", JSON.stringify({ verdict: "BLOCK", reason: "Fix duplicate credit handling." }),
        false, "Fix duplicate credit handling."],
      ["reviewer pass", "success", JSON.stringify({ verdict: "PASS", reason: "No blocking regression found." }),
        true, "No blocking regression found."],
      ["unsafe reason", "success", JSON.stringify({ verdict: "BLOCK", reason: `Leaked ${secretMarker}` }),
        false, "Reviewer reason was withheld"],
      ["failed execution", "failure", JSON.stringify({ verdict: "PASS", reason: "Should be ignored." }),
        false, "Reviewer execution did not complete successfully."],
    ];
    for (const [name, conclusion, reviewJson, pass, visibleReason] of verdictCases) {
      const summary = path.join(temp, `summary-${name.replaceAll(" ", "-")}.md`);
      const result = spawnSync("python3", ["-c", parser], { encoding: "utf8",
        env: { ...process.env, CLAUDE_CONCLUSION: conclusion, CLAUDE_REVIEW_JSON: reviewJson,
          CLAUDE_EXECUTION_FILE: transcriptMarker, GITHUB_STEP_SUMMARY: summary } });
      const summaryText = fs.readFileSync(summary, "utf8");
      const exposed = `${result.stdout}${result.stderr}${summaryText}`;
      assert.strictEqual(result.status === 0, pass, `Claude verdict gate: ${name}`);
      assert.match(result.stdout, new RegExp(visibleReason), `concise reason must be visible in logs: ${name}`);
      assert.match(summaryText, new RegExp(visibleReason), `concise reason must be visible in summary: ${name}`);
      assert.doesNotMatch(exposed, new RegExp(transcriptMarker), "full execution transcript must stay hidden");
      assert.doesNotMatch(exposed, new RegExp(secretMarker), "secret-like reviewer text must stay hidden");
    }

    // Execute the exact base-scope loader against real merge commits.
    const scopeStep = workflowStep(guarded, "Establish base-owned review scope");
    const scopeScript = scopeStep.split("        run: |\n")[1].trimEnd()
      .split("\n").map((line) => line.slice(10)).join("\n");
    const scopeFixture = path.join(temp, "scope-fixture");
    fs.mkdirSync(scopeFixture);
    const scopeGit = (...args) => execFileSync("git", args, { cwd: scopeFixture, encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_COMMITTER_NAME: "Fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();
    scopeGit("init", "--quiet");
    const emptyTree = scopeGit("write-tree");
    const emptyBase = scopeGit("commit-tree", emptyTree, "-m", "base without scope");
    fs.mkdirSync(path.join(scopeFixture, ".github/review-scopes"), { recursive: true });
    fs.writeFileSync(path.join(scopeFixture, ".github/review-scopes/pr-50.md"), wp003Scope);
    scopeGit("add", ".github/review-scopes/pr-50.md");
    const scopedTree = scopeGit("write-tree");
    const headOnly = scopeGit("commit-tree", scopedTree, "-p", emptyBase, "-m", "head-only scope");
    const headOnlyMerge = scopeGit("commit-tree", scopedTree, "-p", emptyBase, "-p", headOnly,
      "-m", "head-only merge");
    const scopedBase = scopeGit("commit-tree", scopedTree, "-p", emptyBase, "-m", "base-owned scope");
    const scopedHead = scopeGit("commit-tree", scopedTree, "-p", scopedBase, "-m", "head");
    const scopedMerge = scopeGit("commit-tree", scopedTree, "-p", scopedBase, "-p", scopedHead,
      "-m", "authorized merge");

    function loadScope({ baseSha, headSha, mergeSha, prNumber }) {
      const output = path.join(temp, `scope-output-${prNumber}-${mergeSha}.txt`);
      const result = spawnSync("bash", ["-c", scopeScript], { cwd: scopeFixture, encoding: "utf8",
        env: { ...process.env, REVIEW_BASE_SHA: baseSha, REVIEW_HEAD_SHA: headSha,
          REVIEW_MERGE_SHA: mergeSha, REVIEW_PR_NUMBER: String(prNumber), GITHUB_OUTPUT: output } });
      return { result, output: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "" };
    }

    const ordinary = loadScope({ baseSha: scopedBase, headSha: scopedHead, mergeSha: scopedMerge, prNumber: 51 });
    assert.strictEqual(ordinary.result.status, 0);
    assert.match(ordinary.output, /No intentional behavioral change is authorized/,
      "ordinary PRs must remain baseline-protected");
    const authorized = loadScope({ baseSha: scopedBase, headSha: scopedHead, mergeSha: scopedMerge, prNumber: 50 });
    assert.strictEqual(authorized.result.status, 0);
    assert.match(authorized.output, /M1\/M2\/M3/,
      "an authorized WP must receive only its base-owned scope");
    const selfAuthorized = loadScope({ baseSha: emptyBase, headSha: headOnly, mergeSha: headOnlyMerge, prNumber: 50 });
    assert.strictEqual(selfAuthorized.result.status, 0);
    assert.match(selfAuthorized.output, /No intentional behavioral change is authorized/);
    assert.doesNotMatch(selfAuthorized.output, /M1\/M2\/M3/,
      "a head-only scope declaration must not authorize itself");
    const mismatchedIdentity = loadScope({ baseSha: emptyBase, headSha: scopedHead,
      mergeSha: scopedMerge, prNumber: 50 });
    assert.notStrictEqual(mismatchedIdentity.result.status, 0,
      "scope loading must fail closed when exact PR identity cannot be established");

    // Behind-base PR: H and newer base B1 diverge from B0. M retains both contributions.
    const B0 = emptyBase;
    const B1 = scopedBase;
    scopeGit("read-tree", emptyTree);
    fs.writeFileSync(path.join(scopeFixture, "feature.txt"), "feature contribution\n");
    scopeGit("add", "feature.txt");
    const featureTree = scopeGit("write-tree");
    const H = scopeGit("commit-tree", featureTree, "-p", B0, "-m", "feature from old base");
    scopeGit("read-tree", scopedTree);
    scopeGit("add", "feature.txt");
    const mergedTree = scopeGit("write-tree");
    const M = scopeGit("commit-tree", mergedTree, "-p", B1, "-p", H, "-m", "behind-base merge");
    assert.strictEqual(scopeGit("rev-parse", `${H}^`), B0);
    assert.strictEqual(scopeGit("rev-parse", `${B1}^`), B0);
    assert.strictEqual(scopeGit("rev-list", "--parents", "-n", "1", M), `${M} ${B1} ${H}`);
    const surface = scopeGit("diff", "--name-status", B1, M, "--");
    assert.strictEqual(surface, "A\tfeature.txt", "BASE to MERGE must contain only the feature contribution");
    assert.strictEqual(scopeGit("diff", "--name-status", B1, H, "--"),
      "D\t.github/review-scopes/pr-50.md\nA\tfeature.txt",
      "BASE to HEAD would falsely report deletion of the base-only governance scope");
    assert.strictEqual(scopeGit("show", `${M}:.github/review-scopes/pr-50.md`), wp003Scope.trim());
    const behindBase = loadScope({ baseSha: B1, headSha: H, mergeSha: M, prNumber: 50 });
    assert.strictEqual(behindBase.result.status, 0, "the real loader must accept a behind-base merge");
    assert.match(behindBase.output, /M1\/M2\/M3/, "base-owned scope must survive the behind-base merge");
    const extraParentMerge = scopeGit("commit-tree", mergedTree, "-p", B1, "-p", H, "-p", B0,
      "-m", "invalid three-parent merge");
    for (const identity of [
      { baseSha: B1, headSha: B0, mergeSha: M },
      { baseSha: B1, headSha: H, mergeSha: H },
      { baseSha: B1, headSha: H, mergeSha: extraParentMerge }
    ]) assert.notStrictEqual(loadScope({ ...identity, prNumber: 50 }).result.status, 0,
      "loader must reject wrong HEAD, a non-merge commit, or an extra parent");

    // Bind the real prompt command to the fixture, not a separately invented review command.
    const reviewPrompt = workflowStep(guarded, "Review PR diff").split("          prompt: |\n")[1]
      .split("          claude_args:")[0];
    const reviewCommands = [...reviewPrompt.matchAll(/`git diff ([^`]+)`/g)];
    assert.strictEqual(reviewCommands.length, 1, "prompt must specify one immutable review diff");
    assert.strictEqual(reviewCommands[0][1],
      "${{ github.event.pull_request.base.sha }} ${{ github.sha }} --",
      "review contract must target BASE to MERGE, never BASE to HEAD or mutable tips");
    const reviewArgs = reviewCommands[0][1]
      .replace("${{ github.event.pull_request.base.sha }}", B1)
      .replace("${{ github.sha }}", M).split(" ");
    assert.strictEqual(scopeGit("diff", "--name-status", ...reviewArgs), surface);
    assert.match(reviewPrompt, /PR head SHA is identity\/parent evidence; do not use the head tree as a substitute for the merge candidate/);
    assert.doesNotMatch(reviewPrompt, /between those exact base\/head commits|PR diff against develop/);
    console.log("PASS: behind-base review surface BASE -> MERGE; BASE -> HEAD false deletion reproduced; exact two-parent identity retained");

    execFileSync(path.join(root, "build-tars.sh"), [], { cwd: root, stdio: "pipe" });
    const zipName = `tars-report_${require("../../app.json").version}.zip`;
    const zipPath = path.join(root, zipName);
    const local = canonicalManifest(zipPath);
    assert.match(local.commit, /^[0-9a-f]{40}$/);
    assert.match(local.tree, /^[0-9a-f]{40}$/);
    assert.strictEqual(Object.keys(local.members).length, 5);
    for (const hash of Object.values(local.members)) assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notStrictEqual(local.members["TarsReportApp.js"], sha256(fs.readFileSync(path.join(root, "TarsReportApp.js"))));
    assert.throws(() => reviewedManifest(zipPath, {}, { GITHUB_EVENT_NAME: "workflow_dispatch" }), /requires a PR event/);

    const head = "a".repeat(40), base = "b".repeat(40), merge = "c".repeat(40);
    const repository = "fixture/tars";
    const run = { id: 123, run_attempt: 2, workflow_id: 456, repository: { full_name: repository },
      event: "pull_request", head_sha: head, status: "completed", conclusion: "success" };
    const workflow = { id: 456, path: ".github/workflows/tars-guarded-review-build.yml" };
    const pr = { number: 7, head: { sha: head }, base: { ref: "develop", repo: { full_name: repository } },
      merged: true, merge_commit_sha: local.commit };
    const commit = { sha: merge, tree: { sha: local.tree }, parents: [{ sha: base }, { sha: head }] };
    const manifest = { ...local, commit: merge, review: { repository, run_id: "123", run_attempt: "2",
      pr_number: 7, head_sha: head, base_sha: base } };
    const artifact = { id: 789, name: "reviewed-tars-123-2", expired: false,
      workflow_run: { id: 123, head_sha: head } };

    // Exercise the real producer against a temporary Git merge candidate, not hand-written JSON alone.
    const fixture = path.join(temp, "git-fixture");
    fs.mkdirSync(fixture);
    fs.symlinkSync(path.join(root, "node_modules"), path.join(fixture, "node_modules"));
    for (const name of Object.keys(local.members)) fs.copyFileSync(path.join(root, name), path.join(fixture, name));
    fs.mkdirSync(path.join(fixture, "tools"));
    const controlFiles = ["tars-canonical-manifest.js", "tars-reviewed-provenance.js", "verify-tars-bundle.js"];
    for (const name of controlFiles) fs.copyFileSync(path.join(root, "tools", name), path.join(fixture, "tools", name));
    const git = (...args) => execFileSync("git", args, { cwd: fixture, encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_COMMITTER_NAME: "Fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_EMAIL: "fixture@example.invalid" } }).trim();
    git("init", "--quiet");
    git("add", ...Object.keys(local.members), "tools");
    const tree = git("write-tree");
    const baseSha = git("commit-tree", tree, "-m", "base");
    const headSha = git("commit-tree", tree, "-p", baseSha, "-m", "head");
    const mergeSha = git("commit-tree", tree, "-p", baseSha, "-p", headSha, "-m", "merge candidate");
    git("update-ref", "HEAD", mergeSha);
    const event = { pull_request: { number: 7, head: { sha: headSha },
      base: { sha: baseSha, ref: "develop", repo: { full_name: repository } } } };
    const reviewEnv = { GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: mergeSha,
      GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2" };

    // A candidate's replacement verifier cannot approve itself: execute the real workflow loader.
    const loader = deploy.slice(deploy.indexOf("      - name: Load verifier from immutable workflow revision"), gateStart);
    const loaderScript = loader.split("        run: |\n")[1].trimEnd()
      .split("\n").map((line) => line.slice(10)).join("\n");
    fs.writeFileSync(path.join(fixture, "tools/tars-reviewed-provenance.js"), "throw new Error('unreviewed replacement');\n");
    const loaded = path.join(temp, "loaded");
    fs.mkdirSync(loaded);
    execFileSync("bash", ["-c", loaderScript], { cwd: fixture,
      env: { ...process.env, CONTROL_SHA: mergeSha, RUNNER_TEMP: loaded } });
    for (const name of controlFiles) assert.deepStrictEqual(fs.readFileSync(path.join(loaded, "tars-provenance-control", name)),
      fs.readFileSync(path.join(root, "tools", name)), "loader must use workflow revision, not candidate filesystem");
    const previousCwd = process.cwd();
    try {
      process.chdir(fixture);
      const produced = reviewedManifest(zipPath, event, reviewEnv);
      assert.strictEqual(produced.commit, mergeSha);
      assert.strictEqual(produced.tree, tree);
      assert.deepStrictEqual(produced.members, local.members);
      assert.deepStrictEqual(produced.review, { repository, run_id: "123", run_attempt: "2",
        pr_number: 7, head_sha: headSha, base_sha: baseSha });
      assert.throws(() => reviewedManifest(zipPath, event, { ...reviewEnv, GITHUB_SHA: headSha }), /checkout drift/);
      assert.throws(() => reviewedManifest(zipPath, { pull_request: { ...event.pull_request, head: { sha: baseSha } } },
        reviewEnv), /exact PR merge candidate/);
    } finally {
      process.chdir(previousCwd);
    }

    const rawZip = path.join(temp, "raw.zip");
    execFileSync("zip", ["-q", "-j", rawZip, ...Object.keys(local.members).map((name) => path.join(root, name))]);
    assert.throws(() => canonicalManifest(rawZip), /bundle check failed|unresolved relative|raw tracked JS/,
      "raw-source ZIP cannot acquire canonical provenance");

    function archive(evidence, packagePath = zipPath) {
      const dir = fs.mkdtempSync(path.join(temp, "archive-"));
      const file = path.join(dir, "evidence.zip");
      fs.writeFileSync(path.join(dir, "reviewed-provenance.json"), JSON.stringify(evidence));
      fs.copyFileSync(packagePath, path.join(dir, zipName));
      execFileSync("zip", ["-q", "-j", file, path.join(dir, "reviewed-provenance.json"), path.join(dir, zipName)]);
      return fs.readFileSync(file);
    }
    const goodArchive = archive(manifest);
    async function verify(options = {}) {
      let runReads = 0;
      const github = {
        rest: {
          actions: {
            getWorkflow: async () => ({ data: options.workflow || workflow }),
            getWorkflowRun: async () => ({ data: ++runReads > 1 && options.finalRun ? options.finalRun : options.run || run }),
            listWorkflowRunArtifacts: () => {},
            downloadArtifact: async (params) => {
              assert.strictEqual(params.artifact_id, artifact.id);
              return { data: options.archive || goodArchive };
            }
          },
          pulls: { get: async () => ({ data: options.pr || pr }) },
          git: { getCommit: async () => ({ data: options.commit || commit }) }
        },
        paginate: async (_method, params) => {
          assert.strictEqual(params.run_id, 123, "must select an exact run, never latest");
          return options.artifacts || [artifact];
        }
      };
      return verifyReviewedProvenance({ github, context: { repo: { owner: "fixture", repo: "tars" } },
        runId: Object.hasOwn(options, "runId") ? options.runId : "123", zipPath });
    }
    const accepted = await verify();
    assert.strictEqual(accepted.review_artifact_id, "789");
    assert.strictEqual(accepted.reviewed_commit, merge);
    assert.strictEqual(accepted.target_commit, local.commit, "PR merge candidate SHA need not equal resulting commit SHA");
    assert.deepStrictEqual(accepted.members, local.members);
    assertCanonicalMatch(zipPath, accepted);
    for (const altered of [
      { ...accepted, target_commit: head },
      { ...accepted, tree: head },
      { ...accepted, toolchain: { node_major: 20, esbuild: "other" } },
      { ...accepted, members: { ...accepted.members, "TarsReportApp.js": "0".repeat(64) } },
      { ...accepted, members: { ...accepted.members, "icon.png": "0".repeat(64) } }
    ]) assert.throws(() => assertCanonicalMatch(zipPath, altered), /changed after review|differs|hashes differ/);
    assert.throws(() => assertCanonicalMatch(rawZip, accepted), /bundle check failed|unresolved relative|raw tracked JS/);

    const negatives = [
      ["missing run", { runId: "" }],
      ["wrong run", { run: { ...run, id: 124 } }],
      ["wrong repository", { run: { ...run, repository: { full_name: "other/repo" } } }],
      ["wrong workflow", { run: { ...run, workflow_id: 999 } }],
      ["dispatch cannot stand in for PR review", { run: { ...run, event: "workflow_dispatch" } }],
      ["failed review", { run: { ...run, conclusion: "failure" } }],
      ["unfinished review", { run: { ...run, status: "in_progress" } }],
      ["missing artifact", { artifacts: [] }],
      ["ambiguous artifact", { artifacts: [artifact, artifact] }],
      ["expired artifact", { artifacts: [{ ...artifact, expired: true }] }],
      ["stale artifact attempt", { artifacts: [{ ...artifact, name: "reviewed-tars-123-1" }] }],
      ["another run artifact", { artifacts: [{ ...artifact, workflow_run: { id: 999, head_sha: head } }] }],
      ["another head artifact", { artifacts: [{ ...artifact, workflow_run: { id: 123, head_sha: base } }] }],
      ["raw-source ZIP with genuine canonical manifest", { archive: archive(manifest, rawZip) }],
      ["unmerged PR", { pr: { ...pr, merged: false } }],
      ["wrong target commit", { pr: { ...pr, merge_commit_sha: head } }],
      ["PR head changed", { pr: { ...pr, head: { sha: base } } }],
      ["wrong Git commit", { commit: { ...commit, sha: head } }],
      ["wrong Git tree", { commit: { ...commit, tree: { sha: head } } }],
      ["wrong merge parents", { commit: { ...commit, parents: [{ sha: head }] } }],
      ["attempt race", { finalRun: { ...run, run_attempt: 3 } }],
      ["review revoked during check", { finalRun: { ...run, conclusion: "failure" } }]
    ];
    for (const [name, mutate] of [
      ["missing review", (m) => { delete m.review; }],
      ["wrong schema", (m) => { m.schema = "unknown"; }],
      ["wrong reviewed commit", (m) => { m.commit = head; }],
      ["wrong reviewed tree", (m) => { m.tree = head; }],
      ["wrong bundle hash", (m) => { m.members["TarsReportApp.js"] = "0".repeat(64); }],
      ["wrong package member hash", (m) => { m.members["icon.png"] = "0".repeat(64); }],
      ["missing package member", (m) => { delete m.members["app.json"]; }],
      ["wrong toolchain", (m) => { m.toolchain.esbuild = "other"; }],
      ["wrong evidence run", (m) => { m.review.run_id = "124"; }],
      ["wrong evidence attempt", (m) => { m.review.run_attempt = "1"; }],
      ["wrong evidence head", (m) => { m.review.head_sha = base; }],
      ["wrong evidence base", (m) => { m.review.base_sha = head; }],
      ["wrong PR number", (m) => { m.review.pr_number = 8; }]
    ]) {
      const changed = structuredClone(manifest);
      mutate(changed);
      negatives.push([name, { archive: archive(changed) }]);
    }
    for (const [name, options] of negatives) await assert.rejects(verify(options), undefined, name);

    // ZIP byte identity may change while all canonical member identities remain equal.
    const repack = path.join(temp, "repack");
    fs.mkdirSync(repack);
    execFileSync("unzip", ["-q", zipPath, "-d", repack]);
    for (const name of Object.keys(local.members)) fs.utimesSync(path.join(repack, name), 1000000000, 1000000000);
    const repackedZip = path.join(temp, "repacked.zip");
    execFileSync("zip", ["-q", "-j", repackedZip, ...Object.keys(local.members).map((name) => path.join(repack, name))]);
    assert.notStrictEqual(sha256(fs.readFileSync(repackedZip)), sha256(fs.readFileSync(zipPath)));
    assert.deepStrictEqual(canonicalManifest(repackedZip).members, local.members);
    assertCanonicalMatch(repackedZip, accepted);
    await verify({ archive: archive(manifest, repackedZip) });
    console.log(`PASS: reviewed canonical provenance; ${negatives.length} negative cases; Claude fail-closed; ZIP timestamps independent`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
};

if (require.main === module) module.exports().catch((error) => { console.error(error); process.exitCode = 1; });
