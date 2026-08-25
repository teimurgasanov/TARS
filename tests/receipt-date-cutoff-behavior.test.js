const fs=require('fs'), assert=require('assert');
const s=fs.readFileSync('TarsReportApp.js','utf8');

function block(name){
  let start=s.indexOf(`function ${name}`);
  if(start<0) start=s.indexOf(`async function ${name}`);
  assert(start>=0, `${name} missing`);
  const a=s.indexOf('\n    async function ',start+20);
  const f=s.indexOf('\n    function ',start+20);
  const ends=[a,f].filter(x=>x>start);
  const end=ends.length?Math.min(...ends):s.length;
  return s.slice(start,end);
}

assert(block('dateFromEntry').includes('receiptCalendarDateForTimestamp(entry && entry.uploadedAt, config)'));
assert(block('confirmedTransferSummaryForUser').includes('targetDate || expectedReceiptDate(config)'));
assert(block('publishMasterTransferSummary').includes('expectedReceiptDate(config)'));
assert(block('resolveTransferSummaryUser').includes('expectedReceiptDate(config || {})'));
assert(block('sendMasterTransferSummaryRequest').includes('const targetDate = expectedReceiptDate(config);'));
assert(block('repairTodayReceiptIndex').includes('const targetDate = expectedReceiptDate(config);'));
assert(block('repairTodayReceiptIndex').includes('receiptCalendarDateForTimestamp(createdAt, config)'));
assert(block('sendTodayTransferSummary').includes('const targetDate = expectedReceiptDate(config);'));
assert(s.includes('receiptDate: entry.receiptDate || receiptCalendarDateForTimestamp(createdAt, config || {})'));

// Workday semantics must remain present elsewhere for reports/cleanup.
assert(s.includes('workdayForTimestamp('), 'report/cleanup workday helper unexpectedly removed');

// Explicit cutoff boundary: local 00:30 on Aug 25 is receipt date Aug 25, while workday may still be Aug 24.
const calStart=s.indexOf('function receiptCalendarDateForTimestamp');
const calEnd=s.indexOf('function expectedReceiptDate',calStart);
const wdStart=s.indexOf('function workdayForTimestamp');
const wdEnd=s.indexOf('function expectedWorkday',wdStart);
assert(calStart>=0&&calEnd>calStart&&wdStart>=0&&wdEnd>wdStart);
eval(s.slice(wdStart,wdEnd));
eval(s.slice(calStart,calEnd));
const cfg={timeZone:'Europe/Astrakhan',cutoffHour:4};
const ts=Date.parse('2026-08-24T20:30:00Z'); // 00:30 Aug 25 Astrakhan
assert.strictEqual(receiptCalendarDateForTimestamp(ts,cfg),'2026-08-25');
assert.strictEqual(workdayForTimestamp(ts,cfg),'2026-08-24');
console.log('PASS: receipt accounting is calendar-day based across cutoff; report workday remains separate');
