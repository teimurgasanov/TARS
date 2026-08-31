const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.lastIndexOf('function messageFiles(message)');
const end = source.indexOf('function fileLooksLikeImage', start);
assert.ok(start >= 0 && end > start, 'messageFiles block not found');
eval(source.slice(start, end));

const original = { _id: 'original-upload', name: 'IMG_0125.jpg', type: 'image/jpeg' };
const previewMessage = {
  file: original,
  files: [original],
  attachments: [{
    title: { value: 'IMG_0125.jpg', link: '/file-upload/preview-upload/IMG_0125.jpg' },
    imageUrl: '/file-upload/preview-upload/IMG_0125.jpg'
  }]
};
const deduplicated = messageFiles(previewMessage);
assert.strictEqual(deduplicated.length, 1, 'generated preview must not become a second receipt');
assert.strictEqual(deduplicated[0]._id, 'original-upload', 'original upload must win over preview');

const attachmentOnly = messageFiles({
  attachments: [{
    title: { value: 'IMG_0125.jpg' },
    imageUrl: '/file-upload/preview-upload/IMG_0125.jpg'
  }]
});
assert.strictEqual(attachmentOnly.length, 1, 'attachment-only mobile upload must still be processed');

const attachmentOriginalAndPreview = messageFiles({
  attachments: [{
    title: { value: 'IMG_7777.jpg', link: '/file-upload/original-7777/IMG_7777.jpg' },
    imageUrl: '/file-upload/preview-7777/IMG_7777.jpg'
  }]
});
assert.strictEqual(attachmentOriginalAndPreview.length, 1, 'separate attachment preview id must not create a second receipt');
assert.strictEqual(attachmentOriginalAndPreview[0]._id, 'original-7777', 'title.link original must win over imageUrl preview');

const rocketChatThumbPair = messageFiles({
  file: { _id: 'original-0110', name: 'IMG_0110.jpg', type: 'image/jpeg' },
  attachments: [{
    file: { _id: 'preview-0110', name: 'thumb-IMG_0110.jpg', type: 'image/jpeg' },
    title: { value: 'IMG_0110.jpg', link: '/file-upload/original-0110/IMG_0110.jpg' },
    imageUrl: '/file-upload/preview-0110/IMG_0110.jpg'
  }]
});
assert.deepStrictEqual(
  rocketChatThumbPair.map((file) => file._id),
  ['original-0110'],
  'thumb-* preview must not be OCRed when the same message contains the original upload'
);

const attachmentFileOnlyThumbPair = messageFiles({
  file: { _id: 'original-0125', name: 'IMG_0125.jpg', type: 'image/jpeg' },
  attachments: [{
    file: { _id: 'preview-0125', name: 'thumb-IMG_0125.jpg', type: 'image/jpeg' }
  }]
});
assert.deepStrictEqual(
  attachmentFileOnlyThumbPair.map((file) => file._id),
  ['original-0125'],
  'attachment.file thumb without imageUrl must still be suppressed when its original is present'
);

const twoOriginals = messageFiles({
  files: [
    { _id: 'first', name: 'same.jpg', type: 'image/jpeg' },
    { _id: 'second', name: 'same.jpg', type: 'image/jpeg' }
  ]
});
assert.strictEqual(twoOriginals.length, 2, 'two authoritative uploads must not be collapsed by filename');

console.log('PASS: Rocket.Chat preview variants cannot duplicate a receipt');
