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
assert(block.includes('!config.archiveEnabled'));
assert(block.includes('await archiveReceipt('));
assert(block.includes('archived.archiveStatus !== "stored"'));
assert(block.includes('personalReportPhotoWasForwarded'));
assert(block.includes('await archiveTextMessageOnce'));
assert(block.indexOf('await archiveReceipt(') < block.indexOf('deleteMessage(oldMessage'));
assert(block.indexOf('await archiveTextMessageOnce') < block.indexOf('deleteMessage(oldMessage'));
assert(!block.includes('removeByAssociation'));
assert(source.includes('id: "archive-personal-rooms-noon"'));
assert(source.includes('interval: "5 minutes"'));
assert(source.includes('archivePersonalRoomsAtNoonJob'));

console.log('PASS: noon archive safety invariants');
