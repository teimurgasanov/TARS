const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

function sliceBetween(startMarker, endMarker, from = 0) {
  const start = source.indexOf(startMarker, from);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error(`block not found: ${startMarker}`);
  return source.slice(start, end);
}

// 1. Report finalize queue must read through IRead and write through IPersistence.
const finalizeQueue = sliceBetween('async upsertReportFinalizeQueue(', '  preliminaryReportIssues(');
assert(finalizeQueue.startsWith('async upsertReportFinalizeQueue(read, e, n)'), 'finalize queue upsert must accept the IRead accessor separately from the IPersistence writer');
assert(finalizeQueue.includes('await read.getPersistenceReader().readByAssociation(t)'), 'finalize queue must be read through IRead');
assert(!finalizeQueue.includes('e.getPersistenceReader()'), 'IPersistence has no getPersistenceReader(); reading through the writer throws on every call');
assert(finalizeQueue.includes('await e.removeByAssociation(t);'), 'finalize queue must still be rewritten through IPersistence');

assert(source.includes('await this.upsertReportFinalizeQueue(n, s, {'), 'modal submit must pass (read, persistence) to the finalize queue');
assert(source.includes('await this.reportApp.upsertReportFinalizeQueue(t, a, {'), 'web form submit must pass (read, persistence) to the finalize queue');
assert(!/upsertReportFinalizeQueue\((?:s|a), \{/.test(source), 'no caller may pass the IPersistence writer as the first argument');

// 2. A direct room counts as a TARS personal chat only when TARS is a member.
const roomHelpers = sliceBetween('function isDirectRoom(room)', 'function isArchiveRoom(room)');
const roomEvaluate = new Function(`${roomHelpers}\nreturn { isPersonalTarsRoom, isDirectRoom };`);
const { isPersonalTarsRoom } = roomEvaluate();
assert.strictEqual(isPersonalTarsRoom({ type: 'd', usernames: ['tars', 'narek'] }), true, 'DM with the tars user is personal');
assert.strictEqual(isPersonalTarsRoom({ type: 'd', usernames: ['tars-report.bot', 'narek'] }), true, 'DM with the app user is personal');
assert.strictEqual(isPersonalTarsRoom({ type: 'd', usernames: ['narek', 'shura'] }), false, 'DM between two employees must not be treated as a TARS personal chat');
assert.strictEqual(isPersonalTarsRoom({ type: 'd', id: 'opaque' }), true, 'DM without member list stays permissive for mobile upload placeholders');
assert.strictEqual(isPersonalTarsRoom({ type: 'p', slugifiedName: 'tars-narek', usernames: ['narek', 'shura'] }), true, 'tars-* private rooms stay personal regardless of members');
assert.strictEqual(isPersonalTarsRoom({ type: 'c', slugifiedName: 'otchet' }), false);

// 3. Negated success words must not mark a receipt as executed.
const gazpromHelpers = sliceBetween('function isGazpromReceiptText', 'function receiptAmountFromAiValue');
const statusBlock = sliceBetween('function receiptStatusRejection', 'function receiptContainerScreenshotRejection');
const receiptStatusRejection = new Function(`${gazpromHelpers}\n${statusBlock}\nreturn receiptStatusRejection;`)();
assert.match(receiptStatusRejection('Сбербанк. Перевод не выполнен'), /НЕ ВЫПОЛНЕН/);
assert.match(receiptStatusRejection('Тинькофф. Платёж не исполнен'), /НЕ ВЫПОЛНЕН/);
assert.match(receiptStatusRejection('Операция завершена неуспешно'), /НЕ ВЫПОЛНЕН/);
assert.match(receiptStatusRejection('Transfer unsuccessful'), /НЕ ВЫПОЛНЕН/);
assert.strictEqual(receiptStatusRejection('Сбербанк. Перевод выполнен. Сумма 1 000 ₽'), '');
assert.strictEqual(receiptStatusRejection('Операция выполнена успешно'), '');
assert.strictEqual(receiptStatusRejection('Payment completed successfully'), '');
assert.strictEqual(receiptStatusRejection('ПАО Сбербанк. Перевод отправлен. Сумма перевода 1000 ₽'), '');

// 4. Stop words of the "сумма переводов" request must not leak through latinized variants.
const namesBlock = sliceBetween('function transferSummaryCandidateNames(message)', 'function isMasterTransferSumRequest(message)');
const variantsBlock = sliceBetween('function transferNameVariants(value)', 'function transferNameKey(value)');
const latinBlock = sliceBetween('function latinizeUsername(value)', 'function transferNameVariants(value)');
const transferSummaryCandidateNames = new Function(`${latinBlock}\n${variantsBlock}\n${namesBlock}\nreturn transferSummaryCandidateNames;`)();
assert.deepStrictEqual(transferSummaryCandidateNames({ text: 'сумма переводов за сегодня' }), [], 'day-total request must yield no master candidates');
assert.deepStrictEqual(transferSummaryCandidateNames({ text: 'Сумма переводов сегодня, пожалуйста' }), []);
assert(transferSummaryCandidateNames({ text: 'сумма переводов @narek сегодня' }).includes('narek'), 'explicit master mention must still be detected');
assert(transferSummaryCandidateNames({ text: 'сумма переводов Наташа за сегодня' }).includes('natasha'), 'cyrillic master name must still produce its latinized variant');

console.log('PASS: finalize queue accessors, DM scope, negated receipt status and transfer-sum stop words are guarded');

// ---------------------------------------------------------------------------
// Second batch: remaining review findings.

// 5. Penalty type is resolved from whole tokens with the employee name excluded.
const penaltyMethods = sliceBetween('  latenessAmount(e) {', '  personLookupMatches(');
const penaltyApp = new Function(`return new (class {\n${penaltyMethods}\n})();`)();
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Матвей 10', 10, 10, 'Матвей').kind, 'lateness', 'name "Матвей" must not trigger the "мат" rule');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('штраф @matveev 10', 10, 10, '@matveev').kind, 'lateness', 'login containing "tv" must not trigger the TV rule');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Литвинова 5', 5, 5, 'Литвинова').kind, 'lateness');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Дарья не ответила клиенту', 0, 0, 'Дарья').kind, 'lateness', '"ответила" must not match "тв" as a substring');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Домна 10', 10, 10, 'Домна').kind, 'lateness', 'name "Домна" must not trigger the contacts rule');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Дарья мат', 0, 0, 'Дарья').kind, 'communication', 'explicit "мат" keyword still resolves');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Дарья форма', 0, 0, 'Дарья').kind, 'dress_code');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Дарья опоздала 12', 12, 12, 'Дарья').kind, 'lateness');
assert.strictEqual(penaltyApp.resolvePenaltyDetails('Штраф Дарья фотоотчет', 0, 0, 'Дарья').kind, 'missing_photo', 'compound word still matches by prefix');
assert(source.includes('penalty: this.resolvePenaltyDetails(n, c ? Number(c) : 0, c ? Number(c) : 0, r) };'), 'text command must exclude the parsed name query');
assert(source.includes('this.resolvePenaltyDetails(I.join(" "), h || 0, h || 0, f));'), 'slash command must exclude the login argument');

