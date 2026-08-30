const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function personalImageKindForPreUpload');
const end = source.indexOf('async function personalImageIsReceiptForPreUpload', start);
if (start < 0 || end <= start) throw new Error('personalImageKindForPreUpload block not found');
const block = source.slice(start, end);

const ocrMailing = block.indexOf('if (ocrMailing) return "mailing"');
const aiMailing = block.indexOf('if (aiMailing) return "mailing"');
const aiReceipt = block.indexOf('if (aiReceipt) return "receipt"');
const ocrReceipt = block.indexOf('if (ocrReceipt) return "receipt"');
const aiPhoto = block.indexOf('if (aiPhoto) return "photo"');

for (const [name, value] of Object.entries({ocrMailing, aiMailing, aiReceipt, ocrReceipt, aiPhoto})) {
  assert(value >= 0, `${name} branch not found`);
}
assert(aiMailing < aiReceipt, 'visual mailing must keep priority over visual receipt');
assert(aiReceipt < aiPhoto, 'visual receipt must beat visual work photo');
assert(aiPhoto < ocrMailing, 'visual result must take priority over OCR fallback');
assert(ocrMailing < ocrReceipt, 'OCR mailing fallback must keep priority over OCR receipt');

console.log('PASS: receipt routing beats generic photo classification');
