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
  text: '{"is_receipt":true,"status":"success","amount":2742}'
};

assert.strictEqual(
  receiptCandidateAmountConflict([yandexCandidate, openAiCandidate], openAiCandidate, requiredDate),
  true
);
assert.strictEqual(
  receiptCandidateAmountConflict([{ ...yandexCandidate, receiptAmount: 1900 }, { ...openAiCandidate, receiptAmount: 1900 }], { ...openAiCandidate, receiptAmount: 1900 }, requiredDate),
  false
);
assert.match(
  source,
  /aiCandidateStronglyAcceptsReceipt\(candidate, requiredDate\) && !receiptCandidateAmountConflict\(candidates, candidate, requiredDate\)/
);

console.log('PASS: conflicting OpenAI amount cannot override Yandex receipt amount');
