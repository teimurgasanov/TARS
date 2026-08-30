const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

assert.match(source, /function isGazpromReceiptText/);
assert.match(source, /!isGazpromReceiptText\(json\.bank \|\| text\)/);
assert.match(source, /!isGazpromReceiptText\(source\)/);

const helperStart = source.indexOf('function isGazpromReceiptText');
const helperEnd = source.indexOf('function receiptAmountFromAiValue', helperStart);
const statusStart = source.indexOf('function receiptStatusRejection');
const statusEnd = source.indexOf('function receiptContainerScreenshotRejection', statusStart);

if (helperStart < 0 || helperEnd <= helperStart || statusStart < 0 || statusEnd <= statusStart) {
  throw new Error('Gazprom receipt status functions not found');
}

const evaluate = new Function(`${source.slice(helperStart, helperEnd)}\n${source.slice(statusStart, statusEnd)}\nreturn receiptStatusRejection;`);
const receiptStatusRejection = evaluate();

assert.strictEqual(receiptStatusRejection('Газпромбанк. Статус: Ожидает подтверждения'), '');
assert.strictEqual(receiptStatusRejection('Gazprombank status pending'), '');
assert.match(receiptStatusRejection('Сбербанк. Статус: Ожидает подтверждения'), /НЕ ПОДТВЕРЖДЁН/);
assert.match(receiptStatusRejection('Газпромбанк. Статус: Платёж отклонен'), /НЕ ВЫПОЛНЕН/);
assert.strictEqual(receiptStatusRejection('ПАО Сбербанк. Перевод отправлен. Сумма перевода 1000 ₽'), '');
assert.match(receiptStatusRejection('Сбербанк. Статус: отправлен'), /НЕ ПОДТВЕРЖДЁН/);
assert.match(source, /надпись Сбербанка «Перевод отправлен» означает успешно выполненный перевод/);

console.log('PASS: Gazprom pending receipts bypass confirmation wait while failed payments remain blocked');
