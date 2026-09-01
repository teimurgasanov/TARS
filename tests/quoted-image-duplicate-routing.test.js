const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.lastIndexOf('function messageFiles(message)');
const end = source.indexOf('function messageLooksLikePendingImageUpload', start);
assert.ok(start >= 0 && end > start, 'messageFiles block not found');
const block = source.slice(start, end);
const { messageFiles, messageImageFiles } = new Function(
  `${block}; return { messageFiles, messageImageFiles };`
)();

assert.match(block, /attachment && attachment\.image_url/);
assert.match(block, /attachment && attachment\.title_link/);
assert.match(block, /Array\.isArray\(attachment\.attachments\)/);
assert.match(block, /visitAttachment\(nested\)/);

const attachmentFile = messageFiles({
  attachments: [{ file: { _id: 'file-one', name: 'quoted.jpg', type: 'image/jpeg' } }]
});
assert.deepStrictEqual(attachmentFile.map((file) => file._id), ['file-one'], 'attachment.file original must be preserved');

const attachmentFiles = messageFiles({
  attachments: [{
    files: [
      { _id: 'file-a', name: 'a.jpg', type: 'image/jpeg' },
      { _id: 'file-b', name: 'b.jpg', type: 'image/jpeg' }
    ]
  }]
});
assert.deepStrictEqual(attachmentFiles.map((file) => file._id), ['file-a', 'file-b'], 'attachment.files originals must be preserved');

const quoted = {
  room: { id: 'personal-room' },
  attachments: [{
    attachments: [{ file: { _id: 'quoted-original', name: 'quoted-original.jpg', type: 'image/jpeg' } }]
  }]
};
assert.deepStrictEqual(messageImageFiles(quoted).map((file) => file._id), ['quoted-original'], 'nested quoted image must reach media routing');

const forwarded = {
  attachments: [{
    attachments: [{
      title: { value: 'forwarded.jpg' },
      title_link: '/file-upload/forwarded-original/forwarded.jpg',
      image_url: '/file-upload/forwarded-preview/forwarded.jpg'
    }]
  }]
};
assert.deepStrictEqual(messageFiles(forwarded).map((file) => file._id), ['forwarded-original'], 'forwarded original must win over generated preview');

const originalAndPreview = messageFiles({
  file: { _id: 'canonical', name: 'same.jpg', type: 'image/jpeg' },
  attachments: [{
    file: { _id: 'preview', name: 'thumb-same.jpg', type: 'image/jpeg' },
    title: { value: 'same.jpg', link: '/file-upload/canonical/same.jpg' },
    imageUrl: '/file-upload/preview/same.jpg'
  }]
});
assert.deepStrictEqual(originalAndPreview.map((file) => file._id), ['canonical'], 'one original plus preview must produce one image');

const controllerStart = source.indexOf('async function processPersonalMediaV2');
const controllerEnd = source.indexOf('function isTodayTransferSumRequest', controllerStart);
assert.ok(controllerStart >= 0 && controllerEnd > controllerStart, 'media-v2 controller not found');
const controllerBlock = source.slice(controllerStart, controllerEnd);
let duplicateChecks = 0;
let duplicateImageIds = [];
const processPersonalMediaV2 = new Function(
  'isPersonalTarsRoom',
  'messageImageFiles',
  'fastForwardPersonalReportPhotos',
  'rejectDuplicateMessage',
  'createReceiptProcessingStatusManager',
  'createPersonalImageClassificationDiagnostic',
  'personalImageDiagnosticSourceType',
  'setPersonalImageFinalDiagnostic',
  'emitPersonalImageClassificationDiagnostic',
  `${controllerBlock}; return processPersonalMediaV2;`
)(
  () => true,
  messageImageFiles,
  async () => false,
  async (message) => {
    duplicateChecks += 1;
    duplicateImageIds = messageImageFiles(message).map((file) => file._id);
    return 'processed';
  },
  () => ({ markAll() {}, async clearAll() {} }),
  () => ({ final_reason: 'unknown' }),
  () => 'original',
  () => {},
  () => {}
);

(async () => {
  const result = await processPersonalMediaV2(quoted, null, null, null, null, null, null);
  assert.strictEqual(result.handled, true, 'quoted image must be handled by media-v2');
  assert.strictEqual(duplicateChecks, 1, 'quoted image must reach duplicate protection exactly once');
  assert.deepStrictEqual(duplicateImageIds, ['quoted-original'], 'duplicate protection must receive the quoted original');
  console.log('PASS: quoted and forwarded Rocket.Chat image attachments reach duplicate detection');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
