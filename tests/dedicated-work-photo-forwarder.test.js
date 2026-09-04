// Single-decision work-photo route regression guard.
const fs = require('fs');
const assert = require('assert');
const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const a = source.indexOf('async function shouldForwardConfirmedWorkPhoto');
const b = source.indexOf('async function detectPersonalMailingProof', a);
assert(a >= 0 && b > a, 'dedicated helper must exist');
const h = source.slice(a, b);
assert.strictEqual((h.match(/primaryVisionDecisionForImage\(/g) || []).length, 1, 'work-photo routing must obtain one cached primary Vision decision');
assert.match(h, /const dominantKind = primaryVisionDominantKind\(primaryDecision\)[\s\S]*dominantKind === "photo"[\s\S]*primary-vision-high-work-photo/,
  'high-confidence clean work photos must be final');
assert.match(h, /if \(options\.manualPhotoSafetyOnly\)[\s\S]*return \{ forward: false, reason: "manual-photo-safety-inconclusive" \};[\s\S]*personalImageOcrFallbackKind/,
  'manual V3 safety must terminate before the text-only safety fallback');
assert.strictEqual((h.match(/personalImageOcrFallbackKind\(/g) || []).length, 1, 'an inconclusive primary result may run exactly one OCR fallback');
assert(!h.includes('requestOpenAiWorkPhotoCheck'), 'the deprecated dedicated Vision classifier must not run after Primary Vision');
assert(!h.includes('validateReceiptStrict'), 'work-photo classification must not cascade into full receipt extraction');
assert(!source.includes('parsed.kind === "hair" ? 0.7 : 0.8'), 'confirmed work photos must not be rejected by an extra confidence threshold');
assert(source.includes('parsed.is_work_photo === true && parsed.has_visible_client === true && parsed.has_visible_service_area === true && knownServiceArea'), 'work photos must require a visible client and a known salon service area');
assert(source.includes('for (let attempt = 0; attempt < 2; attempt += 1)'), 'inconclusive work-photo analysis must be retried once');
assert(source.includes('Dedicated work-photo Vision inconclusive attempt='), 'inconclusive Vision results must be observable');
assert(source.includes('{ type: "input_image", image_url: imageUrl, detail: "high" }'), 'work photos must be analyzed at high visual detail');
assert(source.includes('typeof payload === "string"'), 'string HTTP payloads must be parsed before reading the model response');
assert(source.includes('parsed.is_document_or_screen === true || parsed.is_receipt_or_banking === true'), 'documents and banking images must never pass as work photos');
assert(!source.includes('confidence >= requiredConfidence && evidence.length'), 'positive work-photo decisions must not depend on optional confidence/evidence fields');
assert(h.includes('fallbackKind === "receipt"'), 'OCR-confirmed receipt must block');
assert(h.includes('fallbackKind === "mailing"'), 'OCR-confirmed mailing proof must block');
assert(h.includes('primary-vision-inconclusive'), 'unknown images must fail closed after the bounded fallback');
assert(!h.includes('forward: true, reason: "verified-non-receipt-image"'), 'receipt-check failures must never default to work photos');
assert(!h.includes('photo-report-button-after-document-check'), 'explicit photo intent must not bypass strict visual confirmation');
const c = source.indexOf('async function fastForwardPersonalReportPhotos');
const d = source.indexOf('async function publishDirectReportPhotos', c);
const f = source.slice(c, d);
assert(f.includes('shouldForwardConfirmedWorkPhoto('), 'forwarder must use dedicated decision helper');
assert(f.includes('FAST_PHOTO_FORWARD_CONFIRMED'), 'forwarding must log confirmation');
assert(!f.includes('FAST_PHOTO_FORWARD_DEFAULT_TO_PHOTO'), 'unknown must never default to report photo');
console.log('PASS: work-photo forwarding uses one Primary Vision decision and one bounded OCR fallback');
