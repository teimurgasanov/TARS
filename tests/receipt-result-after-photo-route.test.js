const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function fastForwardPersonalReportPhotos');
const end = source.indexOf('async function publishDirectReportPhotos', start);

if (start < 0 || end <= start) throw new Error('fastForwardPersonalReportPhotos block not found');

const block = source.slice(start, end);
const receiptIndex = block.indexOf('readIndex(read, PROTECTED_ROOMS.kassa.index)');
const preclassifiedReceipt = block.indexOf('preUploadEntryMatchesPostedContent');
const publishPreclassifiedReceipt = block.indexOf('publishAcceptedReceipt(preclassifiedReceipt');
const persistPublishedResult = block.indexOf('writeIndex(persistence, PROTECTED_ROOMS.kassa.index, receiptIndex)');
const workPhotoDecision = block.indexOf('shouldForwardConfirmedWorkPhoto');

assert.ok(receiptIndex >= 0, 'fast photo route must inspect the receipt index');
assert.ok(preclassifiedReceipt > receiptIndex, 'posted content must be matched to the validated pre-upload receipt');
assert.ok(publishPreclassifiedReceipt > preclassifiedReceipt, 'validated posted receipt must publish its result immediately');
assert.ok(persistPublishedResult > publishPreclassifiedReceipt, 'published receipt result id must be persisted');
assert.ok(workPhotoDecision > preclassifiedReceipt, 'validated receipts must be blocked before work-photo fallback');
assert.match(block, /FAST_PHOTO_FORWARD_BLOCKED_PRECLASSIFIED_RECEIPT/);

const publishStart = source.indexOf('async function publishAcceptedReceipt');
const publishEnd = source.indexOf('async function rememberOrBlockPersonalImageDuplicate', publishStart);
assert.ok(publishStart >= 0 && publishEnd > publishStart, 'publishAcceptedReceipt block not found');
assert.match(source.slice(publishStart, publishEnd), /✅ ЧЕК ПРИНЯТ/);

console.log('PASS: validated receipt immediately publishes and persists accepted receipt result');
