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
  true
);
assert.match(
  source,
  /!receiptAmountsDisagree\(candidates, requiredDate\) && candidates\.find/
);

console.log('PASS: conflicting OCR and vision amounts cannot be auto-accepted');
