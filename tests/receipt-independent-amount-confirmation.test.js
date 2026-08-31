const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const helperStart = source.indexOf('function receiptAmountHasIndependentConfirmation');
const helperEnd = source.indexOf('async function requestOpenAiReceiptCheck', helperStart);
if (helperStart < 0 || helperEnd <= helperStart) throw new Error('Independent amount confirmation helpers not found');

function isValidReceiptAmount(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}
function sameReceiptAmount(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.005;
}
eval(source.slice(helperStart, helperEnd));

const date = '2026-08-29';
const first = { receiptDate: date, receiptAmount: 7, aiReceipt: true, receiptAmountSource: 'openai:gpt-4.1-mini' };
const sameModelMatching = { receiptDate: date, receiptAmount: 7, aiReceipt: true, receiptAmountSource: 'openai:gpt-4.1-mini' };
const secondWrong = { receiptDate: date, receiptAmount: 2900, aiReceipt: true, receiptAmountSource: 'openai:gpt-4.1' };
const secondMatching = { receiptDate: date, receiptAmount: 7, aiReceipt: true, receiptAmountSource: 'openai:gpt-4.1' };

assert.strictEqual(receiptAmountHasIndependentConfirmation([first], first, date), false);
assert.strictEqual(receiptAmountHasIndependentConfirmation([first, sameModelMatching], first, date), false);
assert.strictEqual(receiptAmountHasIndependentConfirmation([first, secondWrong], first, date), false);
assert.strictEqual(receiptAmountHasIndependentConfirmation([first, secondMatching], first, date), true);
assert.strictEqual(receiptAmountsDisagree([first, secondWrong], date), true);
assert.strictEqual(receiptAmountsDisagree([first, secondMatching], date), false);

const yandexOutlier = { receiptDate: date, receiptAmount: 1300, receiptAmountSource: 'yandex:page' };
assert.strictEqual(
  receiptAmountsDisagree([first, secondMatching, yandexOutlier], date),
  true,
  'two correlated OpenAI reads must not override a conflicting Yandex amount'
);

assert.strictEqual(
  receiptAmountHasIndependentConfirmation([first, secondMatching], first, date, false),
  false,
  'when Yandex is configured, an unavailable OCR response must not allow two OpenAI models to confirm a wrong amount'
);

const yandexMatching = { receiptDate: date, receiptAmount: 2900, receiptAmountSource: 'yandex:page' };
assert.strictEqual(
  receiptAmountsDisagree([first, secondWrong, yandexMatching], date),
  false,
  'matching Yandex and OpenAI reads form cross-provider confirmation'
);

const validationStart = source.indexOf('async function validateReceiptDate');
const validationEnd = source.indexOf('async function validateReceiptStrict', validationStart);
const validation = source.slice(validationStart, validationEnd);
assert.doesNotMatch(validation, /if \(!aiCandidate \|\| !aiCandidateStronglyAcceptsReceipt/);
assert.match(validation, /const amountCandidate = await requestOpenAiReceiptCheck/);
assert.match(validation, /СУММЫ ЧЕКА НЕ СОВПАЛИ/);
assert.match(validation, /if \(receiptAmountsDisagree\(candidates, requiredDate, !hasYandex\)\) return void 0/);

console.log('PASS: receipt amounts use independent consensus without amount thresholds');
