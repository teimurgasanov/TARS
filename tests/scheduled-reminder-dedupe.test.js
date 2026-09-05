const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async scheduledReportRemindersJob');
const end = source.indexOf('async upsertReportFinalizeQueue', start);
if (start < 0 || end < 0 || end <= start) throw new Error('scheduled reminder block not found');
const block = source.slice(start, end);

assert(block.includes('if (x && x.userId) u[x.userId] = true;'), 'any reminder persisted for the workday must claim that user');
assert(block.includes('const v = x.masterUserId;'), 'scheduled reminders must be deduped per user for the whole workday');
assert(block.includes('if (u[v]) continue;'), 'an existing workday reminder must block later reminder slots');
assert(!block.includes('`${x.userId}:${x.slot}`'), 'later time slots must not create additional reminder messages');

const finish = block.indexOf('await t.getCreator().finish(N);');
const push = block.indexOf('h.push({ userId: x.masterUserId', finish);
assert(finish >= 0 && push > finish, 'reminder send/persist sequence not found');
const afterSend = block.slice(finish, push);
assert(afterSend.includes('u[v] = true;'), 'successful send must claim the user for the workday before the loop can see duplicate room records');

const queuedStart = source.indexOf('async sendQueuedReportReminder');
const queuedEnd = source.indexOf('async removeLegacyPersonalReportMenus', queuedStart);
if (queuedStart < 0 || queuedEnd < 0 || queuedEnd <= queuedStart) throw new Error('queued reminder block not found');
const queuedBlock = source.slice(queuedStart, queuedEnd);
assert.match(queuedBlock, /previousReminderIssuesKey === reminderIssuesKey/, 'unchanged missing-item reminders must not be posted repeatedly');
assert.match(queuedBlock, /lastReminderCheckedAt: s/, 'a suppressed duplicate reminder must still record that it was checked');
assert.match(queuedBlock, /if \(!v\.length\) return \{ \.\.\.t, lastReminderIssues: \[\]/, 'resolved issues must clear the dedupe state so a genuinely new issue can be announced');

console.log('PASS: report reminders are deduped per workday and unchanged issue set');
