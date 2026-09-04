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

const refreshStart = source.indexOf('async refreshPreliminaryReportAnalysis');
const refreshEnd = source.indexOf('async sendQueuedReportReminder', refreshStart);
if (refreshStart < 0 || refreshEnd <= refreshStart) throw new Error('refreshPreliminaryReportAnalysis block not found');
const refresh = source.slice(refreshStart, refreshEnd);
assert.match(refresh, /masterUserForPersonalReportRoom\(n, a, t\)/, 'late receipt reconciliation must resolve the room owner instead of the uploader');
assert.match(refresh, /refreshFinancialReport === true/, 'full report replacement must be explicitly gated to accepted receipts');
assert.match(refresh, /confirmedTransferSummaryForUser\(n, h, reportOwner\.id, o/, 'reconciliation must recalculate the verified receipt ledger for the report owner');
assert.match(refresh, /this\.sendReport\(r, a, reportOwner, f\.rows, f\.cash, f\.transfers/, 'accepted late receipts must rebuild the existing report from stored form values');
assert.match(refresh, /this\.sendOwnerShortReport\(/, 'accepted late receipts must refresh the owner summary');
assert.doesNotMatch(refresh, /submittedFormData\(/, 'receipt reconciliation must not rewrite the master-entered form values');
assert.ok(refresh.indexOf('this.sendReport(') < refresh.indexOf('Date.now() >= dueAt'), 'late receipts must rebuild the report even after the preliminary-report deadline');

const postStart = source.indexOf('async executePostMessageSent');
const postEnd = source.indexOf('async receiptOcrConfig', postStart);
const post = source.slice(postStart, postEnd);
assert.match(post, /receiptWasAcceptedForMessage\(n, e\)[\s\S]*refreshFinancialReport: receiptAccepted/, 'normal receipt uploads must refresh the financial report only after acceptance');

const approvalStart = source.indexOf('async handleApproveReceiptCommand');
const approvalEnd = source.indexOf('photoReportIntentAssociation', approvalStart);
const approvals = source.slice(approvalStart, approvalEnd);
assert.strictEqual((approvals.match(/refreshFinancialReport: true/g) || []).length, 2, 'both manual approval paths must reconcile the stored report');
assert.strictEqual((approvals.match(/workday: targetDate/g) || []).length, 2, 'manual approvals must reconcile the report for the receipt date');

console.log('PASS: accepted receipts update the running total and reconcile stored reports without changing manual form values');
