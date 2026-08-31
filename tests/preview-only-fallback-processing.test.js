const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const executeStart = source.indexOf('async executePostMessageSent');
const executeEnd = source.indexOf('async receiptOcrConfig', executeStart);
assert.ok(executeStart >= 0 && executeEnd > executeStart, 'post-message handler missing');

const execute = source.slice(executeStart, executeEnd);
assert.match(execute, /POST_PROBE_PREVIEW_FALLBACK/);
assert.doesNotMatch(execute, /POST_PROBE_SKIP_PREVIEW_ONLY/);
assert.match(execute, /const mediaV2 = await G\.processPersonalMediaV2/);

console.log('PASS: imageUrl-only uploads fall back to media processing after waiting for the original');
