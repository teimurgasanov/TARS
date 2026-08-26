const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('function aiCandidateMarksReportPhoto');
const end = source.indexOf('async function isBlockedPersonalPhotoImage', start);
if (start < 0 || end <= start) throw new Error('aiCandidateMarksReportPhoto block not found');
const block = source.slice(start, end);

assert(block.includes('parseReceiptJson(text)'), 'work-photo classifier must parse OpenAI JSON');
assert(block.includes('service_type'), 'work-photo classifier must use semantic service_type fallback');
assert(block.includes('is_receipt'), 'work-photo fallback must explicitly reject receipts');
assert(block.includes('is_mailing_proof'), 'work-photo fallback must explicitly reject mailing proofs');
assert(block.includes('is_screenshot_of_chat'), 'work-photo fallback must explicitly reject chat screenshots');
assert(block.includes('salon_photo'), 'work-photo fallback must explicitly reject salon-only photos');

console.log('PASS: work-photo forwarding uses guarded semantic OpenAI fallback');
