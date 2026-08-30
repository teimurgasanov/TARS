const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
function block(name, next) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(next, start);
  if (start < 0 || end <= start) throw new Error(`${name} block not found`);
  return source.slice(start, end);
}

const external = block('archiveReceiptYandex', 'const RECEIPT_REVIEW_ROOM');
const archiveStart = source.indexOf('async function archiveReceipt(');
const archiveEnd = source.indexOf('async function readArchivedReceipts', archiveStart);
if (archiveStart < 0 || archiveEnd <= archiveStart) throw new Error('archiveReceipt block not found');
const archive = source.slice(archiveStart, archiveEnd);
const scheduled = block('cleanupArchivedReceiptMessages', 'async function cleanupExpiredReceiptArchive');
const expiry = block('cleanupExpiredReceiptArchive', 'async function findResultRoom');

assert.match(source, /RECEIPT_ARCHIVE_RETENTION_MS = 60 \* 24 \* 60 \* 60 \* 1e3/);
assert.match(external, /externalArchiveStatus: "stored"/);
assert.match(external, /externalArchiveKey: objectKey/);
assert.doesNotMatch(external, /archiveKey: objectKey/);
assert.match(archive, /const yandex = await archiveReceiptYandex/);
assert.match(archive, /archiveKey: `yandex:\$\{yandex\.externalArchiveKey\}`/);
assert.match(archive, /archiveBackend: "yandex-object-storage-v1"/);
assert.doesNotMatch(archive, /uploadBuffer/);
assert.doesNotMatch(archive, /ensureInternalArchiveRoom/);
assert.doesNotMatch(source, /async function ensureInternalArchiveRoom/);
assert.doesNotMatch(source, /async function createArchiveMessageForUpload/);
assert.match(scheduled, /archiveConfigured\(config\)[\s\S]*externalArchiveStatus !== "stored"/);
assert.match(scheduled, /if \(!RECEIPT_SOURCE_CHAT_CLEANUP_ENABLED\) continue/);
assert.match(scheduled, /sourceCreatedAt \+ RECEIPT_ARCHIVE_RETENTION_MS > now/);
assert.match(scheduled, /createdAt \+ RECEIPT_ARCHIVE_RETENTION_MS > now/);
assert.match(expiry, /entry\.externalArchiveStatus !== "stored" \|\| !entry\.externalArchiveKey/);
assert.match(expiry, /Yandex backup is not confirmed/);
assert.doesNotMatch(source, /INTERNAL_ARCHIVE_ROOM/);
assert.doesNotMatch(expiry, /archiveUploadId|archiveMessageId|getByName\("cheki-arhiv"\)/);

console.log('PASS: Yandex is the only receipt archive backend');
