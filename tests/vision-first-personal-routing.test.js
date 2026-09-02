const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function personalImageKindForPreUploadUncached');
const end = source.indexOf('async function personalImageKindForPreUpload(', start);
const block = source.slice(start, end);

const visualRequest = block.indexOf('primaryVisionDecisionForImage');
const visualDecision = block.indexOf('primaryVisionDominantKind(primaryDecision)');
const visualReturn = block.indexOf('if (dominantKind) return dominantKind');
const ocrStart = block.indexOf('if (config.apiKey && config.folderId)');
const ocrReceipt = block.indexOf('if (ocrReceipt) return "receipt"');

assert.ok(visualRequest >= 0 && visualDecision > visualRequest && visualReturn > visualDecision,
  'one normalized primary Vision decision must own high-confidence routing');
assert.ok(ocrStart > visualReturn && ocrReceipt > ocrStart, 'OCR only runs after visual classification is inconclusive');
assert.match(block, /Vision owns the primary type decision/);

console.log('PASS: Vision is the primary personal image classifier and OCR is fallback only');
