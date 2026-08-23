const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

const start = source.indexOf('function textFingerprint');
const end = source.indexOf('function looksLikeBankReceiptText');

if (start < 0 || end < 0 || end <= start) {
  throw new Error('Receipt identity block not found');
}

eval(source.slice(start, end));

const a = extractReceiptIdentity(
  'Номер документа 1234567890',
  '2026-08-22',
  1500
);

const b = extractReceiptIdentity(
  'Номер документа 1234567890',
  '2026-08-22',
  1500
);

const c = extractReceiptIdentity(
  'Номер документа 9876543210',
  '2026-08-22',
  1500
);

assert.strictEqual(a, b);
assert.notStrictEqual(a, c);

console.log('PASS: extractReceiptIdentity');
