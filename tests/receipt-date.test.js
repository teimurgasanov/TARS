const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

const start = source.indexOf('function alignReceiptDateToRequiredYear');
const end = source.indexOf('function normalizeReceiptAmount');

if (start < 0 || end < 0 || end <= start) {
  throw new Error('Receipt date parser block not found');
}

eval(source.slice(start, end));

assert.strictEqual(
  extractReceiptDate('Дата операции 22.08.2026', '2026-08-22'),
  '2026-08-22'
);

assert.strictEqual(
  extractReceiptDate('Дата операции 21.08.2026', '2026-08-22'),
  '2026-08-21'
);

assert.strictEqual(
  extractReceiptDate('Оплата успешно выполнена', '2026-08-22'),
  undefined
);

assert.strictEqual(
  extractReceiptDate('Чек по операции О2 сентября 2О26 12:03:24 (МСК)', '2026-09-02'),
  '2026-09-02',
  'OCR O/0 substitutions in a labeled Russian receipt date must be normalized'
);

assert.strictEqual(
  extractReceiptDate('Дата операции О2.О9.2О26', '2026-09-02'),
  '2026-09-02',
  'OCR O/0 substitutions in a labeled numeric receipt date must be normalized'
);

console.log('PASS: extractReceiptDate');
