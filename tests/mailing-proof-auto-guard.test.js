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
const fallback = source.slice(source.indexOf('async function personalImageOcrFallbackKind'), source.indexOf('async function personalImageKindForPreUploadUncached'));
assert(fallback.includes('if (looksLikeMailingProofText(text)) return "mailing"'), 'the single OCR fallback must block mailing proof from photo routing');
const classifier = source.slice(source.indexOf('async function personalImageKindForPreUploadUncached'), source.indexOf('async function personalImageIsReceiptForPreUpload'));
assert(classifier.includes('const dominantKind = primaryVisionDominantKind(primaryDecision)'), 'AI mailing proof must use the normalized primary decision');
assert(classifier.includes('if (dominantKind) return dominantKind'), 'high-confidence AI mailing proof must block photo routing before OCR');
console.log('PASS: mailing screenshots stay out of result before photo fallback');
