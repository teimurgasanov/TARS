const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

const cStart = source.indexOf('async function personalImageKindForPreUpload');
const cEnd = source.indexOf('async function personalImageIsReceiptForPreUpload', cStart);
if (cStart < 0 || cEnd <= cStart) throw new Error('classifier block not found');
const classifier = source.slice(cStart, cEnd);

const aiMailing = classifier.indexOf('if (aiMailing) return "mailing"');
const aiReceipt = classifier.indexOf('if (aiReceipt) return "receipt"');
const aiPhoto = classifier.indexOf('if (aiPhoto) return "photo"');
const ocrMailing = classifier.indexOf('if (ocrMailing) return "mailing"');
const ocrReceipt = classifier.indexOf('if (ocrReceipt) return "receipt"');
const unknown = classifier.indexOf('return "unknown";');
for (const [name, pos] of Object.entries({aiMailing, aiReceipt, aiPhoto, ocrMailing, ocrReceipt, unknown})) {
  assert(pos >= 0, `${name} branch missing`);
}
assert(aiMailing < aiReceipt && aiReceipt < aiPhoto, 'OpenAI semantic decisions must be explicit and ordered');
assert(aiPhoto < ocrMailing && ocrMailing < ocrReceipt, 'OCR must be fallback only after OpenAI has no explicit class');
assert(ocrReceipt < unknown, 'unclassified images must become explicit unknown');

const pStart = source.indexOf('async function protectedRoomForPersonalFile');
const pEnd = source.indexOf('\n    async function ', pStart + 10);
if (pStart < 0 || pEnd <= pStart) throw new Error('personal protected-room block not found');
const protectedBlock = source.slice(pStart, pEnd);
assert(protectedBlock.includes('if (kind === "unknown")'), 'unknown must be handled explicitly');
assert(!protectedBlock.includes('isBlockedPersonalPhotoImage(file, content'), 'legacy second classifier must not run after clean classifier');
assert(!protectedBlock.includes('defaulting to report photo'), 'unknown must not default to report photo');

console.log('PASS: clean OpenAI-first classifier with OCR fallback and explicit unknown');
