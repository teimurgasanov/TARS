const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('var REPORT_ON_TIME_IMAGE_DATA');
const end = source.indexOf('var ReportFormEndpoint', start);
const block = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'on-time report image override not found');
assert.match(block, /data:image\/jpeg;base64,/);
assert.doesNotMatch(block, /__TARS_ON_TIME_IMAGE_BASE64__/);
assert.match(block, /if \(!late\)/);
assert.match(block, /id="acceptedImage"/);
assert.match(block, /width:100%;height:100%;object-fit:contain/);
assert.match(block, /REPORT_FORM_SCRIPT = REPORT_FORM_SCRIPT\.replace/);
assert.match(block, /replace\("\\n    load\(\);\\n  \}\)\(\);"/);
assert.doesNotMatch(block, /replace\("\\\\\\\\n    load/);
assert.match(block, /Отчёт принят с опозданием/);

const runtime = {};
vm.runInNewContext(source.slice(source.indexOf('var REPORT_FORM_SCRIPT'), end), runtime);
assert.match(runtime.REPORT_FORM_SCRIPT, /showAccepted = function\(data\)/);
assert.match(runtime.REPORT_FORM_SCRIPT, /id="acceptedImage"/);

console.log('PASS: on-time report uses the embedded TARS hearts image while late report keeps its separate state');
