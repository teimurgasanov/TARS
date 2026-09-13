"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/tars-guarded-review-build.yml"), "utf8");

function workflowStep(name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `missing workflow step: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next >= 0 ? next : workflow.length);
}

const review = workflowStep("Review PR diff");
const normalize = workflowStep("Normalize Claude review result");
const enforce = workflowStep("Enforce Claude verdict");

assert.doesNotMatch(review, /--json-schema/, "review gate must not depend on flaky SDK structured-output retries");
assert.match(review, /FINAL_REASON:/);
assert.match(review, /FINAL_VERDICT: PASS/);
assert.match(review, /FINAL_VERDICT: BLOCK/);
assert.match(review, /display_report: 'false'/);
assert.match(review, /show_full_output: 'false'/);
assert.match(normalize, /CLAUDE_EXECUTION_FILE: \$\{\{ steps\.claude\.outputs\.execution_file \}\}/);
assert.doesNotMatch(enforce, /execution_file|CLAUDE_EXECUTION_FILE/,
  "enforcement must consume only bounded normalized JSON, never the transcript file");

const scriptMatch = normalize.match(/node <<'NODE'\n([\s\S]*?)\n          NODE/);
assert.ok(scriptMatch, "normalizer script missing");
const script = scriptMatch[1].split("\n").map((line) => line.slice(10)).join("\n");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tars-review-normalizer-"));
try {
  function runCase(name, { conclusion = "success", messages = null, missingFile = false }) {
    const execution = path.join(temp, `${name}.json`);
    const output = path.join(temp, `${name}.out`);
    if (!missingFile) fs.writeFileSync(execution, JSON.stringify(messages));
    const result = spawnSync("node", ["-e", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLAUDE_CONCLUSION: conclusion,
        CLAUDE_EXECUTION_FILE: execution,
        GITHUB_OUTPUT: output,
      },
    });
    assert.strictEqual(result.status, 0, `${name}: normalizer itself must fail closed via outputs, not crash`);
    const text = fs.readFileSync(output, "utf8");
    const conclusionMatch = text.match(/^conclusion=(success|failure)$/m);
    const jsonMatch = text.match(/review_json<<TARS_BOUNDED_REVIEW_JSON\n([^\n]*)\nTARS_BOUNDED_REVIEW_JSON/m);
    assert.ok(conclusionMatch && jsonMatch, `${name}: expected bounded outputs`);
    return { conclusion: conclusionMatch[1], review: JSON.parse(jsonMatch[1]), exposed: `${result.stdout}${result.stderr}${text}` };
  }

  const transcriptMarker = "FULL_TRANSCRIPT_MUST_NOT_APPEAR";
  const pass = runCase("pass", { messages: [
    { type: "assistant", message: transcriptMarker },
    { type: "result", subtype: "success", is_error: false,
      result: `Review details that stay private.\nFINAL_REASON: No blocking regression found.\nFINAL_VERDICT: PASS` },
  ] });
  assert.strictEqual(pass.conclusion, "success");
  assert.deepStrictEqual(pass.review, { verdict: "PASS", reason: "No blocking regression found." });
  assert.doesNotMatch(pass.exposed, new RegExp(transcriptMarker));

  const block = runCase("block", { messages: [
    { type: "result", subtype: "success", is_error: false,
      result: "Finding details.\nFINAL_REASON: Preserve the base-owned authority boundary.\nFINAL_VERDICT: BLOCK" },
  ] });
  assert.strictEqual(block.conclusion, "success");
  assert.deepStrictEqual(block.review, { verdict: "BLOCK", reason: "Preserve the base-owned authority boundary." });

  for (const [name, options] of [
    ["failed-action", { conclusion: "failure", messages: [] }],
    ["missing-file", { missingFile: true }],
    ["missing-sentinel", { messages: [{ type: "result", subtype: "success", is_error: false, result: "PASS" }] }],
    ["trailing-text", { messages: [{ type: "result", subtype: "success", is_error: false,
      result: "FINAL_REASON: Fine.\nFINAL_VERDICT: PASS\nextra" }] }],
    ["errored-result", { messages: [{ type: "result", subtype: "error", is_error: true,
      result: "FINAL_REASON: Fine.\nFINAL_VERDICT: PASS" }] }],
    ["ambiguous-results", { messages: [
      { type: "result", subtype: "success", is_error: false, result: "FINAL_REASON: A.\nFINAL_VERDICT: PASS" },
      { type: "result", subtype: "success", is_error: false, result: "FINAL_REASON: B.\nFINAL_VERDICT: PASS" },
    ] }],
  ]) {
    const failed = runCase(name, options);
    assert.strictEqual(failed.conclusion, "failure", `${name}: malformed or ambiguous output must fail closed`);
    assert.deepStrictEqual(failed.review, {});
  }

  console.log("PASS: bounded Claude result normalization; transcript hidden; malformed output fails closed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
