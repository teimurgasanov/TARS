const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function cleanupExpiredMasterRoom');
const end = source.indexOf('async function cleanupArchivedReceiptMessages', start);

if (start < 0 || end < 0 || end <= start) {
  throw new Error('cleanupExpiredMasterRoom block not found');
}

const block = source.slice(start, end);
assert(block.includes('if (!persistence || !config || !config.archiveEnabled) return 0;'));
assert(block.includes('await archiveReceipt('));
assert(block.includes('archiveStatus !== "stored"'));
assert(block.includes('photoForwarded'));
assert(block.indexOf('await archiveReceipt(') < block.indexOf('deleteMessage(oldMessage')));
assert(!block.includes('removeByAssociation'));
assert(source.includes('id: "archive-personal-rooms-noon"'));
assert(source.includes('interval: "5 minutes"'));
assert(source.includes('archivePersonalRoomsAtNoonJob'));

console.log('PASS: noon archive safety invariants');
