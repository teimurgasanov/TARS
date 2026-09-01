"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const workflowPath = path.resolve(__dirname, "..", ".github", "workflows", "deploy-rocketchat.yml");
const workflow = fs.readFileSync(workflowPath, "utf8");

function step(name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `workflow step is missing: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next >= 0 ? next : workflow.length);
}

const guardedName = "Authenticate, revoke previous sessions, update app, and logout";
const guarded = step(guardedName);
const manualGate = "if: github.event_name == 'workflow_dispatch' && inputs.confirm == 'DEPLOY'";
const runMarker = "        run: |\n";
const runStart = guarded.indexOf(runMarker);
assert.ok(runStart >= 0, "guarded step must contain a shell script");
const guardedScript = guarded
  .slice(runStart + runMarker.length)
  .split("\n")
  .map((line) => line.startsWith("          ") ? line.slice(10) : line)
  .join("\n");

assert.ok(guarded.includes(manualGate), "all authenticated Rocket.Chat calls must remain manual DEPLOY only");
assert.match(guarded, /\/api\/v1\/login/, "guarded step must authenticate locally");
assert.match(guarded, /::add-mask::\$AUTH_TOKEN/, "dynamic auth token must be masked");
assert.match(guarded, /::add-mask::\$USER_ID/, "dynamic user id must be masked");
assert.match(guarded, /trap cleanup EXIT/, "logout cleanup must run on every exit after login");
assert.match(guarded, /\/api\/v1\/logout/, "cleanup must revoke the fresh deployment session");
assert.match(guarded, /\/api\/v1\/users\.logoutOtherClients/, "old deployment-user sessions must be revoked before update");
assert.ok(
  guarded.indexOf("/api/v1/users.logoutOtherClients") < guarded.indexOf("/api/apps/update"),
  "previous sessions must be revoked before apps/update"
);
assert.match(guarded, /Deployment blocked before apps\/update/, "revocation failure must fail closed before app update");
assert.match(guarded, /No retry will be attempted/, "app update must not retry automatically");

assert.doesNotMatch(workflow, /(?:AUTH_TOKEN|USER_ID)=.*>>\s*["']?\$GITHUB_ENV/,
  "dynamic credentials must never be written to GITHUB_ENV");
assert.doesNotMatch(workflow, /(?:AUTH_TOKEN|USER_ID)=.*>>\s*["']?\$GITHUB_OUTPUT/,
  "dynamic credentials must never be written to GITHUB_OUTPUT");
assert.doesNotMatch(workflow, /(?:AUTH_TOKEN|USER_ID).*GITHUB_STEP_SUMMARY|GITHUB_STEP_SUMMARY.*(?:AUTH_TOKEN|USER_ID)/,
  "dynamic credentials must never enter the job summary");
const credentialEchoes = guardedScript
  .split("\n")
  .filter((line) => /echo .*\$(?:AUTH_TOKEN|USER_ID)/.test(line));
assert.deepStrictEqual(credentialEchoes.map((line) => line.trim()), [
  'echo "::add-mask::$AUTH_TOKEN"',
  'echo "::add-mask::$USER_ID"'
], "the mask commands must be the only stdout path for dynamic credential values");
assert.ok(guardedScript.indexOf("trap cleanup EXIT") < guardedScript.indexOf("/api/v1/login"),
  "logout trap must be installed before authentication");

const validationPrefix = workflow.slice(0, workflow.indexOf("      - name: Validate Rocket.Chat deployment secrets"));
assert.doesNotMatch(validationPrefix, /secrets\.ROCKETCHAT_|\/api\/v1\/login|\/api\/apps\/update|logoutOtherClients/,
  "develop push validation path must not authenticate, revoke sessions, or deploy");

const scanner2DecisionCalls = ["evaluateRules", "resolveConflicts", "makeDecision", "runOfflineComparison", "runOfflineDataset"];
scanner2DecisionCalls.forEach((name) => {
  assert.doesNotMatch(guarded, new RegExp(`\\b${name}\\s*\\(`), `${name} must remain outside deploy credential handling`);
});

function simulateGuardedStep(updateCode, revokeCode = 200) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tars-token-hygiene-"));
  const callLog = path.join(tempDir, "calls.log");
  const mockPrelude = `
curl() {
  local endpoint="\${!#}"
  local output=""
  local previous=""
  for argument in "$@"; do
    if [ "$previous" = "--output" ]; then output="$argument"; fi
    previous="$argument"
  done
  case "$endpoint" in
    */api/v1/login)
      printf '%s' '{"data":{"authToken":"fake-dynamic-secret","userId":"fake-user-id"}}'
      printf '%s\\n' login >> "$CALL_LOG"
      ;;
    */api/v1/users.logoutOtherClients)
      [ -z "$output" ] || printf '%s' '{}' > "$output"
      printf '%s\\n' revoke >> "$CALL_LOG"
      printf '%s' "$MOCK_REVOKE_CODE"
      ;;
    */api/apps/update)
      [ -z "$output" ] || printf '%s' '{"app":{"id":"test-app","version":"0.10.18","status":"manually_enabled"}}' > "$output"
      printf '%s\\n' update >> "$CALL_LOG"
      printf '%s' "$MOCK_UPDATE_CODE"
      ;;
    */api/v1/logout)
      [ -z "$output" ] || printf '%s' '{}' > "$output"
      printf '%s\\n' logout >> "$CALL_LOG"
      printf '%s' 200
      ;;
    *)
      printf '%s\\n' unexpected >> "$CALL_LOG"
      return 90
      ;;
  esac
}
`;
  const result = spawnSync("bash", ["-c", mockPrelude + "\n" + guardedScript], {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      CALL_LOG: callLog,
      MOCK_UPDATE_CODE: String(updateCode),
      MOCK_REVOKE_CODE: String(revokeCode),
      ROCKETCHAT_URL: "https://rocket.invalid",
      ROCKETCHAT_USER: "deployment-user",
      ROCKETCHAT_PASSWORD: "fake-password",
      RUNNER_TEMP: tempDir,
      ZIP_PATH: path.join(tempDir, "package.zip")
    }
  });
  const calls = fs.existsSync(callLog) ? fs.readFileSync(callLog, "utf8").trim().split("\n") : [];
  fs.rmSync(tempDir, { recursive: true, force: true });
  return { ...result, calls };
}

const successRun = simulateGuardedStep(200);
assert.strictEqual(successRun.status, 0, successRun.stderr);
assert.deepStrictEqual(successRun.calls, ["login", "revoke", "update", "logout"],
  "successful guarded flow must revoke old sessions before update and logout last");
assert.strictEqual((successRun.stdout.match(/fake-dynamic-secret/g) || []).length, 1,
  "the fake auth token may appear only in its add-mask command");
assert.strictEqual((successRun.stdout.match(/fake-user-id/g) || []).length, 1,
  "the fake user id may appear only in its add-mask command");

const failedUpdateRun = simulateGuardedStep(500);
assert.notStrictEqual(failedUpdateRun.status, 0, "failed app update must fail without retry");
assert.deepStrictEqual(failedUpdateRun.calls, ["login", "revoke", "update", "logout"],
  "logout cleanup must still execute after an app update failure");

const failedRevocationRun = simulateGuardedStep(200, 403);
assert.notStrictEqual(failedRevocationRun.status, 0, "failed previous-session revocation must block deployment");
assert.deepStrictEqual(failedRevocationRun.calls, ["login", "revoke", "logout"],
  "apps/update must not run when previous sessions could not be revoked");

console.log("PASS: Rocket.Chat deployment credentials remain local, masked, and explicitly revoked");
