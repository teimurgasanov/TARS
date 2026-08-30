const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('const RECEIPT_VISUAL_CRITERIA');
const end = source.indexOf('const WORK_PHOTO_VISUAL_CRITERIA', start);
const criteria = source.slice(start, end);

for (const marker of ['логотип банка', 'дата и время операции', 'итоговая сумма', 'статус', 'отправитель', 'получатель', 'QR', 'СБП']) {
  assert(criteria.includes(marker), `missing receipt criterion: ${marker}`);
}
for (const guard of ['одиночное число', 'баланс', 'обычную переписку', 'фото человека']) {
  assert(criteria.includes(guard), `missing non-receipt guard: ${guard}`);
}
assert.strictEqual((source.match(/RECEIPT_VISUAL_CRITERIA \+/g) || []).length, 2, 'both Vision passes must receive receipt criteria');

console.log('PASS: both Vision passes receive explicit bank-receipt criteria and false-positive guards');
