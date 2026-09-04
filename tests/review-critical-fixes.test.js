const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

function sliceBetween(startMarker, endMarker, from = 0) {
  const start = source.indexOf(startMarker, from);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error(`block not found: ${startMarker}`);
  return source.slice(start, end);
}

// 1. Report finalize queue must read through IRead and write through IPersistence.
const finalizeQueue = sliceBetween('async upsertReportFinalizeQueue(', '  preliminaryReportIssues(');
assert(finalizeQueue.startsWith('async upsertReportFinalizeQueue(read, e, n)'), 'finalize queue upsert must accept the IRead accessor separately from the IPersistence writer');
assert(finalizeQueue.includes('await read.getPersistenceReader().readByAssociation(t)'), 'finalize queue must be read through IRead');
assert(!finalizeQueue.includes('e.getPersistenceReader()'), 'IPersistence has no getPersistenceReader(); reading through the writer throws on every call');
assert(finalizeQueue.includes('await e.removeByAssociation(t);'), 'finalize queue must still be rewritten through IPersistence');

assert(source.includes('await this.upsertReportFinalizeQueue(n, s, {'), 'modal submit must pass (read, persistence) to the finalize queue');
assert(source.includes('await this.reportApp.upsertReportFinalizeQueue(t, a, {'), 'web form submit must pass (read, persistence) to the finalize queue');
assert(!/upsertReportFinalizeQueue\((?:s|a), \{/.test(source), 'no caller may pass the IPersistence writer as the first argument');

// 2. A direct room counts as a TARS personal chat only when TARS is a member.
const roomHelpers = sliceBetween('function isDirectRoom(room)', 'function isArchiveRoom(room)');
const roomEvaluate = new Function(`${roomHelpers}\nreturn { isPersonalTarsRoom, isDirectRoom };`);
const { isPersonalTarsRoom } = roomEvaluate();
assert.strictEqual(isPersonalTarsRoom({ type: 'd', usernames: ['tars', 'narek'] }), true, 'DM with the tars user is personal');
assert.strictEqual(isPersonalTarsRoom({ type: 'd', usernames: ['tars-report.bot', 'narek'] }), true, 'DM with the app user is personal');
assert.strictEqual(isPersonalTarsRoom({ type: 'd', usernames: ['narek', 'shura'] }), false, 'DM between two employees must not be treated as a TARS personal chat');
assert.strictEqual(isPersonalTarsRoom({ type: 'd', id: 'opaque' }), true, 'DM without member list stays permissive for mobile upload placeholders');
assert.strictEqual(isPersonalTarsRoom({ type: 'p', slugifiedName: 'tars-narek', usernames: ['narek', 'shura'] }), true, 'tars-* private rooms stay personal regardless of members');
assert.strictEqual(isPersonalTarsRoom({ type: 'c', slugifiedName: 'otchet' }), false);

// 3. Negated success words must not mark a receipt as executed.
const gazpromHelpers = sliceBetween('function isGazpromReceiptText', 'function receiptAmountFromAiValue');
const statusBlock = sliceBetween('function receiptStatusRejection', 'function receiptContainerScreenshotRejection');
const receiptStatusRejection = new Function(`${gazpromHelpers}\n${statusBlock}\nreturn receiptStatusRejection;`)();
assert.match(receiptStatusRejection('Сбербанк. Перевод не выполнен'), /НЕ ВЫПОЛНЕН/);
assert.match(receiptStatusRejection('Тинькофф. Платёж не исполнен'), /НЕ ВЫПОЛНЕН/);
assert.match(receiptStatusRejection('Операция завершена неуспешно'), /НЕ ВЫПОЛНЕН/);
assert.match(receiptStatusRejection('Transfer unsuccessful'), /НЕ ВЫПОЛНЕН/);
assert.strictEqual(receiptStatusRejection('Сбербанк. Перевод выполнен. Сумма 1 000 ₽'), '');
assert.strictEqual(receiptStatusRejection('Операция выполнена успешно'), '');
assert.strictEqual(receiptStatusRejection('Payment completed successfully'), '');
assert.strictEqual(receiptStatusRejection('ПАО Сбербанк. Перевод отправлен. Сумма перевода 1000 ₽'), '');

// 4. Stop words of the "сумма переводов" request must not leak through latinized variants.
const namesBlock = sliceBetween('function transferSummaryCandidateNames(message)', 'function isMasterTransferSumRequest(message)');
const variantsBlock = sliceBetween('function transferNameVariants(value)', 'function transferNameKey(value)');
const latinBlock = sliceBetween('function latinizeUsername(value)', 'function transferNameVariants(value)');
const transferSummaryCandidateNames = new Function(`${latinBlock}\n${variantsBlock}\n${namesBlock}\nreturn transferSummaryCandidateNames;`)();
assert.deepStrictEqual(transferSummaryCandidateNames({ text: 'сумма переводов за сегодня' }), [], 'day-total request must yield no master candidates');
assert.deepStrictEqual(transferSummaryCandidateNames({ text: 'Сумма переводов сегодня, пожалуйста' }), []);
assert(transferSummaryCandidateNames({ text: 'сумма переводов @narek сегодня' }).includes('narek'), 'explicit master mention must still be detected');
assert(transferSummaryCandidateNames({ text: 'сумма переводов Наташа за сегодня' }).includes('natasha'), 'cyrillic master name must still produce its latinized variant');

console.log('PASS: finalize queue accessors, DM scope, negated receipt status and transfer-sum stop words are guarded');
