const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const criteriaStart = source.indexOf('const WORK_PHOTO_VISUAL_CRITERIA');
const criteriaEnd = source.indexOf('async function requestOpenAiWorkPhotoCheckUncached', criteriaStart);
const criteria = source.slice(criteriaStart, criteriaEnd);

for (const marker of ['HAIR', 'NAILS', 'PEDICURE', 'BROWS_LASHES']) {
  assert(criteria.includes(marker), `missing ${marker} work-photo criterion`);
}
for (const subject of ['человек целиком', 'лицо', 'затылок', 'глаза', 'волосы', 'ногти', 'брови', 'ресницы']) {
  assert(criteria.includes(subject), `missing accepted subject: ${subject}`);
}
for (const exclusion of ['банковский чек', 'экран телефона', 'пустой интерьер', 'инструменты']) {
  assert(criteria.includes(exclusion), `missing exclusion: ${exclusion}`);
}
assert.strictEqual((source.match(/WORK_PHOTO_VISUAL_CRITERIA \+/g) || []).length, 2, 'both primary and dedicated Vision prompts must use the same criteria');

console.log('PASS: both Vision passes receive detailed salon work-photo criteria');
