const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
assert.match(source, /📋 СТАТУС ДНЯ/);
assert.match(source, /if \(mailingRequired\) statusParts\.push\(`Рассылка \$\{mailingStatus\}`\)/);
assert.match(source, /statusParts\.push\(`Чеки \$\{receiptCount\} — \$\{receiptTotal\}`, "Отчёт ✅"\)/);
assert.match(source, /m\.filter\(\(issue\) => issue !== "фото отчёта"\)/);
assert.match(source, /personalReportButtonRefreshQueue\.then\(run, run\)/);
assert.match(source, /removeLegacyPersonalReportMenus\(e, n, s, h\)/);
assert.match(source, /keepMessageId && String\(o\.id/);

console.log('PASS: daily status is compact and personal report buttons are serialized');
