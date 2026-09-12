"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { assertBundlePolicy } = require("../tools/verify-tars-bundle");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "TarsReportApp.js");
const manifestPath = path.join(root, "app.json");
const buildDir = path.join(root, ".build");
const expectedSourceSha = "ac309b3207a2cc3703397010baa43db73b98f1382555124751122cb8fd306b1e";
const expectedManifestSha = "07e8c27709c789a8a08b3d8ef90157f9c69b4227712c5b5fe0543d06f0f678e7";
const expectedEntries = ["app.json", "TarsReportApp.js", "en.json", "ru.json", "icon.png"];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileSha(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function gitStatus() {
  return execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" });
}

function runBuild() {
  execFileSync(path.join(root, "build-tars.sh"), [], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe"
  });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return path.join(root, "tars-report_" + manifest.version + ".zip");
}

function readZip(zipPath) {
  const entries = execFileSync("unzip", ["-Z1", zipPath], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
  const bundle = execFileSync("unzip", ["-p", zipPath, "TarsReportApp.js"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  const manifest = execFileSync("unzip", ["-p", zipPath, "app.json"], {
    cwd: root,
    encoding: null,
    maxBuffer: 1024 * 1024
  });
  return { entries, bundle, manifest };
}

const initialStatus = gitStatus();
const sourceBefore = fileSha(sourcePath);
const manifestBefore = fileSha(manifestPath);
assert.strictEqual(sourceBefore, expectedSourceSha, "tracked TarsReportApp.js must match the Stage 3B baseline");
assert.strictEqual(manifestBefore, expectedManifestSha, "app.json must match the Stage 3B baseline");

const installedEsbuild = require("esbuild/package.json").version;
assert.strictEqual(installedEsbuild, "0.12.29", "packaging must use the pinned esbuild version");

const productionSource = fs.readFileSync(sourcePath, "utf8");
assert.match(productionSource, /safeShadowRecord\s*\(/, "production source must include the fail-open RECORD_ONLY recorder call");
assert.match(productionSource, /createShadowTokenizer\s*\(/, "production source must tokenize runtime shadow records");
assert.match(productionSource, /shouldSampleShadowCase\s*\(/, "production source must gate RECORD_ONLY writes through deterministic sampling");
assert.match(productionSource, /scanner2-shadow:v1:index/, "production source must maintain an isolated bounded-retention index");
assert.match(productionSource, /PERSONAL_IMAGE_PIPELINE_V2/, "production source must include privacy-safe source/MIME telemetry");
assert.match(productionSource, /MANUAL_IMAGE_SELECTION_V1/, "production source must include privacy-safe manual selection telemetry");
assert.match(productionSource, /personal-image-router-v3/, "production source must load the isolated primary Vision type router");
assert.match(productionSource, /intentCount !== 1/, "production source must require exactly one preselected upload type");
assert.match(productionSource, /personal-image-selector:v3:/, "production source must persist one standalone personal image selector");
assert.match(productionSource, /await this\.sendPersonalImageSelector\(e, n, t, s\);/, "personal room refresh must publish the selector without a command");
assert.doesNotMatch(
  productionSource.slice(productionSource.indexOf("async executePostMessageSent"), productionSource.indexOf("async receiptOcrConfig")),
  /ensureManualImageSelection/,
  "production execution must not use the old post-upload classifier selection"
);
assert.match(productionSource, /id:\s*"scanner2_shadow_sample_percent"[\s\S]*packageValue:\s*"0"/,
  "packaged sampling must remain write-disabled by default");
["evaluateRules", "resolveConflicts", "makeDecision", "runOfflineComparison", "runOfflineDataset"].forEach((name) => {
  assert.doesNotMatch(productionSource, new RegExp(`\\b${name}\\s*\\(`), "production source must not run Scanner 2.0 decision logic: " + name);
});

execFileSync(process.execPath, [path.join(root, "tests", "personal-image-selector-visible.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});

const entrySource = fs.readFileSync(path.join(root, "tools", "tars-build-entry.js"), "utf8");
assert.match(entrySource, /shadow-sampling/, "build entry must include tested sampling and retention helpers");
assert.doesNotMatch(entrySource, /safeShadowRecord\s*\(/, "build entry must not call Shadow Recorder");
assert.doesNotMatch(entrySource, /createShadowTokenizer\s*\(/, "build entry must not create a shadow tokenizer");

const firstZip = runBuild();
assert.ok(fs.existsSync(firstZip), "build must create the versioned ZIP");
assert.strictEqual(fs.existsSync(buildDir), false, "temporary build directory must be removed after success");
const first = readZip(firstZip);
assert.deepStrictEqual(first.entries, expectedEntries, "ZIP must contain exactly the five production files");
assert.strictEqual(sha256(first.manifest), manifestBefore, "packaged app.json must equal the tracked manifest");
const firstInspection = assertBundlePolicy(first.bundle);
assert.deepStrictEqual(firstInspection.relativeRequires, [], "bundle must not contain unresolved relative imports");
assert.deepStrictEqual(firstInspection.invalidExternals, [], "bundle must contain only approved externals");

execFileSync(process.execPath, [path.join(root, "tests", "scanner2-shadow-config-runtime.test.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "scanner2-receipt-running-total-runtime.test.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "scanner2-personal-rejected-control-runtime.test.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "receipt-date-early-mismatch.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "receipt-primary-reuse-status.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "work-photo-diagnostics.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "work-photo-source-mime-telemetry.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "manual-image-type-selection.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "manual-image-selection-telemetry.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "vision-dominant-image-routing.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "vision-high-confidence-authority.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "personal-image-router-v3.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
execFileSync(process.execPath, [path.join(root, "tests", "preselected-image-type-routing.runtime.js")], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});

const firstBundleSha = sha256(first.bundle);
const secondZip = runBuild();
assert.strictEqual(fs.existsSync(buildDir), false, "temporary build directory must be removed after repeat build");
const second = readZip(secondZip);
assert.deepStrictEqual(second.entries, first.entries, "repeat build must preserve package structure");
assert.strictEqual(sha256(second.bundle), firstBundleSha, "repeat build must produce equivalent executable content");
assert.strictEqual(sha256(second.manifest), sha256(first.manifest), "repeat build must preserve manifest content");

execFileSync("unzip", ["-t", secondZip], { cwd: root, encoding: "utf8" });
assert.strictEqual(fileSha(sourcePath), sourceBefore, "build must not alter tracked TarsReportApp.js");
assert.strictEqual(fileSha(manifestPath), manifestBefore, "build must not alter app.json");
assert.strictEqual(gitStatus(), initialStatus, "build must not create or modify visible git artifacts");

console.log("PASS: deterministic single-file packaging includes fail-open RECORD_ONLY capture and remains policy-safe");
