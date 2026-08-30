const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async onUpdate');
const end = source.indexOf('async executePreFileUpload', start);
assert.ok(start >= 0 && end > start, 'onUpdate block must exist');
const block = source.slice(start, end);

const refresh = block.indexOf('refreshKnownPersonalReportRooms');
const photoMaintenance = block.indexOf('cleanupDuplicateReportForwardsInOtchet');
const pendingPhotos = block.indexOf('publishPendingReportPhotos');
assert.ok(refresh >= 0 && refresh < photoMaintenance && refresh < pendingPhotos);

console.log('PASS: duplicate personal report buttons are cleaned before optional update maintenance');
