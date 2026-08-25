const fs=require('fs'), assert=require('assert');
const s=fs.readFileSync('TarsReportApp.js','utf8');
const repair=s.indexOf('async function repairTodayReceiptIndex');
assert(repair>=0,'repairTodayReceiptIndex missing');
const tail=s.slice(repair, repair+9000);
assert(tail.includes('receiptCalendarDateForTimestamp(createdAt, config)'), 'receipt repair must scan by calendar date');
assert(!tail.includes('const messageDate = workdayForTimestamp(createdAt, config);'), 'receipt repair must not bucket messages by workday');
const summary=s.indexOf('async function confirmedTransferSummaryForUser');
assert(summary>=0,'confirmedTransferSummaryForUser missing');
const sumBlock=s.slice(summary, summary+8000);
assert(sumBlock.includes('dateFromEntry'), 'summary must derive date from receipt entry');
console.log('PASS: receipt repair and aggregation use receipt calendar date');
{
  const fs=require('fs'), assert=require('assert');
  const s=fs.readFileSync('TarsReportApp.js','utf8');
  const start=s.indexOf('async function repairTodayReceiptIndex');
  const end=s.indexOf('\n    async function ',start+30);
  const block=s.slice(start,end>start?end:undefined);
  assert(block.includes('const targetDate = expectedReceiptDate(config);'),'repair targetDate must be receipt calendar date');
  assert(!block.includes('const targetDate = expectedWorkday(config);'),'repair must not use workday target date');
  assert(block.includes('receiptCalendarDateForTimestamp(createdAt, config)'),'message scan must use receipt calendar date');
  console.log('PASS: receipt repair target and message dates share calendar semantics');
}
