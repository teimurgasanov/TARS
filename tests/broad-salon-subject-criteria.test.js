const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('const WORK_PHOTO_VISUAL_CRITERIA');
const end = source.indexOf('async function requestOpenAiWorkPhotoCheckUncached', start);
const criteria = source.slice(start, end);

assert.match(criteria, /Не требуй доказательства изменения до\/после/);
assert.match(criteria, /одного чёткого кадра клиента или соответствующей зоны достаточно/);
assert.match(criteria, /человек или релевантная зона салонной услуги — фото работы/);

console.log('PASS: a person or relevant salon body area is accepted without before/after proof');
