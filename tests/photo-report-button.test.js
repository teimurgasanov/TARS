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
assert.match(source, /dominantKind === "receipt"/);
assert.match(source, /dominantKind === "mailing"/);
assert.match(source, /✅ ФОТО РАБОТЫ ПРИНЯТО/);
assert.match(source, /✅ РАССЫЛКИ ПРИНЯТЫ/);
assert.match(source, /📸 Отправьте фото выполненной работы\./);
assert.match(source, /🧾 Отправьте чек\./);
assert.match(source, /✉️ Отправьте скриншот рассылки\./);

const selectorBlock = source.slice(source.indexOf("async sendPersonalImageSelector("), source.indexOf("cashLauncherAssociation()"));
assert.match(selectorBlock, /PHOTO_REPORT_ACTION/);
assert.match(selectorBlock, /RECEIPT_UPLOAD_ACTION/);
assert.match(selectorBlock, /MAILING_UPLOAD_ACTION/);
assert.match(source, /await this\.sendPersonalImageSelector\(e, n, t, s\);/);

console.log("PASS: standalone persistent selector has three direct pre-upload choices");
