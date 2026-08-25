const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function personalImageKindForPreUpload');
const end = source.indexOf('async function personalImageIsReceiptForPreUpload', start);
if (start < 0 || end <= start) throw new Error('personalImageKindForPreUpload block not found');
const block = source.slice(start, end);

// OpenAI Vision is the primary semantic classifier when it returns a usable result.
const aiReceipt = block.indexOf('if (aiReceipt) return "receipt"');
const aiPhoto = block.indexOf('if (aiPhoto) return "photo"');
const ocrReceipt = block.indexOf('if (ocrReceipt) return "receipt"');
assert(aiReceipt >= 0 && aiPhoto >= 0 && ocrReceipt >= 0, 'expected routing branches missing');
assert(aiReceipt < aiPhoto, 'AI receipt must beat AI photo');
assert(aiPhoto < ocrReceipt, 'when OpenAI explicitly sees a work photo, OCR text must not override it');

// A non-empty OCR text fallback must go to strict receipt validation rather than silently becoming a work photo.
assert(block.includes('if (ocrHasText) return "receipt"'), 'OCR text fallback must route to strict receipt validation');

console.log('PASS: OpenAI Vision leads semantic routing; OCR text falls back to strict receipt validation');
