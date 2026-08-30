const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const linkStart = source.indexOf('async sendPersonalReportLink');
const linkEnd = source.indexOf('async publishDefaultTable', linkStart);
const linkBlock = source.slice(linkStart, linkEnd);
const promptStart = source.indexOf('async sendUnknownImageTypePrompt');
const promptEnd = source.indexOf('async executeActionButtonHandler', promptStart);
const promptBlock = source.slice(promptStart, promptEnd);
const classifyStart = source.indexOf('async function personalImageKindForPreUploadUncached');
const classifyEnd = source.indexOf('async function personalImageKindForPreUpload(', classifyStart);
const classifyBlock = source.slice(classifyStart, classifyEnd);

assert.doesNotMatch(linkBlock, /UPLOAD_MENU_ACTION|➕ ЗАГРУЗИТЬ|📸 ФОТО|🧾 ЧЕК|✉️ РАССЫЛКА/);
assert.doesNotMatch(promptBlock, /newButtonElement|UPLOAD_MENU_ACTION/);
assert.match(classifyBlock, /if \(aiReceipt\) return "receipt";[\s\S]*if \(aiPhoto\) return "photo";[\s\S]*if \(ocrReceipt\) return "receipt";/);
assert.match(source, /for \(const messageFile of imageFiles\)/);

console.log('PASS: upload buttons are hidden and every image is classified receipt-first automatically');
