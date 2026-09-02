"use strict";

const fs = require("fs");
const Module = require("module");
const os = require("os");
const path = require("path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..", "..");

class RocketChatAssociationRecord {
  constructor(model, key) {
    this.model = model;
    this.key = key;
  }
}

function rocketChatStub(request) {
  if (request.endsWith("/App")) return { App: class App {} };
  if (request.endsWith("/api")) return { ApiEndpoint: class ApiEndpoint {} };
  if (request.endsWith("/metadata")) {
    return {
      RocketChatAssociationModel: { MISC: "MISC" },
      RocketChatAssociationRecord
    };
  }
  if (request.endsWith("/exceptions")) {
    return { FileUploadNotAllowedException: class FileUploadNotAllowedException extends Error {} };
  }
  if (request.endsWith("/rooms")) {
    return { RoomType: { CHANNEL: "c", DIRECT_MESSAGE: "d", PRIVATE_GROUP: "p" } };
  }
  if (request.endsWith("/settings")) {
    return { SettingType: { PASSWORD: "PASSWORD", STRING: "STRING", NUMBER: "NUMBER", BOOLEAN: "BOOLEAN" } };
  }
  if (request.endsWith("/scheduler")) return { StartupType: { RECURRING: "RECURRING" } };
  if (request.endsWith("/uikit")) return { UIKitSurfaceType: { MODAL: "modal" } };
  return {};
}

function withRocketChatStubs(load) {
  const originalLoad = Module._load;
  Module._load = function mockedModuleLoad(request, parent, isMain) {
    if (request.startsWith("@rocket.chat/apps-engine/definition/")) return rocketChatStub(request);
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return load();
  } finally {
    Module._load = originalLoad;
  }
}

function buildCanonicalBundle() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tars-canonical-runtime-"));
  const bundlePath = path.join(temporaryDirectory, "TarsReportApp.js");
  esbuild.buildSync({
    entryPoints: [path.join(root, "tools", "tars-build-entry.js")],
    bundle: true,
    minify: true,
    platform: "node",
    target: ["node20"],
    external: ["@rocket.chat/apps-engine/*"],
    outfile: bundlePath
  });
  return {
    bundlePath,
    cleanup() {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  };
}

function loadCanonicalBundle(bundlePath) {
  delete require.cache[require.resolve(bundlePath)];
  return withRocketChatStubs(() => require(bundlePath));
}

function loadTrackedAppWithGuard() {
  const sourcePath = path.join(root, "TarsReportApp.js");
  const instrumentedPath = path.join(root, `.tars-runtime-${process.pid}-${Date.now()}.js`);
  const source = fs.readFileSync(sourcePath, "utf8");
  fs.writeFileSync(instrumentedPath, `${source}\nmodule.exports.__testGuard = G;\n`, "utf8");
  try {
    delete require.cache[require.resolve(instrumentedPath)];
    return withRocketChatStubs(() => require(instrumentedPath));
  } finally {
    delete require.cache[instrumentedPath];
    fs.unlinkSync(instrumentedPath);
  }
}

function settingsReader(values) {
  return {
    getEnvironmentReader() {
      return {
        getSettings() {
          return {
            async getValueById(id) {
              return Object.prototype.hasOwnProperty.call(values, id) ? values[id] : undefined;
            }
          };
        }
      };
    }
  };
}

async function readReceiptOcrConfigFromCanonicalBundle(values) {
  const build = buildCanonicalBundle();
  try {
    const loaded = loadCanonicalBundle(build.bundlePath);
    if (!loaded || typeof loaded.TarsReportApp !== "function") {
      throw new Error("canonical bundle does not export TarsReportApp");
    }
    return await loaded.TarsReportApp.prototype.receiptOcrConfig.call({}, settingsReader(values));
  } finally {
    build.cleanup();
  }
}

module.exports = {
  RocketChatAssociationRecord,
  buildCanonicalBundle,
  loadCanonicalBundle,
  loadTrackedAppWithGuard,
  readReceiptOcrConfigFromCanonicalBundle,
  settingsReader,
  withRocketChatStubs
};
