const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const match = source.match(/function sameReceiptAmount\(left, right\)\s*\{[\s\S]*?\n\s*\}/);

if (!match) {
  throw new Error('sameReceiptAmount function not found');
}

eval(match[0]);

assert.strictEqual(sameReceiptAmount(1000, 1000), true);
assert.strictEqual(sameReceiptAmount('1000', 1000), true);
assert.strictEqual(sameReceiptAmount(1000, 1000.009), true);
assert.strictEqual(sameReceiptAmount(1000, 1000.02), false);
assert.strictEqual(sameReceiptAmount(1000, 1001), false);
assert.strictEqual(sameReceiptAmount('abc', 1000), false);

console.log('PASS: sameReceiptAmount');
