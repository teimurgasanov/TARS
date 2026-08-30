const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async executePostMessageSent');
const end = source.indexOf('async receiptOcrConfig', start);

if (start < 0 || end <= start) throw new Error('executePostMessageSent block not found');

const block = source.slice(start, end);
const claim = block.indexOf('claimPostMessage');
const financial = block.indexOf('rejectDuplicateMessage');

assert.ok(claim >= 0, 'post-message claim exists');
assert.ok(financial > claim, 'unified image processing remains behind claim');
assert.ok(!block.includes('fastForwardPersonalReportPhotos'), 'largest-file-only photo pre-pass is disabled');
assert.ok(block.includes('explicitPhotoIntent ? "photo" : ""'), 'explicit photo choice uses the unified image pipeline');
assert.ok(block.includes('completePostMessageClaim'), 'successful financial claim is completed');

console.log('PASS: every personal image uses the unified claimed pipeline');
