const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const linkStart = source.indexOf("async sendPersonalReportLink");
const linkEnd = source.indexOf("async sendReportMenu", linkStart);
const linkBlock = source.slice(linkStart, linkEnd);
assert(!linkBlock.includes('newPlainTextObject("➕ ЗАГРУЗИТЬ")'), "personal report menu must not show upload buttons");
assert(!linkBlock.includes('newPlainTextObject("📸 ФОТО")'), "persistent menu must not show a separate photo button");

const menuStart = source.indexOf("async handleUploadMenuButton");
const menuEnd = source.indexOf("async handlePhotoReportButton", menuStart);
const menuBlock = source.slice(menuStart, menuEnd);
for (const label of ["📸 ФОТО", "🧾 ЧЕК", "✉️ РАССЫЛКА"]) {
  assert(menuBlock.includes(`newPlainTextObject("${label}")`), `temporary menu missing ${label}`);
}
assert(menuBlock.includes("ВЫБЕРИТЕ ТИП ЗАГРУЗКИ"), "temporary menu marker missing");
assert(menuBlock.includes("deleteMessage"), "old temporary menus must be removed");

assert(source.includes('const intent = forcedIntent || directFileIntent(message)'), "explicit receipt mode must reach the financial pipeline");
assert(source.includes('if (intent === "receipt") return PROTECTED_ROOMS.kassa'), "receipt choice must force strict receipt processing");
assert(source.includes('explicitTransferIntent ? "receipt" : explicitPhotoIntent ? "photo" : ""'), "legacy manual choices must still reach the unified pipeline");
assert(source.includes("removeUploadTypeMenu(modify, data)"), "temporary menu must disappear after a choice");

console.log("PASS: personal report menu has no upload buttons while legacy actions remain compatible");
