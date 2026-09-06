const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

function extractMethod(name, nextName) {
  const methodStart = source.indexOf(`  ${name}(`);
  const methodEnd = source.indexOf(`  ${nextName}(`, methodStart);
  assert(methodStart >= 0 && methodEnd > methodStart, `${name} method not found`);
  const methodSource = source.slice(methodStart, methodEnd).trim();
  const match = methodSource.match(new RegExp(`^${name}\\((.*)\\) \\{\\n([\\s\\S]*)\\n\\s*\\}$`));
  assert(match, `${name} method could not be compiled`);
  return new Function(`return function(${match[1]}) {${match[2]}\n}`)();
}

const reportReminderDue = extractMethod('reportReminderDue', 'reportReminderSlot');
const reportReminderSlot = extractMethod('reportReminderSlot', 'reportScheduledReminderAssociation');

const slotAt = (minutes) => reportReminderSlot.call({ reportLocalMinutes: () => minutes }, 0);
assert.strictEqual(slotAt(19 * 60 + 44), '', 'no scheduled reminder is allowed before 19:45');
assert.strictEqual(slotAt(19 * 60 + 45), '19:45');
assert.strictEqual(slotAt(20 * 60), '20:00');
assert.strictEqual(slotAt(20 * 60 + 15), '20:15');
assert.strictEqual(slotAt(20 * 60 + 25), '20:15', '20:25 must reuse the persisted 20:15 slot');
assert.strictEqual(slotAt(20 * 60 + 55), '20:15', 'no rolling reminder slots are allowed after 20:15');
assert.strictEqual(slotAt(21 * 60), '', 'the reminder scheduler must stop at the 21:00 final check');

const reminderContext = { reportReminderStartAt: () => 1000 };
assert.strictEqual(reportReminderDue.call(reminderContext, { dueAt: 3000, lastReminderAt: 0 }, 2000), true, 'the first 20:15 queued reminder remains due');
assert.strictEqual(reportReminderDue.call(reminderContext, { dueAt: 3000, lastReminderAt: 1100 }, 2000), false, 'a queued reminder must not repeat after it was sent once');
assert.strictEqual(reportReminderDue.call(reminderContext, { dueAt: 2000, lastReminderAt: 0 }, 2000), false, 'the 21:00 finalization boundary remains authoritative');

const start = source.indexOf('async scheduledReportRemindersJob');
const end = source.indexOf('async upsertReportFinalizeQueue', start);
if (start < 0 || end < 0 || end <= start) throw new Error('scheduled reminder block not found');
const block = source.slice(start, end);

assert(block.includes('const v = `${x.masterUserId}:${o}`;'), 'reminder dedupe key must remain user+slot scoped');
assert(block.includes('if (u[v]) continue;'), 'existing persisted reminder must still block repeats');

const finish = block.indexOf('await t.getCreator().finish(N);');
const push = block.indexOf('h.push({ userId: x.masterUserId', finish);
assert(finish >= 0 && push > finish, 'reminder send/persist sequence not found');
const afterSend = block.slice(finish, push);
assert(afterSend.includes('u[v] = true;'), 'successful send must claim the user+slot immediately before the loop can see duplicate room records');

console.log('PASS: scheduled report reminder is deduped within one recurring job run');
