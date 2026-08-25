const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function personalImageKindForPreUpload');
const end = source.indexOf('async function personalImageIsReceiptForPreUpload', start);
if (start < 0 || end <= start) throw new Error('personalImageKindForPreUpload block not found');
const block = source.slice(start, end);

assert(block.includes('let ocrHasText = false;'), 'OCR text fallback state missing');
assert(block.includes('if (String(text || "").trim()) ocrHasText = true;'), 'OCR text fallback is not populated');

const aiReceipt = block.indexOf('if (aiReceipt) return "receipt"');
const ocrReceipt = block.indexOf('if (ocrReceipt) return "receipt"');
const aiPhoto = block.indexOf('if (aiPhoto) return "photo"');
const aiFallback = block.indexOf('if (aiChecked) return "receipt"');
const ocrTextFallback = block.indexOf('if (ocrHasText) return "receipt"');

for (const [name, value] of Object.entries({aiReceipt, ocrReceipt, aiPhoto, aiFallback, ocrTextFallback})) {
  assert(value >= 0, `${name} branch not found`);
}
assert(aiReceipt < ocrReceipt, 'explicit OpenAI receipt should route immediately');
assert(ocrReceipt < aiPhoto, 'strong OCR receipt must keep priority over generic AI photo');
assert(aiPhoto < aiFallback, 'explicit OpenAI work-photo classification must still route as photo');
assert(aiFallback < ocrTextFallback, 'ambiguous Vision result should reach strict receipt validation before generic OCR-text fallback');

console.log('PASS: Vision ambiguity and OCR text fall back to strict receipt validation without weakening protected OCR priority');
