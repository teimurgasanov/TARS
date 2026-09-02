const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const routeStart = source.indexOf('async function fastForwardPersonalReportPhotos');
const routeEnd = source.indexOf('async function publishDirectReportPhotos', routeStart);
const start = source.indexOf('async function publishMasterTransferSummary');
const end = source.indexOf('function latinizeUsername', start);

if (start < 0 || end <= start) throw new Error('publishMasterTransferSummary block not found');

const route = source.slice(routeStart, routeEnd);
const block = source.slice(start, end);
const calculate = block.indexOf('receiptLedgerSummaryForUser');
const previous = block.indexOf('readByAssociation');
const removePrevious = block.indexOf('deleteMessage');
const createUpdated = block.indexOf('startMessage().setSender(appUser).setRoom(room).setText(text)');
const persistUpdated = block.indexOf('createWithAssociation');

assert.ok(calculate >= 0, 'receipt total calculation helper must remain available for report verification');
assert.match(block, /receiptSummaryQueue\.then\(runSummary, runSummary\)/, 'near-simultaneous receipt totals must be serialized');
assert.match(block, /receiptLedgerSummaryForUser/, 'receipt total must be recalculated from the daily ledger');
assert.match(block, /receiptOwnerForMessage\(message, read\)/, 'receipt ledger owner must come from the personal TARS room');
assert.match(source, /receiptLedgerEntryKey\(receipt\)/, 'accepted receipts must use their exact image hash in the money ledger');
assert.match(source, /if \(exact\) return `exact:\$\{exact\}`/, 'same OCR identity must not merge different accepted receipt photos');
assert.ok(previous > calculate, 'previous daily total must be loaded after recalculation');
assert.ok(removePrevious > previous, 'previous daily total must be removed before replacement');
assert.ok(createUpdated > removePrevious, 'updated daily total must be posted after removing the previous one');
assert.ok(persistUpdated > createUpdated, 'updated daily total message id must be persisted');
assert.match(block, /🧾 ИТОГО ПО ЧЕКАМ ЗА \$\{displayDate\(targetDate\)\}/);
assert.match(block, /Чеков: \$\{summary\.count\}/);
assert.match(block, /Общая сумма чеков: \$\{amountText\} ₽/);
assert.match(block, /summary\.amounts\.map/, 'daily ledger rows must be shown above the total');
assert.doesNotMatch(block, /Мастер: \$\{username\}/);
assert.doesNotMatch(block, /Дата: \$\{displayDate\(targetDate\)\}/);
assert.match(block, /includeCurrentValidatedReceipt \? ownerReceipts : void 0/);
assert.match(source, /Array\.isArray\(currentValidatedReceipts\)/);

const acceptedResult = route.indexOf('publishAcceptedReceipt(preclassifiedReceipt');
const immediateTotal = route.indexOf('publishMasterTransferSummary(preclassifiedReceipt');
assert.ok(acceptedResult >= 0 && immediateTotal > acceptedResult, 'running total must be posted immediately below the accepted receipt result');
assert.match(route, /publishMasterTransferSummary\(preclassifiedReceipt, message, read, persistence, modify, config, logger, true\)/);

const processingStart = source.indexOf('async function rejectDuplicateMessage');
const processingEnd = source.indexOf('function isTodayTransferSumRequest', processingStart);
const processing = source.slice(processingStart, processingEnd);
assert.match(processing, /await publishMasterTransferSummary\(entry, message, read, persistence, modify, ocrConfig, logger, true, receiptEntries\)/);

const reportEndpointStart = source.indexOf('var S = class extends A.ApiEndpoint');
const reportEndpointGetEnd = source.indexOf('  async post(e, n, t, s, r, a)', reportEndpointStart);
const reportEndpointGet = source.slice(reportEndpointStart, reportEndpointGetEnd);
assert.match(reportEndpointGet, /confirmedTransferSummaryForUser\(t, receiptConfig, m\.userId, I,[\s\S]*tokenRoom\.id\)/,
  'report form must read the confirmed receipt total for the room owner and workday');
assert.match(reportEndpointGet, /const transfersLocked = confirmedTransfers !== null/,
  'receipt field may be locked only after the authoritative total was read successfully');
assert.match(reportEndpointGet, /const resolvedFormData = P \? \{ \.\.\.P, transfers: resolvedTransfers \} : null/,
  'a saved report must not restore a stale manually-entered receipt total');
assert.match(reportEndpointGet, /confirmedReceiptCount:/);
assert.match(reportEndpointGet, /pendingReceiptCount:/);
assert.match(reportEndpointGet, /catch \(receiptSummaryError\)/,
  'receipt-total lookup failure must preserve the previous editable report form behavior');

const formScriptStart = source.indexOf('var REPORT_FORM_SCRIPT =');
const formScriptEnd = source.indexOf('var ReportFormEndpoint =', formScriptStart);
const formScript = source.slice(formScriptStart, formScriptEnd);
assert.match(formScript, /autoTransfers=data\.transfersLocked===true&&Number\.isFinite\(Number\(data\.confirmedTransfers\)\)/);
assert.match(formScript, /transfersEl\.value=autoTransfers\?Number\(data\.confirmedTransfers\)/,
  'report table must display the authoritative confirmed receipt total');
assert.match(formScript, /transfersEl\.readOnly=autoTransfers/,
  'master must not accidentally overwrite the confirmed receipt total');
assert.match(formScript, /Сумма чеков заполнена автоматически/);

console.log('PASS: accepted receipts drive both the daily running total and the automatic report-table receipt field');
