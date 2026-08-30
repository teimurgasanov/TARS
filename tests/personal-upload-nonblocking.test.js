const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function guardUpload');
const end = source.indexOf('function preUploadEntryMatchesMessage', start);

assert.ok(start >= 0 && end > start, 'guardUpload block not found');
const block = source.slice(start, end);
const personalStart = block.indexOf('if (isPersonalTarsRoom(room))');
const protectedRoomStart = block.indexOf('let protectedRoom = protectedRoomForRoom(room)');
assert.ok(personalStart >= 0 && protectedRoomStart > personalStart, 'personal-room fast path not found');

const personalFastPath = block.slice(personalStart, protectedRoomStart);
assert.match(personalFastPath, /rememberOrBlockPersonalImageDuplicate/);
assert.match(personalFastPath, /return;/);
assert.doesNotMatch(personalFastPath, /personalImageKindForPreUpload/);
assert.doesNotMatch(personalFastPath, /validateReceiptStrict/);

console.log('PASS: personal photo uploads never wait for external OCR in the pre-upload hook');
