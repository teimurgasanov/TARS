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

assert.match(request, /focusAmount = false, focusDate = false/);
assert.match(request, /focusAmount \|\| focusDate \? primaryModel === "gpt-4\.1" \? "gpt-4\.1-mini" : "gpt-4\.1" : primaryModel/);
assert.match(request, /ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА/);
assert.match(request, /ПОВТОРНАЯ НЕЗАВИСИМАЯ ПРОВЕРКА ДАТЫ/);
assert.match(request, /не подставляй дату загрузки/);
assert.match(request, /найди границы экрана телефона/);
assert.match(request, /Не используй комиссию, баланс, время, номер карты/);
assert.match(request, /Оплата SberPay со статусом «Исполнено» также является успешной операцией/);
assert.match(request, /retryAttempt \+ 1, focusAmount, focusDate/);
assert.doesNotMatch(validation, /if \(!aiCandidate \|\| !aiCandidateStronglyAcceptsReceipt\(aiCandidate, requiredDate\)/);
assert.match(validation, /!candidate\.aiReceipt \|\| aiCandidateStronglyAcceptsReceipt\(candidate, requiredDate\)/);
assert.match(validation, /receiptAmountHasIndependentConfirmation\(candidates, candidate, requiredDate, !hasYandex\)/);
assert.match(source, /повёрнуто на 90, 180 или 270 градусов/);
assert.match(source, /detail: "high"/);
assert.match(request, /amount_text/);
assert.match(request, /candidate\.receiptAmountSource = `openai:\$\{model\}`/);
assert.match(validation, /requestOpenAiReceiptCheck\(file, content, http, config, requiredDate, logger, 0, true/);
assert.match(validation, /if \(amountCandidate\) candidates\.push\(amountCandidate\)/);
assert.match(validation, /!candidates\.some\(\(candidate\) => candidate && candidate\.receiptDate === requiredDate\)/);
assert.match(validation, /requestOpenAiReceiptCheck\(file, content, http, config, requiredDate, logger, 0, false, true/);
assert.match(validation, /if \(dateCandidate\) candidates\.push\(dateCandidate\)/);

const candidateStart = source.indexOf('function alignReceiptDateToRequiredYear');
const candidateEnd = source.indexOf('function aiCandidateStronglyAcceptsReceipt', candidateStart);
const normalizedDateStart = source.indexOf('function normalizedDate', requestEnd);
const normalizedDateEnd = source.indexOf('function normalizeReceiptDateText', normalizedDateStart);
const evaluateCandidate = new Function(`
  function normalizeReceiptAmount(value) {
    const amount = Number(String(value == null ? '' : value).replace(/[^0-9.,]/g, '').replace(',', '.'));
    return Number.isFinite(amount) && amount > 0 ? amount : undefined;
  }
  ${source.slice(normalizedDateStart, normalizedDateEnd)}
  ${source.slice(candidateStart, candidateEnd)}
  return openAiReceiptCandidateFromJson;
`);
const candidate = evaluateCandidate()({
  is_receipt: true,
  visual_type: 'receipt_on_phone',
  date: '2026-08-28',
  amount: 600,
  status: 'success',
  bank: 'Сбербанк',
  operation: 'Оплата SberPay',
  status_text: 'Исполнено'
}, '2026-08-28');
assert.strictEqual(candidate.receiptDate, '2026-08-28');
assert.strictEqual(candidate.receiptAmount, 600);
assert.strictEqual(candidate.statusRejection, '');

console.log('PASS: OpenAI independently rechecks every receipt amount and reads SberPay 600 ₽ on 28.08.2026');
