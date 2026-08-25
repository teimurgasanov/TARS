from pathlib import Path

path = Path('TarsReportApp.js')
text = path.read_text(encoding='utf-8')
start = text.index('async function personalImageKindForPreUpload')
end = text.index('async function personalImageIsReceiptForPreUpload', start)
block = text[start:end]

old_decl = '      let ocrMailing = false;\n'
new_decl = '      let ocrMailing = false;\n      let ocrHasText = false;\n'
if block.count(old_decl) != 1:
    raise SystemExit(f'expected exactly one ocrMailing declaration, found {block.count(old_decl)}')
block = block.replace(old_decl, new_decl, 1)

old_ocr = '            const text = receiptOcrText(payload);\n            checked = true;\n'
new_ocr = '            const text = receiptOcrText(payload);\n            checked = true;\n            if (String(text || "").trim()) ocrHasText = true;\n'
if block.count(old_ocr) != 1:
    raise SystemExit(f'expected exactly one OCR text assignment, found {block.count(old_ocr)}')
block = block.replace(old_ocr, new_ocr, 1)

old_tail = '''      if (ocrMailing) return "mailing";\n      if (aiMailing) return "mailing";\n      if (aiReceipt) return "receipt";\n      if (ocrReceipt) return "receipt";\n      if (aiPhoto) return "photo";\n      return void 0;\n'''
new_tail = '''      if (ocrMailing) return "mailing";\n      if (aiMailing) return "mailing";\n      if (aiReceipt) return "receipt";\n      // Keep the protected baseline rule: strong OCR evidence of a bank receipt\n      // beats an incorrect generic AI photo classification.\n      if (ocrReceipt) return "receipt";\n      if (aiPhoto) return "photo";\n      // If OpenAI Vision inspected the image but could not map it to a known class,\n      // route it to validateReceiptStrict instead of silently treating it as a work photo.\n      if (aiChecked) return "receipt";\n      // OCR text is the last fallback. It only routes to strict receipt validation;\n      // it does not accept the receipt by itself.\n      if (ocrHasText) return "receipt";\n      return void 0;\n'''
if block.count(old_tail) != 1:
    raise SystemExit(f'expected exactly one classifier tail, found {block.count(old_tail)}')
block = block.replace(old_tail, new_tail, 1)

text = text[:start] + block + text[end:]
path.write_text(text, encoding='utf-8')

test = Path('tests/openai-vision-receipt-routing.test.js')
test.write_text(r'''const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.indexOf('async function personalImageKindForPreUpload');
const end = source.indexOf('async function personalImageIsReceiptForPreUpload', start);
if (start < 0 || end <= start) throw new Error('personalImageKindForPreUpload block not found');
const block = source.slice(start, end);

assert(block.includes('let ocrHasText = false;'), 'OCR text fallback state missing');
assert(block.includes('if (String(text || "").trim()) ocrHasText = true;'), 'OCR text fallback is not populated');

const aiReceipt = block.indexOf('if (aiReceipt) return "receipt"');
const ocrReceipt = block.indexOf('if (ocrReceipt) return "receipt"');
const aiPhoto = block.indexOf('if (aiPhoto) return "photo"');
const aiFallback = block.indexOf('if (aiChecked) return "receipt"');
const ocrTextFallback = block.indexOf('if (ocrHasText) return "receipt"');

for (const [name, value] of Object.entries({aiReceipt, ocrReceipt, aiPhoto, aiFallback, ocrTextFallback})) {
  assert(value >= 0, `${name} branch not found`);
}
assert(aiReceipt < ocrReceipt, 'explicit OpenAI receipt should route immediately');
assert(ocrReceipt < aiPhoto, 'strong OCR receipt must keep priority over generic AI photo');
assert(aiPhoto < aiFallback, 'explicit OpenAI work-photo classification must still route as photo');
assert(aiFallback < ocrTextFallback, 'ambiguous Vision result should reach strict receipt validation before generic OCR-text fallback');

console.log('PASS: Vision ambiguity and OCR text fall back to strict receipt validation without weakening protected OCR priority');
''', encoding='utf-8')
