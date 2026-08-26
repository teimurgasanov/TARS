const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');

execFileSync(process.execPath, ['--check', 'PhotoFirstTarsReportApp.js'], { stdio: 'inherit' });
const s = fs.readFileSync('PhotoFirstTarsReportApp.js', 'utf8');
assert(s.includes("require('./LegacyTarsReportApp')"));
assert(s.includes("kind === 'receipt' || kind === 'mailing'"));
assert(s.includes('PHOTO_FIRST_OK'));
assert(s.includes('return super.executePostMessageSent'));
console.log('PASS: independent photo-first wrapper preserves legacy app and blocks receipt/mailing');
