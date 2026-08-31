const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('let receiptOcrRequestQueue');
const end = source.indexOf('function receiptImageMimeType', start);
assert.ok(start >= 0 && end > start, 'queued receipt OCR block missing');

const block = source.slice(start, end);
assert.match(block, /receiptOcrRequestQueue\.then\(run, run\)/);
assert.match(block, /350 - \(Date\.now\(\) - receiptOcrLastStartedAt\)/);
assert.match(block, /response\.statusCode === 429\) && retryAttempt < 2/);
assert.match(block, /1200 \* \(retryAttempt \+ 1\)/);

console.log('PASS: burst receipt OCR is serialized and rate limits are retried');
