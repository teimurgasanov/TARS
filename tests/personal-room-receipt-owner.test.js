const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const ownerStart = source.indexOf('async function receiptOwnerForMessage');
const ownerEnd = source.indexOf('async function publishAcceptedReceipt', ownerStart);
const ownerBlock = source.slice(ownerStart, ownerEnd);
assert.match(ownerBlock, /getMembers\(message\.room\.id\)/);
assert.match(ownerBlock, /candidate !== "tars" && candidate !== "teimur" && candidate !== "shura"/);
assert.match(ownerBlock, /if \(owners\.length === 1\) return owners\[0\]/);

const summaryStart = source.indexOf('async function confirmedTransferSummaryForUser');
const summaryEnd = source.indexOf('function masterTransferSummaryAssociation', summaryStart);
const summaryBlock = source.slice(summaryStart, summaryEnd);
assert.match(summaryBlock, /sourceRoomId = ""/);
assert.match(summaryBlock, /String\(entry\.roomId \|\| ""\) === String\(sourceRoomId\)/);

console.log('PASS: receipts uploaded by an admin are credited to the unique owner of the personal room');
