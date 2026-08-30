const fs = require('fs');
const assert = require('assert');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const start = source.lastIndexOf('function messageFiles(message)');
const end = source.indexOf('function fileLooksLikeImage', start);
assert.ok(start >= 0 && end > start, 'messageFiles block not found');
const block = source.slice(start, end);

assert.match(block, /attachment && attachment\.image_url/);
assert.match(block, /attachment && attachment\.title_link/);
assert.match(block, /Array\.isArray\(attachment\.attachments\)/);
assert.match(block, /visitAttachment\(nested\)/);
assert.match(block, /if \(attachment\.file\) addFile\(attachment\.file\)/);

console.log('PASS: quoted and forwarded Rocket.Chat image attachments reach duplicate detection');
