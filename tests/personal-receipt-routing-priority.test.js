const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function personalImageKindForPreUpload');
const end = source.indexOf('async function personalImageIsReceiptForPreUpload', start);
if (start < 0 || end <= start) throw new Error('personalImageKindForPreUpload block not found');
const block = source.slice(start, end);

const primaryRequest = block.indexOf('primaryVisionDecisionForImage');
const primaryDecision = block.indexOf('primaryVisionDominantKind(primaryDecision)');
const primaryReturn = block.indexOf('if (dominantKind) return dominantKind');
const ocrFallback = block.indexOf('personalImageOcrFallbackKind');

for (const [name, value] of Object.entries({primaryRequest, primaryDecision, primaryReturn, ocrFallback})) {
  assert(value >= 0, `${name} branch not found`);
}
assert(primaryRequest < primaryDecision && primaryDecision < primaryReturn, 'one normalized primary Vision decision must own confident routing');
assert(primaryReturn < ocrFallback, 'visual result must take priority over the single OCR fallback');
const normalizerStart = source.indexOf('function primaryVisionDecisionFromCandidate');
const normalizerEnd = source.indexOf('function primaryVisionDominantKind', normalizerStart);
const normalizer = source.slice(normalizerStart, normalizerEnd);
assert.match(normalizer, /if \(financialBlock && kind === "work_photo"\) kind = isBanking \? "bank_transfer" : hasReceiptLayout \? "receipt" : "document"/, 'financial safety flags must beat a conflicting work-photo label');

console.log('PASS: receipt routing beats generic photo classification');
