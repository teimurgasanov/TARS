const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async executePostMessageSent');
const end = source.indexOf('async receiptOcrConfig', start);

if (start < 0 || end <= start) throw new Error('executePostMessageSent block not found');

const block = source.slice(start, end);
const photo = block.indexOf('fastForwardPersonalReportPhotos');
const claim = block.indexOf('claimPostMessage');
const financial = block.indexOf('rejectDuplicateMessage');

assert.ok(photo >= 0, 'photo route exists');
assert.ok(claim > photo, 'claim cannot suppress photo route');
assert.ok(financial > claim, 'financial duplicate processing remains behind claim');
assert.ok(block.includes('completePostMessageClaim'), 'successful financial claim is completed');

console.log('PASS: personal photo forwarding precedes financial claim while financial processing stays claimed');
