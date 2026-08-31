const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const summaryStart = source.indexOf('async function confirmedTransferSummaryForUser');
const summaryEnd = source.indexOf('function masterTransferSummaryAssociation', summaryStart);
const summary = source.slice(summaryStart, summaryEnd);
assert.match(summary, /entry\.source !== "rejected"/);
assert.match(summary, /confirmedReceiptKeys/);
assert.match(summary, /masterTransferLedgerAssociation\(userId, workday\)/);
assert.match(summary, /acceptedKey && confirmedReceiptKeys\[acceptedKey\]/);
assert.match(summary, /sameReceiptMessageImage\(confirmed, entry\)/);
assert.match(summary, /pendingReview \+= 1/);
assert.match(summary, /pendingReview \}/);

const reportStart = source.indexOf('async sendReport(');
const reportEnd = source.indexOf('async sendOwnerShortReport', reportStart);
const report = source.slice(reportStart, reportEnd);
assert.match(report, /pendingReceiptReview = pendingReceiptCount > 0/);
assert.match(report, /shortage && pendingReceiptReview/);
assert.match(report, /pendingReceiptReview \? "#f59e0b"/);

const ownerStart = source.indexOf('async sendOwnerShortReport');
const ownerEnd = source.indexOf('async sendPublicClientSummary', ownerStart);
const owner = source.slice(ownerStart, ownerEnd);
assert.match(owner, /чеки на проверке/);
assert.match(owner, /cashDifference < -0\.005 && !pendingReceiptReview/);

console.log('PASS: rejected receipts awaiting review cannot present a final red shortage');
