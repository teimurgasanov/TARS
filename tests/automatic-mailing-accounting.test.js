// The detector remains reusable, but a new personal image may enter mailing
// accounting only after the explicit compact type selection.
const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const handlerStart = source.indexOf('async handleManualImageTypeSelection');
const handlerEnd = source.indexOf('async removeUploadTypeMenu', handlerStart);
const handler = source.slice(handlerStart, handlerEnd);
assert(source.includes('async function detectPersonalMailingProof'), 'automatic mailing detector must exist');
assert.match(handler, /routedType === "mailing"/);
assert.match(handler, /await G\.detectPersonalMailingProof\(sourceMessage/);
assert.match(handler, /source: "manual-image-selection"/);
assert.match(handler, /const duplicate = [\s\S]*if \(!duplicate\) await persistence\.createWithAssociation/);
const mailingBranch = handler.slice(handler.indexOf('routedType === "mailing"'));
assert.doesNotMatch(mailingBranch, /processPersonalMediaV2\(sourceMessage/);
assert.doesNotMatch(mailingBranch, /fastForwardPersonalReportPhotos\(sourceMessage/);
console.log('PASS: mailing accounting is entered explicitly and remains idempotent');
