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
for (const strictField of ['has_visible_client', 'has_visible_service_area', 'is_receipt_or_banking']) {
  assert(source.includes(strictField), `missing strict classifier field: ${strictField}`);
}
assert(source.includes('knownServiceArea'), 'work-photo acceptance must require a known salon service area');
assert(source.includes('work-photo-not-strictly-confirmed'), 'inconclusive images must fail closed');
assert(!source.includes('forward: true, reason: "verified-non-receipt-image"'), 'unknown images must never default to work photos');
assert.strictEqual((source.match(/WORK_PHOTO_VISUAL_CRITERIA \+/g) || []).length, 2, 'both primary and dedicated Vision prompts must use the same criteria');

console.log('PASS: both Vision passes receive detailed salon work-photo criteria');