// 6. Money columns in the report table are padded, never cut.
const columnHelper = 'let w = R || i.length <= p ? i : i.slice(0, p);';
assert(source.includes(columnHelper), 'right-aligned numeric cells must not be sliced');
const h = new Function('i', 'p', 'R', `${columnHelper}\nreturn R ? w.padStart(p) : w.padEnd(p);`);
assert.strictEqual(h('12 000', 5, true), '12 000');
assert.strictEqual(h('100 000', 6, true), '100 000');
assert.strictEqual(h('800', 5, true), '  800');
assert.strictEqual(h('Очень длинное название', 8, false), 'Очень дл');

// 7. Transfer-sum requests from the receipt room reach the handler.
const gate = sliceBetween('async checkPostMessageSent(e, n, t)', 'async executePostMessageSent(');
assert(gate.includes('G.isMasterTransferSumRequest(transferSumEvent) || G.isTodayTransferSumRequest(transferSumEvent)'), 'checkPostMessageSent must admit transfer-sum requests');
const execute = sliceBetween('async executePostMessageSent(e, n, t, s, r)', 'async receiptOcrConfig(e)');
assert(execute.includes('if (G.isMasterTransferSumRequest(e) && await G.sendMasterTransferSummaryRequest(e, n, s, r, this.getLogger(), t, i)) return;'), 'master transfer summary handler must remain reachable');
assert(execute.includes('if (G.isTodayTransferSumRequest(e)) await G.sendTodayTransferSummary(e, n, s, r, this.getLogger(), t, i);'), 'day total handler must remain reachable');
const mediaV2Head = sliceBetween('async function processPersonalMediaV2(', 'const imageFiles = messageImageFiles(message);');
assert(mediaV2Head.includes('if (!message || !isPersonalTarsRoom(message.room)) return { handled: false, status: "not-personal" };'), 'receipt-room text must pass through the media pipeline untouched');

