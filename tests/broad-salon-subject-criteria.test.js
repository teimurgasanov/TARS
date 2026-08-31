const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('const WORK_PHOTO_VISUAL_CRITERIA');
const end = source.indexOf('async function requestOpenAiWorkPhotoCheckUncached', start);
const criteria = source.slice(start, end);

assert.match(criteria, /Не требуй коллаж до\/после/);
assert.match(criteria, /человек и релевантная зона услуги должны быть реально видимы/);
assert.match(criteria, /При сомнении не подтверждай фото работы/);
assert.match(criteria, /читаемый документ или экран с банковскими реквизитами/);

console.log('PASS: work photos require a visible client and salon service area');
