const fs = require('fs');
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const reviewStart = source.indexOf('async function createReviewMessageForUpload');
const reviewEnd = source.indexOf('async function findOtchetRoom', reviewStart);
const handlerStart = source.indexOf('async handleApproveReceiptButton');
const handlerEnd = source.indexOf('async executeActionButtonHandler', handlerStart);

assert.ok(reviewStart >= 0 && reviewEnd > reviewStart, 'receipt review message block not found');
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'receipt approval button handler not found');

const review = source.slice(reviewStart, reviewEnd);
const publishStart = source.indexOf('async function publishRejectedReceiptReview');
const publishEnd = source.indexOf('async function archiveUploadExists', publishStart);
const publishReview = source.slice(publishStart, publishEnd);
const handler = source.slice(handlerStart, handlerEnd);

assert.match(review, /actionId: APPROVE_REJECTED_RECEIPT_ACTION/);
assert.match(review, /newPlainTextObject\("ЗАЧЕСТЬ ЧЕК"\)/);
assert.match(review, /value: String\(details\.exact\)/);
assert.match(review, /detailsBuilder[\s\S]*setText\(text\)/);
assert.match(review, /startMessage\(\{[\s\S]*file: reviewFile[\s\S]*finish\(fileBuilder\)[\s\S]*finish\(detailsBuilder\)/);
assert.match(review, /attachReceiptResultToMessage[\s\S]*messageId/);
assert.match(review, /detailsBuilder\.setBlocks\(blocks\)/);
assert.doesNotMatch(review, /fileBuilder\.setBlocks\(blocks\)/);
assert.match(review, /text: "Фото чека для проверки"/);
assert.match(publishReview, /finish\(detailsBuilder\)/);
assert.match(publishReview, /actionBuilder\.setBlocks\(blocks\)/);
assert.doesNotMatch(publishReview, /detailsBuilder\.setBlocks\(blocks\)/);
assert.match(publishReview, /findArchiveMessageByUploadId\(room\.id, upload\.id, read\)/);
assert.match(publishReview, /attachReceiptResultToMessage[\s\S]*reviewMessageId/);
assert.match(handler, /roomSlug !== "cheki-kontrol"/);
assert.match(handler, /candidate\.source === "rejected"/);
assert.match(handler, /candidate\.exact \|\| ""\) === exact/);
assert.match(handler, /amount <= 0/);
assert.match(handler, /approveReceiptThroughSharedService/);
const sharedStart = source.indexOf('async approveReceiptThroughSharedService');
const sharedEnd = source.indexOf('async handlePrivateReceiptControlCommand', sharedStart);
const shared = source.slice(sharedStart, sharedEnd);
assert.match(shared, /G\.runReceiptManualApprovalV1/);
assert.match(shared, /publishMasterTransferSummary[\s\S]*true, \[entry\]/);
assert.match(handler, /✅ ЧЕК ЗАЧТЁН/);
assert.match(source, /if \(a\.actionId === K\)[\s\S]*handleApproveReceiptButton/);

for (const runtime of [
  'receipt-private-control-v1.runtime.js',
  'receipt-private-control-runtime.runtime.js'
]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, runtime)], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, `${runtime} failed:\n${result.stdout || ''}${result.stderr || ''}`);
}

console.log('PASS: rejected receipts can be approved from cheki-kontrol by a guarded button');
