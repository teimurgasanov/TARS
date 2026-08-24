const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

const summaryStart = source.indexOf('async function confirmedTransferSummaryForUser');
const summaryEnd = source.indexOf('function masterTransferSummaryAssociation', summaryStart);
if (summaryStart < 0 || summaryEnd <= summaryStart) {
  throw new Error('confirmedTransferSummaryForUser block not found');
}
const summaryBlock = source.slice(summaryStart, summaryEnd);
assert(!summaryBlock.includes('chatDeletedAt'));
assert(!summaryBlock.includes('archiveStatus'));

const cleanupStart = source.indexOf('async function archiveAndCleanupPersonalRoomAtNoon');
const cleanupEnd = source.indexOf('async function cleanupExpiredMasterRoom', cleanupStart);
if (cleanupStart < 0 || cleanupEnd <= cleanupStart) {
  throw new Error('archiveAndCleanupPersonalRoomAtNoon block not found');
}
const cleanupBlock = source.slice(cleanupStart, cleanupEnd);
assert(cleanupBlock.includes('receiptEntry.chatDeletedAt = deletedAt'));
assert(cleanupBlock.includes('await writeIndex(persistence, PROTECTED_ROOMS.kassa.index, receiptIndex)'));
assert(!cleanupBlock.includes('receiptIndex.photos ='));
assert(!cleanupBlock.includes('.splice('));
assert(!cleanupBlock.includes('removeByAssociation'));
assert(!cleanupBlock.includes('receiptAmount = 0'));
assert(!cleanupBlock.includes('receiptIdentity = ""'));

console.log('PASS: noon cleanup preserves financial receipt index');
