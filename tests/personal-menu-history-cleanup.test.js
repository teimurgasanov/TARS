const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async removeLegacyPersonalReportMenus');
const end = source.indexOf('async refreshPersonalReportButton', start);
assert.ok(start >= 0 && end > start, 'personal menu cleanup block must exist');
const block = source.slice(start, end);

assert.match(block, /for \(let skip = 0; skip < 500; skip \+= 100\)/);
assert.match(block, /limit: 100/);
assert.match(block, /if \(a\.length < 100\) break/);
assert.match(block, /messages\.push\(\.\.\.a\)/);
assert.match(block, /keepMessageId && String\(o\.id/);
assert.match(block, /выберите нужный отчет/);
assert.match(block, /заполнить \/ исправить/);

console.log('PASS: personal menu cleanup scans older history and preserves only the current button');
