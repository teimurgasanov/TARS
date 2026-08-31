const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const amountStart = source.indexOf('function sameReceiptAmount');
const amountEnd = source.indexOf('async function requestOpenAiReceiptCheck', amountStart);

if (amountStart < 0 || amountEnd < 0 || amountEnd <= amountStart) {
  throw new Error('Receipt amount conflict block not found');
}

function isValidReceiptAmount(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}
function receiptStatusBlocks(value) {
  return Boolean(value);
}

eval(source.slice(amountStart, amountEnd));

const requiredDate = '2026-08-27';
const yandexCandidate = {
  receiptDate: requiredDate,
  receiptAmount: 300,
  receiptAmountSource: 'yandex:page',
  text: 'Сумма в валюте операции 300 руб.'
};
const openAiCandidate = {
  receiptDate: requiredDate,
  receiptAmount: 2742,
  aiReceipt: true,
  receiptAmountSource: 'openai:gpt-4.1-mini',
  text: '{"is_receipt":true,"visual_type":"bank_receipt","status":"success","amount":2742}'
};

assert.strictEqual(
  receiptCandidateAmountConflict([yandexCandidate, openAiCandidate], openAiCandidate, requiredDate),
  true
);
assert.strictEqual(
  receiptCandidateAmountConflict([{ ...yandexCandidate, receiptAmount: 1900 }, { ...openAiCandidate, receiptAmount: 1900 }], { ...openAiCandidate, receiptAmount: 1900 }, requiredDate),
  false
);
const focusedOpenAiCandidate = { ...openAiCandidate, receiptAmountSource: 'openai:gpt-4.1' };
assert.strictEqual(
  receiptAmountsDisagree([yandexCandidate, openAiCandidate, focusedOpenAiCandidate], requiredDate),
  true,
  'two correlated OpenAI models must not override a conflicting Yandex amount'
);
assert.strictEqual(
  receiptAmountsDisagree([
    yandexCandidate,
    openAiCandidate,
    { ...focusedOpenAiCandidate, receiptAmount: 1900 }
  ], requiredDate),
  true,
  'three different readings without a consensus must remain in control'
);
assert.match(
  source,
  /!receiptAmountsDisagree\(candidates, requiredDate, !hasYandex\) && candidates\.find/
);

console.log('PASS: cross-provider consensus resolves amounts and keeps correlated conflicts in control');
