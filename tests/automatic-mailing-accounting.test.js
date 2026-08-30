// Recognized mailing screenshots must be recorded without a button press.
const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('TarsReportApp.js', 'utf8');
assert(source.includes('async function detectPersonalMailingProof'), 'automatic mailing detector must exist');
assert(source.includes('personalImageKindForPreUpload(file, content, http, config, logger) === "mailing"'), 'only classified mailing proofs may be recorded');
assert(source.includes('source: "automatic-mailing-proof"'), 'automatic proof must be persisted in the daily mailing index');
assert(source.includes('await G.detectPersonalMailingProof(e, n, t, i, this.getLogger())'), 'personal image events must run automatic mailing accounting');
assert(source.includes('if (!alreadyRecorded)'), 'repeated events must not duplicate mailing records or confirmations');
console.log('PASS: mailing proofs are accounted automatically without a button');
