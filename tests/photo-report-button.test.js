const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
assert.match(source, /UPLOAD_MENU_ACTION = "open-upload-type-menu"/);
assert.match(source, /PHOTO_REPORT_ACTION = "start-photo-report-upload"/);
assert.match(source, /RECEIPT_UPLOAD_ACTION = "start-receipt-upload"/);
assert.match(source, /MAILING_UPLOAD_ACTION = "start-mailing-upload"/);
assert.match(source, /photo-report-intent:\$\{roomId\}/);
assert.match(source, /mailing-report-intent:\$\{roomId\}/);
assert.match(source, /transfer-report-intent:\$\{roomId\}/);
assert.match(source, /activePhotoReportIntent\(n, e\.room\)/);
assert.match(source, /activeTransferReportIntent\(n, e\.room\)/);
assert.match(source, /activeMailingReportIntent\(n, e\.room\)/);
assert.match(source, /explicitPhotoIntent \? "photo" : ""/);
assert.match(source, /intent === "photo"\) return PROTECTED_ROOMS\.otchet/);
assert.match(source, /finalKind === "receipt"/);
assert.match(source, /finalKind === "mailing"/);
assert.match(source, /✅ ФОТО РАБОТЫ ПРИНЯТО/);
assert.match(source, /✅ РАССЫЛКИ ПРИНЯТЫ/);
assert.match(source, /📸 Отправьте фото выполненной работы\./);
assert.match(source, /🧾 РЕЖИМ ЧЕКОВ ВКЛЮЧЁН НА 10 МИНУТ/);
assert.match(source, /✉️ Отправьте скриншот рассылки\./);

const personalLinkBlock = source.slice(source.indexOf("async sendPersonalReportLink("), source.indexOf("async publishDefaultTable("));
assert.doesNotMatch(personalLinkBlock, /UPLOAD_MENU_ACTION/);
assert.doesNotMatch(personalLinkBlock, /PHOTO_REPORT_ACTION|RECEIPT_UPLOAD_ACTION|MAILING_UPLOAD_ACTION/);

console.log("PASS: persistent report menu has one upload button with three disposable choices");
