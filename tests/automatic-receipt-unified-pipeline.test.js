const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const rejectStart = source.indexOf('async function rejectDuplicateMessage');
const rejectEnd = source.indexOf('function isTodayTransferSumRequest', rejectStart);
const executeStart = source.indexOf('async executePostMessageSent');
const executeEnd = source.indexOf('async receiptOcrConfig', executeStart);
const rejectBlock = source.slice(rejectStart, rejectEnd);
const executeBlock = source.slice(executeStart, executeEnd);

assert.ok(rejectStart >= 0 && rejectEnd > rejectStart, 'unified image processor exists');
assert.match(rejectBlock, /for \(const messageFile of imageFiles\)/, 'every attachment is inspected');
assert.match(rejectBlock, /protectedRoomForPersonalFile/, 'automatic content classification remains enabled');
assert.match(rejectBlock, /return acceptedEntries\.length \? "processed" : false/, 'accepted receipts stop fallback prompts');
assert.doesNotMatch(executeBlock, /fastForwardPersonalReportPhotos/, 'largest-only photo pre-pass cannot consume receipt batches');
assert.match(executeBlock, /processPersonalMediaV2\(e, n, s, r, this\.getLogger\(\), t, i, explicitTransferIntent \? "receipt" : explicitPhotoIntent \? "photo" : "", Boolean\(postMessageClaimToken\)\)/, 'all personal images enter media-v2 and only the claim winner may publish processing status');
assert.doesNotMatch(executeBlock, /G\.rejectDuplicateMessage/, 'the event handler cannot bypass media-v2');

console.log('PASS: receipts and photos are automatically processed through one all-file pipeline');
