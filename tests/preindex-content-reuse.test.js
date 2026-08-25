const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('function preUploadEntryMatchesMessage');
const end = source.indexOf('async function rejectDuplicateMessage', start);
if (start < 0 || end < 0 || end <= start) throw new Error('pre-upload matcher block not found');
eval(source.slice(start, end));

assert.strictEqual(typeof preUploadEntryMatchesPostedContent, 'function', 'exact-content pre-upload matcher must exist');

const now = Date.now();
const message = { sender: { id: 'user-a' }, room: { id: 'room-a' } };
const freshReceipt = {
  source: 'pre',
  exact: 'sha256:receipt-a',
  uploadAttemptKey: 'pre-temp-id',
  userId: 'user-a',
  roomId: 'room-a',
  uploadedAt: now - 1000,
  receiptDate: '2026-08-25',
  receiptAmount: 2000,
  validationVersion: 10
};

assert.strictEqual(
  preUploadEntryMatchesPostedContent(freshReceipt, 'sha256:receipt-a', message, now),
  true,
  'fresh validated pre-upload receipt must be reusable even when Rocket.Chat changes upload id after publication'
);
assert.strictEqual(preUploadEntryMatchesPostedContent({ ...freshReceipt, userId: 'user-b' }, 'sha256:receipt-a', message, now), false, 'foreign user must not reuse exact pre-entry');
assert.strictEqual(preUploadEntryMatchesPostedContent({ ...freshReceipt, roomId: 'room-b' }, 'sha256:receipt-a', message, now), false, 'foreign room must not reuse exact pre-entry');
assert.strictEqual(preUploadEntryMatchesPostedContent({ ...freshReceipt, uploadedAt: now - 31 * 60 * 1000 }, 'sha256:receipt-a', message, now), false, 'stale pre-entry must not be reused');
assert.strictEqual(preUploadEntryMatchesPostedContent(freshReceipt, 'sha256:other', message, now), false, 'different image content must not reuse pre-entry');

const postLoop = source.indexOf('for (const messageFile of imageFiles)');
const classify = source.indexOf('protectedRoom = preclassifiedRoom || await protectedRoomForPersonalFile', postLoop);
if (postLoop < 0 || classify < 0) throw new Error('personal post routing block not found');
const routingBlock = source.slice(postLoop, classify);
assert(routingBlock.includes('const postedExact = exactHash(content);'), 'post route must compute exact content before fallback classification');
assert(routingBlock.includes('preUploadEntryMatchesPostedContent(entry, postedExact, message)'), 'post route must reuse fresh pre-upload classification by exact content');

console.log('PASS: fresh validated receipt survives Rocket.Chat upload-id remap and reaches receipt post-processing');
