// Mobile Rocket.Chat uploads can become readable after the post-message event.
const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const a = source.indexOf('async function fastForwardPersonalReportPhotos');
const b = source.indexOf('async function publishDirectReportPhotos', a);
assert(a >= 0 && b > a, 'personal photo forwarder must exist');
const helper = source.slice(a, b);
assert(helper.includes('attempt < 8 && !bestCandidate'), 'mobile uploads must receive an extended availability retry window');
assert(helper.includes('setTimeout(resolve, 1e3)'), 'upload availability retries must wait between attempts');
assert(helper.includes('FAST_PHOTO_FORWARD_FILE_UNAVAILABLE'), 'exhausted upload reads must be observable');
console.log('PASS: mobile work photos wait for Rocket.Chat upload availability');
