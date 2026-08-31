const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function validateReceiptStrict');
const end = source.indexOf('function personalArchiveMessageAssociation', start);
const block = source.slice(start, end);

assert.match(block, /transientOcrFailure/);
assert.match(block, /СУММА ЧЕКА НЕ РАСПОЗНАНА/);
assert.match(block, /ДАТА ЧЕКА НЕ РАСПОЗНАНА/);
assert.match(block, /setTimeout\(resolve, 1500\)/);
assert.match(block, /await validateReceiptDate\(file, content, http, config, logger, 0\)/g);
assert.match(block, /retried && retried\.ok \? retried : first/);

console.log('PASS: inconclusive receipt OCR is retried before control');
