const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function archiveAndCleanupPersonalRoomAtNoon');
const end = source.indexOf('async function cleanupExpiredMasterRoom', start);

if (start < 0 || end < 0 || end <= start) {
  throw new Error('archiveAndCleanupPersonalRoomAtNoon block not found');
}

const block = source.slice(start, end);
assert(block.includes('!persistence'));
assert(block.includes('!PERSONAL_CHAT_ARCHIVING_ENABLED'));
assert(block.includes('!config.archiveEnabled'));
assert(block.includes('await archiveReceipt('));
assert(block.includes('archived.archiveStatus !== "stored"'));
assert(block.includes('personalReportPhotoWasForwarded'));
assert(block.includes('await archiveTextMessageOnce'));
assert(block.indexOf('await archiveReceipt(') < block.indexOf('deleteMessage(oldMessage'));
assert(block.indexOf('await archiveTextMessageOnce') < block.indexOf('deleteMessage(oldMessage'));
assert(!block.includes('removeByAssociation'));
assert(!source.includes('id: "archive-personal-rooms-noon"'));
assert(source.includes('const PERSONAL_CHAT_ARCHIVING_ENABLED = false'));
assert(source.includes('async archivePersonalRoomsAtNoonJob(e, n, t, s, r) {\n    return 0;'));
const cleanupStart = source.indexOf('async function cleanupExpiredMasterRoom');
const cleanupEnd = source.indexOf('async function cleanupArchivedReceiptMessages', cleanupStart);
assert(source.slice(cleanupStart, cleanupEnd).includes('if (!PERSONAL_CHAT_ARCHIVING_ENABLED) return ensurePersonalChatDaySeparator'));
assert(source.includes('id: "separate-personal-chat-days"'));
assert(source.includes('async separatePersonalChatDaysJob'));
assert(source.includes('──────── ${displayDate(date)} ────────'));

console.log('PASS: personal chat archiving is disabled while calendar days stay separated');