// 8. Pending report photo job is bound to the app and actually scheduled.
const scheduler = sliceBetween('e.scheduler.registerProcessors([', ']);');
assert(!scheduler.includes('processor: this.forwardPendingReportPhotosJob'), 'processors must not be passed as unbound methods');
const pendingJob = scheduler.slice(scheduler.indexOf('id: "forward-pending-report-photos"'));
assert(/processor: async \(jobContext, read, modify, http, persistence\) => this\.forwardPendingReportPhotosJob\(jobContext, read, modify, http, persistence\),\s*startupSetting: \{\s*type: J\.StartupType\.RECURRING,\s*interval: "5 minutes"/.test(pendingJob), 'forward-pending-report-photos must run as a recurring startup job');
const onUpdate = sliceBetween('async onUpdate(e, n, t, s, r)', 'async executePreFileUpload(');
assert(!onUpdate.includes('cancelJob("forward-pending-report-photos")'), 'onUpdate must not cancel the recurring job');
assert(onUpdate.includes('cancelJob("forward-pending-report-photos-now")'));

// 9. Reports and receipts share one effective workday cutoff and timezone.
const cutoffBlock = sliceBetween('function effectiveWorkdayCutoffHour(config)', 'function workdayForTimestamp(timestamp, config)');
const effectiveWorkdayCutoffHour = new Function(`${cutoffBlock}\nreturn effectiveWorkdayCutoffHour;`)();
assert.strictEqual(effectiveWorkdayCutoffHour({ cutoffHour: 0 }), 4);
assert.strictEqual(effectiveWorkdayCutoffHour({ cutoffHour: 2 }), 2);
assert.strictEqual(effectiveWorkdayCutoffHour({}), 4);
assert(source.includes('const cutoffHour = Math.min(12, Math.max(0, Number(config && config.cutoffHour) || 4));'), 'guard workday must keep the same cutoff formula');
assert(/module2\.exports = \{[\s\S]*?effectiveWorkdayCutoffHour,/.test(source), 'shared helper must be exported');
assert(source.includes('this.workdayCutoffHour = G.effectiveWorkdayCutoffHour(config);'), 'receiptOcrConfig must cache the effective cutoff for reports');
assert(source.includes('e = new Date(e.getTime() - this.reportWorkdayCutoffHour() * 60 * 60 * 1e3);'), 'reportWorkday must use the cached cutoff');
const appClass = source.slice(source.indexOf('var C = class extends j.App'));
assert(!appClass.includes('timeZone: "Europe/Astrakhan",'), 'report time helpers must use the configured timezone');
const reportWorkdayBlock = sliceBetween('  reportWorkdayCutoffHour() {', '  reportLocalHour(');
const workdayApp = new Function(`return new (class {\n${reportWorkdayBlock}\n})();`)();
assert.strictEqual(workdayApp.reportWorkday(new Date('2026-09-04T03:30:00+04:00')), '2026-09-03', 'default cutoff stays 04:00');
workdayApp.workdayCutoffHour = 2;
assert.strictEqual(workdayApp.reportWorkday(new Date('2026-09-04T03:30:00+04:00')), '2026-09-04', 'configured cutoff is honoured');

// 10. Report form token does not pin the workday of the button.
assert(!/test\((?:m|u)\.workday\) \? (?:m|u)\.workday : this\.reportApp\.reportWorkday\(\)/.test(source), 'endpoint must not reuse the workday stored in the button token');
assert(source.includes('I = this.reportApp.reportWorkday(),'));
assert(source.includes('w = this.reportApp.reportWorkday(),'));

// 11. Terminal photo statuses and a bounded retry queue.
const resetStale = sliceBetween('async function resetStaleReportPhotoForwards', 'async function publishRejectedReceiptReview');
assert(resetStale.includes('if (reportMessageId === "blocked_not_work_photo" || reportMessageId === "source_missing") continue;'), 'sentinels must not be looked up as message ids');
const pendingQueue = sliceBetween('async function publishPendingReportPhotos', 'async function resetInvisiblePermalinkForwards');
assert(pendingQueue.includes('const MAX_QUEUE_ATTEMPTS = 5;'));
assert(pendingQueue.includes('entry.reportMessageId = "source_missing";'), 'missing sources must stop being retried');
assert(pendingQueue.includes('if (reportMessageId === "duplicate" && !entry.reportQueuedAt) return false;'), 'already-published duplicates must not be re-marked every run');
const publishDirect = sliceBetween('async function publishDirectReportPhotos', 'async function publishPendingReportPhotos');
assert(/entry\.reportMessageId = entry\.reportMessageId \|\| "duplicate";\s*entry\.reportPublishedAt = entry\.reportPublishedAt \|\| Date\.now\(\);\s*delete entry\.reportQueuedAt;/.test(publishDirect));

// 12. Word boundaries after Cyrillic and the ruble sign.
const moneyRegexSource = /const money = (\/.*\/i)\.test\(source\);/.exec(source);
assert(moneyRegexSource, 'money regex not found');
const money = new Function(`return ${moneyRegexSource[1]};`)();
assert(money.test('перевод клиенту 1 800 ₽ 12:34'), 'ruble sign amount must count as money');
assert(money.test('1800 руб. получатель'), '"руб." amount must count as money');
assert(money.test('1800 rub'));
const timeAgoSource = /const timeAgo = (\/.*\/i)\.test\(source\);/.exec(source);
assert(timeAgoSource, 'timeAgo regex not found');
const timeAgo = new Function(`return ${timeAgoSource[1]};`)();
assert(timeAgo.test('доставлено 2 ч назад'), '"N ч назад" must be detected');
assert(timeAgo.test('5 мин назад отправлено'));
assert(!timeAgo.test('назадача'), 'boundary still required');

// 13. Direct room lookup, photo penalty guard, modal ids, /grafik, seeding, cleanup, pagination, archive url.
assert(source.includes('getDirectByUsernames([t.username, s.username].filter(Boolean))'), 'DM lookup must include both members');
assert(source.includes('if (u && !m && r && r.roomFound !== false) {'), 'no automatic photo penalty when the photo room was not found');
assert(!source.includes('"haircut-amount": "'), 'modal errors must not target a male-only block id');
assert(source.includes('const firstRowErrorBlock = `${modalRows[0] && modalRows[0].id || "haircut"}-amount`;'));
assert(source.includes('let autoExpense = reportType === "female" ? this.defaultFemaleExpense(p, w) : reportType === "male" ? this.defaultMaleExpense(p, w) : null;'), 'modal must apply the male colouring expense default too');
assert(source.includes('!/^[\\d.\\-\\/]+$/.test(P) && !this.parseScheduleDate(P)'), '/grafik must not treat a date as a login');
assert(source.includes('const seedFileId = messageFile._id || messageFile.id;'), 'seeding must accept id as well as _id');
assert(!source.includes('getById(messageFile._id)'));
const cleanupLoop = sliceBetween('async function cleanupDuplicateReportForwards(', 'async function cleanupDuplicateReportForwardsInOtchet');
assert(/\}\s*\}\s*break;\s*\}\s*\}\s*$/.test(cleanupLoop), 'duplicate cleanup must stop after a successful pass');
const archiveCleanup = sliceBetween('async function cleanupArchivedReceiptMessages', 'async function ');
assert(archiveCleanup.includes('let deletedOnPage = 0;') && archiveCleanup.includes('skip += messages.length - deletedOnPage;'), 'pagination must account for deleted messages');
assert(source.includes('if (entry && String(entry.archiveKey || "").indexOf("rocket:") === 0) return String(entry.archiveUrl || "");'), 'rocket: archive keys must not be signed as object-storage URLs');
const masterFallback = sliceBetween('async masterUserForPersonalReportRoom(', '  async ');
assert(masterFallback.includes('for (const name of [config.ownerUsername, config.adminUsername])'), 'configured owner/admin must be excluded from the master fallback');

console.log('PASS: penalties, report columns, transfer-sum gate, photo queue, cutoff, token workday and minor findings are guarded');
