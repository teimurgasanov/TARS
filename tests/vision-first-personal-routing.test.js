const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function personalImageKindForPreUploadUncached');
const end = source.indexOf('async function personalImageKindForPreUpload(', start);
const block = source.slice(start, end);

const visualReceipt = block.indexOf('if (aiReceipt) return "receipt"');
const visualPhoto = block.indexOf('if (aiPhoto) return "photo"');
const ocrStart = block.indexOf('if (config.apiKey && config.folderId)');
const ocrReceipt = block.indexOf('if (ocrReceipt) return "receipt"');

assert.ok(visualReceipt >= 0 && visualPhoto > visualReceipt, 'visual receipt remains safer than visual photo');
assert.ok(ocrStart > visualPhoto && ocrReceipt > ocrStart, 'OCR only runs after visual classification is inconclusive');
assert.match(block, /Vision owns the primary type decision/);

console.log('PASS: Vision is the primary personal image classifier and OCR is fallback only');
