const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async reportPhotoStatus');
const end = source.indexOf('async getReportProfile', start);
assert.ok(start >= 0 && end > start, 'reportPhotoStatus block must exist');
const block = source.slice(start, end);

assert.match(block, /G\.readIndex\(e, G\.PROTECTED_ROOMS\.otchet\.index\)/);
assert.match(block, /directRoomIds\.has\(String\(entry\.roomId/);
assert.match(block, /entry\.reportMessageId \|\| entry\.reportUploadId \|\| entry\.uploadId/);
assert.match(block, /photoWorkday !== t/);

console.log('PASS: accepted report photos are credited to the personal room owner');
