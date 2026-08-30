const fs = require('fs');
const assert = require('assert');

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
assert.match(review, /finish\(detailsBuilder\)[\s\S]*startMessage\(\{[\s\S]*file: reviewFile/);
assert.match(review, /finish\(detailsBuilder\)[\s\S]*fileBuilder\.setBlocks\(blocks\)/);
assert.doesNotMatch(review, /detailsBuilder\.setBlocks\(blocks\)/);
assert.match(review, /text: "Фото чека для проверки"/);
assert.match(publishReview, /finish\(detailsBuilder\)/);
assert.match(publishReview, /actionBuilder\.setBlocks\(blocks\)/);
assert.doesNotMatch(publishReview, /detailsBuilder\.setBlocks\(blocks\)/);
assert.match(handler, /roomSlug !== "cheki-kontrol"/);
assert.match(handler, /candidate\.source === "rejected"/);
assert.match(handler, /candidate\.exact \|\| ""\) === exact/);
assert.match(handler, /amount <= 0/);
assert.match(handler, /entry\.source = "confirmed"/);
assert.match(handler, /publishMasterTransferSummary[\s\S]*true, \[entry\]/);
assert.match(handler, /✅ ЧЕК ЗАЧТЁН/);
assert.match(source, /if \(a\.actionId === K\)[\s\S]*handleApproveReceiptButton/);

console.log('PASS: rejected receipts can be approved from cheki-kontrol by a guarded button');
