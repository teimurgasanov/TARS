// Repeated Rocket.Chat events must not repeat the photo acceptance message.
const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('TarsReportApp.js', 'utf8');
assert(source.includes('return "already-published"'), 'already published photo events must return a non-new status');
assert(source.includes('return "duplicate"'), 'duplicate photo events must return a duplicate status');
assert(source.includes('if (photoEntries.length) await notifyWorkPhotoAccepted'), 'the unified pipeline must confirm only an accepted photo');
assert(source.includes('if (photoResult === true) await notifyWorkPhotoAccepted'), 'the direct result route must not confirm duplicate or already-published events');
assert.strictEqual((source.match(/setText\("✅ ФОТО РАБОТЫ ПРИНЯТО"\)/g) || []).length, 1, 'there must be one acceptance-message emission path');
console.log('PASS: repeated photo events cannot duplicate acceptance confirmation');
