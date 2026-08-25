const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
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
