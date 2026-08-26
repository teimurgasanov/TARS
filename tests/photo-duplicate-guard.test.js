const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

const fastStart = source.indexOf('async function fastForwardPersonalReportPhotos');
const fastEnd = source.indexOf('async function publishPendingReportPhotos', fastStart);
const fastBlock = source.slice(fastStart, fastEnd);
assert.match(fastBlock, /const duplicate = findDuplicate\(index, exact, visual\)/);
assert.match(fastBlock, /FAST_PHOTO_FORWARD_DEFER_DUPLICATE_REJECTION/);
assert.match(fastBlock, /return false;/);
assert.doesNotMatch(fastBlock, /FAST_PHOTO_FORWARD_SKIP_DUPLICATE/);

const postedStart = source.indexOf('async function rememberOrDeletePostedPersonalImageDuplicate');
const postedEnd = source.indexOf('async function guardUpload', postedStart);
const postedBlock = source.slice(postedStart, postedEnd);
assert.match(postedBlock, /const samePostedMessage = Boolean/);
assert.match(postedBlock, /duplicate && !sameFreshPreUploadMarker && !samePostedMessage/);

const guardStart = source.indexOf('async function guardUpload');
const guardEnd = source.indexOf('async function rejectDuplicateMessage', guardStart);
const guardBlock = source.slice(guardStart, guardEnd);
assert.match(guardBlock, /protectedRoom\.kind === "photo" \? findDuplicate\(index, exact, visual\) : findExactDuplicate/);

console.log('PASS: exact and visual duplicate work photos reach strict rejection instead of bypassing it');
