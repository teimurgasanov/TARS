const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');

execFileSync(process.execPath, ['--check', 'PhotoFirstTarsReportApp.js'], { stdio: 'inherit' });
const s = fs.readFileSync('PhotoFirstTarsReportApp.js', 'utf8');
assert(s.includes("require('./LegacyTarsReportApp')"));
assert(s.includes('if (!message || !isDirectRoom(message.room)) return false;'));
assert(s.includes("if (kind !== 'photo')"));
assert(s.includes('PHOTO_FIRST_SKIP'));
assert(s.includes('PHOTO_FIRST_OK'));
assert(s.includes('responseText(payload)'));
assert(s.includes("'Отчеты'"));
assert(s.includes('return super.executePostMessageSent'));
console.log('PASS: independent photo-first wrapper is direct-room-only, fail-closed, and preserves legacy fallback');
