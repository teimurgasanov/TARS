const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
assert.match(source, /t\.includes\("\\u043E\\u043A\\u0440\\u0430\\u0448"\) \? 2e3 \* s : null/);
assert.match(source, /reportType==='female'&&rowName\.indexOf\('окраш'\)!==-1\?2000\*qty/);
assert.doesNotMatch(source, /r\.expense\?\?\(reportType==='female'/);

console.log('PASS: female coloring keeps the field blank while silently deducting the default 2000-ruble expense');
