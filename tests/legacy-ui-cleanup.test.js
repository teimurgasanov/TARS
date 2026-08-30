const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

assert.doesNotMatch(source, /INTERNAL_ARCHIVE_ROOM|ensureInternalArchiveRoom|createArchiveMessageForUpload/);
assert.doesNotMatch(source, /MAILING_REPORT_ACTION|TRANSFER_REPORT_ACTION/);
assert.doesNotMatch(source, /handleMailingReportButton|handleTransferReportButton/);
assert.doesNotMatch(source, /postNextReportButton/);
assert.doesNotMatch(source, /new LatenessCommand\(this, "(?:opozdanie|late|shtraf|penalty)"\)/);
assert.match(source, /new LatenessCommand\(this, "штраф"\)/);
assert.doesNotMatch(source, /seedRoom\(read, persistence, logger, "(?:Otchet|otchet)"/);
assert.match(source, /seedRoom\(read, persistence, logger, "Результат"/);

console.log('PASS: legacy rooms, buttons, menus and slash aliases stay removed');
