const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

const cStart = source.indexOf('async function personalImageKindForPreUpload');
const cEnd = source.indexOf('async function personalImageIsReceiptForPreUpload', cStart);
if (cStart < 0 || cEnd <= cStart) throw new Error('classifier block not found');
const classifier = source.slice(cStart, cEnd);

const primaryVision = classifier.indexOf('primaryVisionDecisionForImage');
const dominantVision = classifier.indexOf('const dominantKind = primaryVisionDominantKind(primaryDecision)');
const dominantReturn = classifier.indexOf('if (dominantKind) return dominantKind');
const ocrMailing = classifier.indexOf('if (ocrMailing) return "mailing"');
const ocrReceipt = classifier.indexOf('if (ocrReceipt) return "receipt"');
const unknown = classifier.indexOf('return "unknown";');
for (const [name, pos] of Object.entries({primaryVision, dominantVision, dominantReturn, ocrMailing, ocrReceipt, unknown})) {
  assert(pos >= 0, `${name} branch missing`);
}
assert(primaryVision < dominantVision, 'one primary Vision pass must feed the dominant decision');
assert(dominantVision < dominantReturn, 'normalized Vision decision must be checked before fallback');
assert(dominantReturn < ocrMailing, 'high-confidence Vision classification must run before OCR fallback');
assert(ocrMailing < ocrReceipt, 'OCR mailing fallback must stay protected');
assert(ocrReceipt < unknown, 'unclassified images must become explicit unknown after OCR fallback');

const pStart = source.indexOf('async function protectedRoomForPersonalFile');
const pEnd = source.indexOf('function normalizedUsername', pStart);
if (pStart < 0 || pEnd <= pStart) throw new Error('personal protected-room block not found');
const protectedBlock = source.slice(pStart, pEnd);
assert(protectedBlock.includes('if (kind === "photo" || kind === "unknown")'), 'photo and unknown must share the strict routing branch');
assert(protectedBlock.includes('await validateReceiptStrict(file, content, http, config, logger, validationContext'), 'unknown personal images must receive a strict receipt fallback with upload-bound evidence');
assert(protectedBlock.includes('return PROTECTED_ROOMS.kassa'), 'strictly confirmed fallback receipts must reach the receipt ledger');
assert(!protectedBlock.includes('isBlockedPersonalPhotoImage(file, content'), 'legacy second classifier must not run after clean classifier');
assert(!protectedBlock.includes('defaulting to report photo'), 'unknown must not default to report photo');

function makeRouter(kind, dedicatedKind, receiptOk, calls) {
  return new Function(
    'isPersonalTarsRoom',
    'PROTECTED_ROOMS',
    'primaryVisionDecisionForImage',
    'primaryVisionDominantKind',
    'personalImageKindForPreUpload',
    'requestOpenAiWorkPhotoCheck',
    'validateReceiptStrict',
    'receiptStageContext',
    `${protectedBlock}; return protectedRoomForPersonalFile;`
  )(
    () => true,
    { kassa: { kind: 'receipt' }, otchet: { kind: 'photo' } },
    async () => ({ kind: 'unknown', confidence: 'low' }),
    () => '',
    async () => { calls.classifier += 1; return kind; },
    async () => { calls.workPhoto += 1; return dedicatedKind; },
    async () => { calls.receipt += 1; return { ok: receiptOk }; },
    () => ({})
  );
}

async function routeUnknown(dedicatedKind, receiptOk) {
  const calls = { classifier: 0, workPhoto: 0, receipt: 0 };
  const route = makeRouter('unknown', dedicatedKind, receiptOk, calls);
  const room = await route(
    { room: { id: 'personal-room' } },
    { id: 'upload', name: 'image.jpg' },
    Buffer.from('image'),
    '',
    undefined,
    null,
    {},
    null
  );
  return { room, calls };
}

(async () => {
  const work = await routeUnknown('work', false);
  assert.strictEqual(work.room.kind, 'photo', 'only a positive work-photo result may route unknown to reports');
  assert.deepStrictEqual(work.calls, { classifier: 1, workPhoto: 1, receipt: 0 });

  const document = await routeUnknown('document', false);
  assert.strictEqual(document.room.kind, 'receipt', 'documents must route to receipt processing');
  assert.deepStrictEqual(document.calls, { classifier: 1, workPhoto: 1, receipt: 0 });

  const receipt = await routeUnknown('', true);
  assert.strictEqual(receipt.room.kind, 'receipt', 'strictly validated unknown receipts must reach receipt processing');
  assert.deepStrictEqual(receipt.calls, { classifier: 1, workPhoto: 1, receipt: 1 });

  const unresolved = await routeUnknown('', false);
  assert.strictEqual(unresolved.room, undefined, 'unconfirmed unknown images must remain unaccepted');
  assert.deepStrictEqual(unresolved.calls, { classifier: 1, workPhoto: 1, receipt: 1 });

  console.log('PASS: clean classifier preserves protected guards and makes unknown explicit');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
