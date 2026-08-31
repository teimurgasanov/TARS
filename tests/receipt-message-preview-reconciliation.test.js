const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const helperStart = source.indexOf('function sameReceiptMessageImage');
const helperEnd = source.indexOf('function isStableReceiptIdentity', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'same-message receipt helper missing');
const helper = source.slice(helperStart, helperEnd);
assert.match(helper, /leftMessageId !== rightMessageId/);
assert.match(helper, /RECEIPT_VISUAL_DISTANCE_LIMIT/);
assert.match(helper, /sameReceiptAmount\(amountFromEntry\(left\), amountFromEntry\(right\)\)/);
assert.match(helper, /Math\.abs\(leftTime - rightTime\) <= 2 \* 60 \* 1e3/);

function hammingDistance(left, right) {
  if (!left || !right || left.length !== right.length) return Number.MAX_SAFE_INTEGER;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}
function sameReceiptAmount(left, right) {
  return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) < 0.01;
}
function amountFromEntry(entry) {
  const amount = Number(entry && entry.receiptAmount);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}
const RECEIPT_VISUAL_DISTANCE_LIMIT = 8;
eval(helper);

const original = { messageId: 'one-message', uploadId: 'original', receiptAmount: 1300, uploadedAt: 100000, visual: '0000000000000000' };
const resizedPreview = { messageId: 'one-message', uploadId: 'preview', receiptAmount: 1300, uploadedAt: 101000, visual: '1111111111111111' };
assert.strictEqual(sameReceiptMessageImage(original, resizedPreview), true, 'historical original/thumbnail pair must count once');
assert.strictEqual(sameReceiptMessageImage(original, { ...resizedPreview, receiptAmount: 600 }), false, 'different receipt amounts in one message must remain separate');
assert.strictEqual(sameReceiptMessageImage(original, { ...resizedPreview, messageId: 'other-message' }), false, 'same amount in different messages must remain separate');

const summaryStart = source.indexOf('async function confirmedTransferSummaryForUser');
const summaryEnd = source.indexOf('function masterTransferSummaryAssociation', summaryStart);
const summary = source.slice(summaryStart, summaryEnd);
assert.match(summary, /sameReceiptMessageImage\(counted, entry\)/);
assert.match(summary, /sameReceiptMessageImage\(confirmed, entry\)/);

const ledgerStart = source.indexOf('async function receiptLedgerSummaryForUser');
const ledgerEnd = source.indexOf('let receiptSummaryQueue', ledgerStart);
const ledger = source.slice(ledgerStart, ledgerEnd);
assert.match(ledger, /accountedReceipts/);
assert.match(ledger, /sameReceiptMessageImage\(accounted, receipt\)/);

console.log('PASS: historical original/preview receipt pairs are reconciled by message and visual hash');
