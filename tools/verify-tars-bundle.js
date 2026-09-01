"use strict";

const fs = require("fs");
const vm = require("vm");

const APPROVED_EXTERNALS = Object.freeze([
  "crypto"
]);

function inspectBundleSource(source) {
  if (typeof source !== "string" || source.length === 0) {
    throw new TypeError("bundle source must be a non-empty string");
  }

  new vm.Script(source, { filename: "TarsReportApp.js" });

  const requirePattern = /require\((["'])([^"']+)\1\)/g;
  const externalRequires = [];
  const relativeRequires = [];
  let match;
  while ((match = requirePattern.exec(source)) !== null) {
    const moduleName = match[2];
    if (moduleName.startsWith("./") || moduleName.startsWith("../")) {
      relativeRequires.push(moduleName);
    } else if (!externalRequires.includes(moduleName)) {
      externalRequires.push(moduleName);
    }
  }
  externalRequires.sort();

  const invalidExternals = externalRequires.filter((moduleName) => (
    !APPROVED_EXTERNALS.includes(moduleName) &&
    !moduleName.startsWith("@rocket.chat/apps-engine/definition/")
  ));

  const checks = Object.freeze({
    tarsExport: /(?:exports\.TarsReportApp|module\.exports\s*=\s*\{TarsReportApp:)/.test(source),
    shadowContract: source.includes("scanner2-shadow-recorder-v1"),
    shadowTokenizer: source.includes("createHmac"),
    shadowRecorder: source.includes("WRITE_TIMEOUT")
  });

  return Object.freeze({
    checks,
    relativeRequires: Object.freeze(relativeRequires.slice()),
    externalRequires: Object.freeze(externalRequires.slice()),
    invalidExternals: Object.freeze(invalidExternals.slice())
  });
}

function assertBundlePolicy(source) {
  const inspection = inspectBundleSource(source);
  Object.entries(inspection.checks).forEach(([name, passed]) => {
    if (!passed) throw new Error("bundle check failed: " + name);
  });
  if (inspection.relativeRequires.length > 0) {
    throw new Error("bundle contains unresolved relative require(): " + inspection.relativeRequires.join(", "));
  }
  if (inspection.invalidExternals.length > 0) {
    throw new Error("bundle contains unapproved externals: " + inspection.invalidExternals.join(", "));
  }
  return inspection;
}

if (require.main === module) {
  const bundlePath = process.argv[2];
  if (!bundlePath) throw new Error("usage: node tools/verify-tars-bundle.js <bundle>");
  const inspection = assertBundlePolicy(fs.readFileSync(bundlePath, "utf8"));
  process.stdout.write("BUNDLE_POLICY=PASS\n");
  process.stdout.write("EXTERNALS=" + JSON.stringify(inspection.externalRequires) + "\n");
}

module.exports = {
  APPROVED_EXTERNALS,
  inspectBundleSource,
  assertBundlePolicy
};
