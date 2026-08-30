const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async cleanupExpiredReportMedia');
const end = source.indexOf('async forwardPendingReportPhotosJob', start);
assert.ok(start >= 0 && end > start, 'report media cleanup block must exist');
const block = source.slice(start, end);

assert.match(source, /REPORT_MEDIA_RETENTION_MS = 60 \* 24 \* 60 \* 60 \* 1e3/);
assert.match(block, /G\.PROTECTED_ROOMS\.otchet\.index/);
assert.match(block, /entry\.messageId, entry\.reportMessageId/);
assert.match(block, /entry\.mediaDeletedAt = now/);
assert.match(block, /mailingProofIndexAssociation\(workday\)/);
assert.match(block, /mailing-media-cleaned:/);
assert.doesNotMatch(block, /removeByAssociation/);

console.log('PASS: work photos and mailing screenshots are deleted after 60 days while indexes remain');
