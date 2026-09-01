"use strict";

// Build-only imports. They guarantee that the tested Scanner 2.0 shadow
// infrastructure is present in the single-file package without activating it.
const shadowContract = require("../scanner2/shadow-contract");
const shadowTokenizer = require("../scanner2/shadow-tokenizer");
const shadowRecorder = require("../scanner2/shadow-recorder");

void shadowContract.validateShadowSnapshot;
void shadowTokenizer.createShadowTokenizer;
void shadowRecorder.safeShadowRecord;

const productionApp = require("../TarsReportApp.js");

module.exports = {
  TarsReportApp: productionApp.TarsReportApp
};
