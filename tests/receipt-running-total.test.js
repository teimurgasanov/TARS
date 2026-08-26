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
const calculate = block.indexOf('confirmedTransferSummaryForUser');
const previous = block.indexOf('readByAssociation');
const removePrevious = block.indexOf('deleteMessage');
const createUpdated = block.indexOf('startMessage().setSender(appUser).setRoom(room).setText(text)');
const persistUpdated = block.indexOf('createWithAssociation');

assert.ok(calculate >= 0, 'receipt total must be recalculated from confirmed receipts');
assert.ok(previous > calculate, 'previous daily total must be loaded after recalculation');
assert.ok(removePrevious > previous, 'previous daily total must be removed before replacement');
assert.ok(createUpdated > removePrevious, 'updated daily total must be posted after removing the previous one');
assert.ok(persistUpdated > createUpdated, 'updated daily total message id must be persisted');
assert.match(block, /🧾 ИТОГО ПО ЧЕКАМ/);
assert.match(block, /Чеков: \$\{summary\.count\}/);
assert.match(block, /Общая сумма чеков: \$\{amountText\} ₽/);
assert.match(block, /includeCurrentValidatedReceipt \? entry : void 0/);
assert.match(source, /currentValidatedReceipt && currentValidatedReceipt\.source === "pre"/);

const acceptedResult = route.indexOf('publishAcceptedReceipt(preclassifiedReceipt');
const immediateTotal = route.indexOf('publishMasterTransferSummary(preclassifiedReceipt');
assert.ok(acceptedResult >= 0 && immediateTotal > acceptedResult, 'running total must be posted immediately below the accepted receipt result');
assert.match(route, /publishMasterTransferSummary\(preclassifiedReceipt, message, read, persistence, modify, config, logger, true\)/);

const processingStart = source.indexOf('async function rejectDuplicateMessage');
const processingEnd = source.indexOf('function isTodayTransferSumRequest', processingStart);
const processing = source.slice(processingStart, processingEnd);
assert.match(processing, /await publishMasterTransferSummary\(entry, message, read, persistence, modify, ocrConfig, logger\)/);

console.log('PASS: accepted receipts replace the daily running total with recalculated count and amount');
