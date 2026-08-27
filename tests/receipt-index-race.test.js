const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
assert.match(source, /var receiptIndexWriteQueue = Promise\.resolve\(\)/);
assert.match(source, /receiptIndexWriteQueue\.then\(writeReceiptIndex, writeReceiptIndex\)/);
const start = source.indexOf('function receiptIndexEntryKey');
const end = source.indexOf('function findDuplicate', start);

if (start < 0 || end < 0 || end <= start) {
  throw new Error('Receipt index merge block not found');
}

eval(source.slice(start, end));

const firstPre = {
  exact: 'first',
  source: 'pre',
  receiptAmount: 1200,
  uploadedAt: 100
};
const firstConfirmed = {
  ...firstPre,
  source: 'confirmed',
  postProcessedAt: 200
};
const secondConfirmed = {
  exact: 'second',
  source: 'confirmed',
  receiptAmount: 100,
  uploadedAt: 150,
  postProcessedAt: 250
};

const staleSecondWriter = [firstPre, secondConfirmed];
const latestFirstWriter = [firstConfirmed];
const merged = mergeConcurrentReceiptIndex(staleSecondWriter, latestFirstWriter, 300);

assert.strictEqual(merged.length, 2);
assert.strictEqual(merged.find((entry) => entry.exact === 'first').source, 'confirmed');
assert.strictEqual(
  merged.filter((entry) => entry.source === 'confirmed').reduce((sum, entry) => sum + entry.receiptAmount, 0),
  1300
);

console.log('PASS: concurrent receipt index writes preserve both confirmed receipts');
