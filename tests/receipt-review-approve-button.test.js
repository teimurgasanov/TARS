const fs = require('fs');
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const reviewStart = source.indexOf('async function publishRejectedReceiptReview');
const reviewEnd = source.indexOf('async function archiveUploadExists', reviewStart);
const handlerStart = source.indexOf('async handleApproveReceiptButton');
const handlerEnd = source.indexOf('async executeActionButtonHandler', handlerStart);

assert.ok(reviewStart >= 0 && reviewEnd > reviewStart, 'receipt review message block not found');
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'receipt approval button handler not found');

const review = source.slice(reviewStart, reviewEnd);
const handler = source.slice(handlerStart, handlerEnd);

assert.match(review, /actionId: APPROVE_REJECTED_RECEIPT_ACTION/);
assert.match(review, /newPlainTextObject\("ЗАЧЕСТЬ ЧЕК"\)/);
assert.match(review, /value: entryToken/);
assert.match(review, /getNotifier\(\)[\s\S]*notifyUser\(reviewer/);
assert.match(review, /\["teimur", "shura"\]/);
assert.doesNotMatch(review, /ensureReceiptReviewRoom|uploadBuffer|createReviewMessageForUpload|RECEIPT_REVIEW_ROOM/);
assert.match(handler, /privateReceiptControlActorAllowed/);
assert.match(handler, /privateAction[\s\S]*personalRoom/);
assert.match(handler, /candidate\.source === "rejected"/);
assert.match(handler, /receiptPrivateControlEntryTokenV1\(candidate\) === value/);
assert.match(handler, /amount <= 0/);
assert.match(handler, /entry\.source = "confirmed"/);
assert.match(handler, /publishMasterTransferSummary[\s\S]*true, \[entry\]/);
assert.match(handler, /manualTransitionReceiptCaseV1/);
assert.match(handler, /createReceiptProcessingStatusManager[\s\S]*syncCase/);
assert.match(handler, /✅ ЧЕК ЗАЧТЁН/);
assert.match(source, /if \(a\.actionId === K\)[\s\S]*handleApproveReceiptButton/);
assert.match(source, /class ReceiptControlCommand|var ReceiptControlCommand = class/);
assert.match(source, /this\.command = "receipt-control"/);
assert.match(source, /handleReceiptControlCommand/);
assert.match(source, /provideSlashCommand\(new ReceiptControlCommand\(this\)\)/);

for (const regression of [
  'receipt-private-control-minimal-v1.runtime.js',
  'receipt-private-control-handler.runtime.js'
]) {
  execFileSync(process.execPath, [path.join('tests', regression)], { stdio: 'inherit', env: process.env });
}

console.log('PASS: rejected receipts can be privately approved in the master chat without cheki-kontrol copies');
