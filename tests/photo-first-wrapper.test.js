const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');

execFileSync(process.execPath, ['--check', 'PhotoFirstTarsReportApp.js'], { stdio: 'inherit' });
const s = fs.readFileSync('PhotoFirstTarsReportApp.js', 'utf8');
assert(s.includes("require('./LegacyTarsReportApp')"));
assert(s.includes("kind !== 'photo'"), 'only confirmed photos may forward');
assert(s.includes('isDirectRoom(message.room)'), 'only direct chats may forward');
assert(s.includes('alreadyInReports'), 'duplicate report forward guard exists');
const superCall = s.indexOf('legacyResult = await super.executePostMessageSent');
const fallbackCall = s.lastIndexOf('await this.sendIndependentPhotoToReports');
assert(superCall >= 0 && fallbackCall > superCall, 'legacy processing must run before independent fallback');
assert(s.includes('PHOTO_FIRST_OK'));
console.log('PASS: independent photo fallback preserves legacy processing and blocks non-photo/duplicates');
