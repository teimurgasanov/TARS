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
assert(block('confirmedTransferSummaryForUser').includes('const index = await readIndex(read, PROTECTED_ROOMS.kassa.index)'));
assert(!block('confirmedTransferSummaryForUser').includes('masterTransferLedgerAssociation(userId, workday)'));
assert(block('publishMasterTransferSummaryUnlocked').includes('expectedReceiptDate(config)'));
assert(block('resolveTransferSummaryUser').includes('expectedReceiptDate(config || {})'));
assert(block('sendMasterTransferSummaryRequest').includes('const targetDate = expectedReceiptDate(config);'));
assert(block('repairTodayReceiptIndex').includes('const targetDate = expectedReceiptDate(config);'));
assert(block('repairTodayReceiptIndex').includes('receiptCalendarDateForTimestamp(createdAt, config)'));
assert(block('sendTodayTransferSummary').includes('const targetDate = expectedReceiptDate(config);'));
assert(s.includes('receiptDate: entry.receiptDate || receiptCalendarDateForTimestamp(createdAt, config || {})'));

// Receipt-only command/fallback paths must never fall back to report workday semantics.
assert(!s.includes('const targetDate = String(entry && entry.receiptDate || expectedWorkday(ocrConfig));'), 'receipt summary refresh still falls back to workday');
assert(!s.includes('let date = this.reportWorkday(), username = "";'), '/cheki still defaults to report workday');
assert(!s.includes('let targetDate = this.reportWorkday();'), '/prinyat still defaults to report workday');

// Workday semantics must remain present elsewhere for reports/cleanup.
assert(s.includes('workdayForTimestamp('), 'report/cleanup workday helper unexpectedly removed');

const calStart=s.indexOf('function receiptCalendarDateForTimestamp');
const calEnd=s.indexOf('function expectedReceiptDate',calStart);
const wdStart=s.indexOf('function workdayForTimestamp');
const wdEnd=s.indexOf('function expectedWorkday',wdStart);
assert(calStart>=0&&calEnd>calStart&&wdStart>=0&&wdEnd>wdStart);
eval(s.slice(wdStart,wdEnd));
eval(s.slice(calStart,calEnd));
const cfg={timeZone:'Europe/Astrakhan',cutoffHour:4};
const cases=[
  ['2026-08-24T19:59:00Z','2026-08-24','2026-08-24'], // 23:59 Aug 24
  ['2026-08-24T20:00:00Z','2026-08-25','2026-08-24'], // 00:00 Aug 25
  ['2026-08-24T23:59:00Z','2026-08-25','2026-08-24'], // 03:59 Aug 25
  ['2026-08-25T00:00:00Z','2026-08-25','2026-08-25']  // 04:00 Aug 25
];
for(const [iso,receiptDay,workday] of cases){
  const ts=Date.parse(iso);
  assert.strictEqual(receiptCalendarDateForTimestamp(ts,cfg),receiptDay,`receipt day ${iso}`);
  assert.strictEqual(workdayForTimestamp(ts,cfg),workday,`workday ${iso}`);
}
console.log('PASS: receipt calendar date is consistent at 23:59/00:00/03:59/04:00 while report workday remains separate');
