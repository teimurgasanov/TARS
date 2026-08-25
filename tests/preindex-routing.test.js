const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('function preUploadEntryMatchesMessage');
const end = source.indexOf('async function rejectDuplicateMessage', start);
if (start < 0 || end < 0 || end <= start) throw new Error('pre-upload matcher block not found');
eval(source.slice(start, end));

const now = Date.now();
const message = { sender: { id: 'user-a' }, room: { id: 'room-a' } };
const freshReceipt = { source: 'pre', uploadAttemptKey: 'up-1', userId: 'user-a', roomId: 'room-a', uploadedAt: now - 1000 };

assert.strictEqual(preUploadEntryMatchesMessage(freshReceipt, 'up-1', message, now), true, 'fresh same upload/user/room must be reusable');
assert.strictEqual(preUploadEntryMatchesMessage({ ...freshReceipt, userId: 'user-b' }, 'up-1', message, now), false, 'foreign user must not reuse pre-entry');
assert.strictEqual(preUploadEntryMatchesMessage({ ...freshReceipt, roomId: 'room-b' }, 'up-1', message, now), false, 'foreign room must not reuse pre-entry');
assert.strictEqual(preUploadEntryMatchesMessage({ ...freshReceipt, uploadedAt: now - 31 * 60 * 1000 }, 'up-1', message, now), false, 'stale pre-entry must not be reused');
assert.strictEqual(preUploadEntryMatchesMessage({ ...freshReceipt, uploadAttemptKey: 'other' }, 'up-1', message, now), false, 'different upload must not match');

const intentGuard = source.indexOf('if (intent === "mailing") return false;');
const reuseBlock = source.indexOf('let preclassifiedRoom;', intentGuard);
assert(intentGuard >= 0 && reuseBlock > intentGuard, 'mailing must exit before pre-upload reuse');
assert(source.slice(reuseBlock, reuseBlock + 1200).includes('intent !== "mailing"'), 'reuse block must explicitly preserve mailing priority');
assert(source.includes('protectedRoom = preclassifiedRoom || await protectedRoomForPersonalFile'), 'fallback classification must remain');

console.log('PASS: scoped pre-upload routing behavior');
