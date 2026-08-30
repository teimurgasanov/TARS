// Mailing screenshots must never reach the automatic work-photo fallback.
const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const a = source.indexOf('function looksLikeMailingProofText');
const b = source.indexOf('async function isReceiptLikeImage', a);
assert(a >= 0 && b > a, 'mailing proof detector must exist');
const helper = source.slice(a, b);
assert(helper.includes('directUi && sentState'), 'Direct/Instagram UI with a sent state must be classified as mailing proof');
assert(helper.includes('repeatedStates && (directUi || accountList)'), 'repeated mailing states must remain protected');
const classifier = source.slice(source.indexOf('async function personalImageKindForPreUpload'), source.indexOf('async function personalImageIsReceiptForPreUpload'));
assert(classifier.includes('if (ocrMailing) return "mailing"'), 'OCR mailing proof must block photo routing');
assert(classifier.includes('if (aiMailing) return "mailing"'), 'AI mailing proof must block photo routing');
console.log('PASS: mailing screenshots stay out of result before photo fallback');
