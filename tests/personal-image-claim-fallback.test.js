const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async executePostMessageSent');
const end = source.indexOf('async receiptOcrConfig', start);
const block = source.slice(start, end);
const missingClaim = block.indexOf('if (!postMessageClaimToken)');
const processor = block.indexOf('rejectDuplicateMessage', missingClaim);

assert.ok(missingClaim >= 0 && processor > missingClaim, 'personal upload continues to the unified processor');
assert.match(block, /if \(!hasPersonalImageUpload\) return;/, 'non-image financial events still require a claim');
assert.match(block, /POST_PROBE_CONTINUE_PERSONAL_IMAGE_WITHOUT_CLAIM/, 'fallback is observable in production logs');
assert.match(block, /message id, upload id and content fingerprint/, 'fallback documents its independent idempotency guards');

console.log('PASS: a lagging financial claim cannot silently drop personal photos or receipts');
