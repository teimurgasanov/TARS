const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const linkStart = source.indexOf('async sendPersonalReportLink');
const linkEnd = source.indexOf('async publishDefaultTable', linkStart);
const linkBlock = source.slice(linkStart, linkEnd);
const promptStart = source.indexOf('async sendUnknownImageTypePrompt');
const promptEnd = source.indexOf('async executeActionButtonHandler', promptStart);
const promptBlock = source.slice(promptStart, promptEnd);
const selectionStart = source.indexOf('async ensureManualImageSelection');
const selectionEnd = source.indexOf('async removeManualImageSelectionPrompt', selectionStart);
const selectionBlock = source.slice(selectionStart, selectionEnd);
const postStart = source.indexOf('async executePostMessageSent');
const postEnd = source.indexOf('async receiptOcrConfig', postStart);
const postBlock = source.slice(postStart, postEnd);
const classifyStart = source.indexOf('async function personalImageKindForPreUploadUncached');
const classifyEnd = source.indexOf('async function personalImageKindForPreUpload(', classifyStart);
const classifyBlock = source.slice(classifyStart, classifyEnd);

assert.doesNotMatch(linkBlock, /UPLOAD_MENU_ACTION|➕ ЗАГРУЗИТЬ|📸 ФОТО|🧾 ЧЕК|✉️ РАССЫЛКА/);
assert.doesNotMatch(promptBlock, /newButtonElement|UPLOAD_MENU_ACTION/);
assert.match(selectionBlock, /Что вы отправили\?/);
assert.match(selectionBlock, /MANUAL_IMAGE_RECEIPT_ACTION/);
assert.match(selectionBlock, /MANUAL_IMAGE_PHOTO_ACTION/);
assert.match(selectionBlock, /MANUAL_IMAGE_MAILING_ACTION/);
assert.match(postBlock, /if \(hasPersonalImageUpload\) \{[\s\S]*ensureManualImageSelection[\s\S]*return;/);
assert(postBlock.indexOf('ensureManualImageSelection') < postBlock.indexOf('detectPersonalMailingProof'), 'manual choice must gate all automatic image routing');
assert.match(classifyBlock, /if \(aiReceipt\) return "receipt";[\s\S]*if \(aiPhoto\) return "photo";[\s\S]*if \(ocrReceipt\) return "receipt";/);
assert.match(source, /for \(const messageFile of imageFiles\)/);

console.log('PASS: old upload menu stays hidden and every personal image is gated by one compact manual choice');
