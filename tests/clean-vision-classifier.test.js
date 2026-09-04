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
const ocrFallback = classifier.indexOf('personalImageOcrFallbackKind');
for (const [name, pos] of Object.entries({primaryVision, dominantVision, dominantReturn, ocrFallback})) {
  assert(pos >= 0, `${name} branch missing`);
}
assert(primaryVision < dominantVision, 'one primary Vision pass must feed the dominant decision');
assert(dominantVision < dominantReturn, 'normalized Vision decision must be checked before fallback');
assert(dominantReturn < ocrFallback, 'high-confidence Vision classification must run before the single OCR fallback');

const pStart = source.indexOf('async function protectedRoomForPersonalFile');
const pEnd = source.indexOf('function normalizedUsername', pStart);
if (pStart < 0 || pEnd <= pStart) throw new Error('personal protected-room block not found');
const protectedBlock = source.slice(pStart, pEnd);
assert(protectedBlock.includes('personalImageOcrFallbackKind'), 'unknown personal images must receive one OCR fallback');
assert(!protectedBlock.includes('requestOpenAiWorkPhotoCheck'), 'unknown personal images must not receive a second Vision request');
assert(!protectedBlock.includes('validateReceiptStrict'), 'classification must not invoke full receipt extraction');
assert(protectedBlock.includes('PROTECTED_ROOMS.kassa'), 'OCR-confirmed fallback receipts must reach the receipt ledger');
assert(!protectedBlock.includes('isBlockedPersonalPhotoImage(file, content'), 'legacy second classifier must not run after clean classifier');
assert(!protectedBlock.includes('defaulting to report photo'), 'unknown must not default to report photo');

function makeRouter(kind, calls) {
  return new Function(
    'isPersonalTarsRoom',
    'PROTECTED_ROOMS',
    'primaryVisionDecisionForImage',
    'primaryVisionDominantKind',
    'personalImageOcrFallbackKind',
    'receiptStageContext',
    `${protectedBlock}; return protectedRoomForPersonalFile;`
  )(
    () => true,
    { kassa: { kind: 'receipt' }, otchet: { kind: 'photo' } },
    async () => ({ kind: 'unknown', confidence: 'low' }),
    () => '',
    async () => { calls.ocrFallback += 1; return kind; },
    () => ({})
  );
}

async function routeUnknown(kind) {
  const calls = { ocrFallback: 0 };
  const route = makeRouter(kind, calls);
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
  const receipt = await routeUnknown('receipt');
  assert.strictEqual(receipt.room.kind, 'receipt', 'OCR-confirmed unknown receipts must reach receipt processing');
  assert.deepStrictEqual(receipt.calls, { ocrFallback: 1 });

  const unresolved = await routeUnknown('unknown');
  assert.strictEqual(unresolved.room, undefined, 'unconfirmed unknown images must remain unaccepted');
  assert.deepStrictEqual(unresolved.calls, { ocrFallback: 1 });

  console.log('PASS: clean classifier uses one Vision decision and one bounded OCR fallback');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
