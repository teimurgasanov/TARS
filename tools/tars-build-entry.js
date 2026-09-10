"use strict";

// Build-only imports. They guarantee that the tested Scanner 2.0 shadow
// infrastructure is present in the single-file package without activating it.
const shadowContract = require("../scanner2/shadow-contract");
const shadowTokenizer = require("../scanner2/shadow-tokenizer");
const shadowRecorder = require("../scanner2/shadow-recorder");
const shadowSampling = require("../scanner2/shadow-sampling");
const pasContracts = require("../pas/contracts");
const pasCallerSeam = require("../pas/caller-seam");

void shadowContract.validateShadowSnapshot;
void shadowTokenizer.createShadowTokenizer;
void shadowRecorder.safeShadowRecord;
void shadowSampling.shouldSampleShadowCase;
void pasContracts.buildConfirmPaymentCommand;
void pasCallerSeam.confirmPaymentThroughAuthority;

const productionApp = require("../TarsReportApp.js");

module.exports = {
  TarsReportApp: productionApp.TarsReportApp
};
