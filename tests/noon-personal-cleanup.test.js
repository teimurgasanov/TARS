const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('function localCalendarParts');
const end = source.indexOf('function displayDate', start);

if (start < 0 || end < 0 || end <= start) {
  throw new Error('Noon cleanup helper block not found');
}

eval(source.slice(start, end));

const config = { timeZone: 'Europe/Astrakhan' };
const at = (iso) => new Date(iso).getTime();

assert.strictEqual(personalChatCleanupReady(at('2026-08-24T07:59:00Z'), config), false);
assert.strictEqual(personalChatCleanupReady(at('2026-08-24T08:00:00Z'), config), true);
assert.strictEqual(personalChatMessageIsExpired(at('2026-08-23T16:00:00Z'), at('2026-08-24T08:00:00Z'), config), true);
assert.strictEqual(personalChatMessageIsExpired(at('2026-08-24T06:00:00Z'), at('2026-08-24T08:00:00Z'), config), false);
assert.strictEqual(personalChatMessageIsExpired(at('2026-08-23T16:00:00Z'), at('2026-08-24T07:59:00Z'), config), false);

console.log('PASS: noon personal cleanup boundary');
