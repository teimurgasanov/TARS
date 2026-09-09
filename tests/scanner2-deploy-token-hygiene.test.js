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

function runScript(stepText) {
  const marker = "        run: |\n";
  const start = stepText.indexOf(marker);
  assert.ok(start >= 0, "guarded step must contain a shell script");
  return stepText
    .slice(start + marker.length)
    .split("\n")
    .map((line) => line.startsWith("          ") ? line.slice(10) : line)
    .join("\n");
}

const guardedName = "Authenticate, revoke previous sessions, update app, and logout";
const guarded = step(guardedName);
const guardedScript = runScript(guarded);
const cleanupValidation = step("Validate guarded session cleanup request");
const cleanupGuarded = step("Revoke previous sessions and logout cleanup session");
const cleanupScript = runScript(cleanupGuarded);
const manualGate = "if: github.event_name == 'workflow_dispatch' && inputs.action == 'DEPLOY' && inputs.confirm == 'DEPLOY'";
const cleanupJobGate = "if: github.event_name == 'workflow_dispatch' && inputs.action == 'SESSION_CLEANUP'";
const provenanceStart = workflow.indexOf("\n  deployment_provenance:");
const provenanceEnd = workflow.indexOf("\n  session_cleanup:", provenanceStart);
assert.ok(provenanceStart >= 0 && provenanceEnd > provenanceStart, "deployment provenance job must exist");
const provenance = workflow.slice(provenanceStart, provenanceEnd);

assert.ok(provenance.includes(manualGate), "deployment provenance must remain manual DEPLOY only");
assert.match(provenance, /TARGET_SHA/);
assert.match(provenance, /BUNDLE_SHA256/);
assert.match(provenance, /ZIP_SHA256/);
assert.match(provenance, /needs\.validate\.result == 'success'/);
assert.doesNotMatch(provenance, /actions\/checkout|ROCKETCHAT_(?:URL|USER|PASSWORD)|secrets\.ROCKETCHAT_|AUTH_TOKEN|USER_ID|UPDATE_RESPONSE|LOGIN_JSON/,
  "deployment provenance metadata must not receive Rocket.Chat credentials, tokens, or response bodies");

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
assert.ok(workflow.includes(cleanupJobGate), "session cleanup must be unavailable to develop pushes");
assert.match(cleanupValidation, /inputs\.confirm.*CLEANUP/, "session cleanup must require exact CLEANUP confirmation");
assert.match(cleanupGuarded, /\/api\/v1\/login/, "session cleanup must authenticate locally");
assert.match(cleanupGuarded, /::add-mask::\$AUTH_TOKEN/, "session-cleanup auth token must be masked");
assert.match(cleanupGuarded, /::add-mask::\$USER_ID/, "session-cleanup user id must be masked");
assert.match(cleanupGuarded, /trap cleanup EXIT/, "session cleanup must install logout cleanup");
assert.match(cleanupGuarded, /\/api\/v1\/users\.logoutOtherClients/, "session cleanup must revoke older sessions");
assert.match(cleanupGuarded, /\/api\/v1\/logout/, "session cleanup must logout its fresh session");
assert.doesNotMatch(cleanupGuarded, /\/api\/apps\/update/, "session cleanup must never update the application");
assert.doesNotMatch(cleanupGuarded, /ZIP_PATH|build-tars|upload-artifact/, "session cleanup must not require a package");

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
const cleanupCredentialEchoes = cleanupScript
  .split("\n")
  .filter((line) => /echo .*\$(?:AUTH_TOKEN|USER_ID)/.test(line));
assert.deepStrictEqual(cleanupCredentialEchoes.map((line) => line.trim()), [
  'echo "::add-mask::$AUTH_TOKEN"',
  'echo "::add-mask::$USER_ID"'
], "cleanup mask commands must be the only stdout path for dynamic credential values");
assert.ok(guardedScript.indexOf("trap cleanup EXIT") < guardedScript.indexOf("/api/v1/login"),
  "logout trap must be installed before authentication");
assert.ok(cleanupScript.indexOf("trap cleanup EXIT") < cleanupScript.indexOf("/api/v1/login"),
  "cleanup logout trap must be installed before authentication");

const validationPrefix = workflow.slice(0, workflow.indexOf("      - name: Validate Rocket.Chat deployment secrets"));
assert.doesNotMatch(validationPrefix, /secrets\.ROCKETCHAT_|\/api\/v1\/login|\/api\/apps\/update|logoutOtherClients/,
  "develop push validation path must not authenticate, revoke sessions, or deploy");

const scanner2DecisionCalls = ["evaluateRules", "resolveConflicts", "makeDecision", "runOfflineComparison", "runOfflineDataset"];
scanner2DecisionCalls.forEach((name) => {
  assert.doesNotMatch(guarded, new RegExp(`\\b${name}\\s*\\(`), `${name} must remain outside deploy credential handling`);
  assert.doesNotMatch(cleanupGuarded, new RegExp(`\\b${name}\\s*\\(`), `${name} must remain outside session cleanup`);
});

function simulateScript(script, updateCode, revokeCode = 200) {
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
  const result = spawnSync("bash", ["-c", mockPrelude + "\n" + script], {
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

function simulateGuardedStep(updateCode, revokeCode = 200) {
  return simulateScript(guardedScript, updateCode, revokeCode);
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

const cleanupSuccessRun = simulateScript(cleanupScript, 599, 200);
assert.strictEqual(cleanupSuccessRun.status, 0, cleanupSuccessRun.stderr);
assert.deepStrictEqual(cleanupSuccessRun.calls, ["login", "revoke", "logout"],
  "session cleanup must only login, revoke older sessions, and logout");

const cleanupFailureRun = simulateScript(cleanupScript, 599, 403);
assert.notStrictEqual(cleanupFailureRun.status, 0, "session cleanup must fail closed when revocation is rejected");
assert.deepStrictEqual(cleanupFailureRun.calls, ["login", "revoke", "logout"],
  "failed session cleanup must still logout its fresh session and never update the app");

console.log("PASS: Rocket.Chat deployment credentials remain local, masked, and explicitly revoked");
