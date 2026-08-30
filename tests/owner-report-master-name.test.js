const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async sendOwnerShortReport');
const end = source.indexOf('async sendPublicClientSummary', start);
assert.ok(start >= 0 && end > start, 'owner short report block must exist');
const block = source.slice(start, end);

assert.match(block, /reportOwner && reportOwner\.name/);
assert.match(block, /Мастер: \*\$\{masterLabel\}\*/);
assert.match(block, /Дата: \*\$\{date\}\*/);

console.log('PASS: private owner report visibly identifies every master');
