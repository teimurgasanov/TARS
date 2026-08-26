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

const receiptCleanupStart = source.indexOf('async function cleanupArchivedReceiptMessages');
const receiptCleanupEnd = source.indexOf('async function cleanupExpiredReceiptArchive', receiptCleanupStart);
const receiptCleanupBlock = source.slice(receiptCleanupStart, receiptCleanupEnd);
assert(source.includes('const RECEIPT_SOURCE_CHAT_CLEANUP_ENABLED = false'));
assert(source.includes('const RECEIPT_CHAT_ARCHIVE_ENABLED = false'));
assert(receiptCleanupBlock.includes('if (!RECEIPT_SOURCE_CHAT_CLEANUP_ENABLED) return 0;'));
assert(source.includes('if (RECEIPT_SOURCE_CHAT_CLEANUP_ENABLED && config.archiveEnabled && r)'));
assert(source.includes('archiveEnabled: RECEIPT_CHAT_ARCHIVE_ENABLED'));
assert(source.includes('if (!config || !config.archiveEnabled) return null;'));
assert(!source.includes('provideSlashCommand(new ArchiveReceiptCommand(this))'));

console.log('PASS: personal and receipt source chats retain their messages and financial index');
