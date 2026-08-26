const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const requestStart = source.indexOf('async function requestOpenAiReceiptCheck');
const requestEnd = source.indexOf('function normalizedDate', requestStart);
const validationStart = source.indexOf('async function validateReceiptDate');
const validationEnd = source.indexOf('async function validateReceiptStrict', validationStart);

if (requestStart < 0 || requestEnd <= requestStart || validationStart < 0 || validationEnd <= validationStart) {
  throw new Error('OpenAI receipt amount blocks not found');
}

const request = source.slice(requestStart, requestEnd);
const validation = source.slice(validationStart, validationEnd);

assert.match(request, /focusAmount = false/);
assert.match(request, /ПОВТОРНАЯ ПРОВЕРКА СУММЫ/);
assert.match(request, /Не используй комиссию, баланс, время, номер карты/);
assert.match(request, /retryAttempt \+ 1, focusAmount/);
assert.match(validation, /!isValidReceiptAmount\(aiCandidate\.receiptAmount\)/);
assert.match(validation, /requestOpenAiReceiptCheck\(file, content, http, config, requiredDate, logger, 0, true\)/);
assert.match(validation, /if \(amountCandidate\) candidates\.push\(amountCandidate\)/);

console.log('PASS: OpenAI retries receipt recognition with an amount-focused prompt when amount is missing');
