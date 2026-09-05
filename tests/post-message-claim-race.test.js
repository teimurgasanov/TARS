const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');

const handlerStart = source.indexOf('async executePostMessageSent(e, n, t, s, r)');
const handlerEnd = source.indexOf('async receiptOcrConfig(e)', handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart, 'executePostMessageSent block not found');
const handler = source.slice(handlerStart, handlerEnd);
assert(handler.includes('postMessageClaimToken = await G.claimPostMessage(e, n, s, this.getLogger())'), 'distributed claim is not wired to persistence in image post-message handling');
assert(handler.includes('if (!postMessageClaimToken)'), 'losing contender is not blocked');
assert(handler.includes('postMessageClaimFailed = true'), 'claim failure state is not tracked');
assert(handler.includes('await G.completePostMessageClaim(e, postMessageClaimToken, s, this.getLogger(), trace)'), 'winning claim is not completed through persistence');
assert(handler.indexOf('if (uploadEventKey)') < handler.indexOf('await this.receiptOcrConfig(n)'), 'claim must happen before OCR/accounting');

const claimStart = source.indexOf('function postMessageFileIds(message)');
const claimEnd = source.indexOf('function archiveObjectKey(', claimStart);
assert(claimStart >= 0 && claimEnd > claimStart, 'claim implementation block not found');
const claimSource = source.slice(claimStart, claimEnd);

class RocketChatAssociationRecord {
  constructor(model, key) { this.model = model; this.key = key; }
}
const RocketChatAssociationModel = { MISC: 'misc' };
const context = { RocketChatAssociationRecord, RocketChatAssociationModel, setTimeout, Date, Math, console, emitTarsTraceV1() { return true; } };
vm.createContext(context);
vm.runInContext(`${claimSource}\nthis.claimPostMessage = claimPostMessage; this.completePostMessageClaim = completePostMessageClaim;`, context);

const records = new Map();
const assocKey = (association) => `${association.model}:${association.key}`;
const persistence = {
  async createWithAssociation(record, association) {
    const key = assocKey(association);
    const list = records.get(key) || [];
    list.push({ ...record });
    records.set(key, list);
  }
};
const read = {
  getPersistenceReader() {
    return {
      async readByAssociation(association) {
        return (records.get(assocKey(association)) || []).map((record) => ({ ...record }));
      }
    };
  }
};
const logger = { info() {} };
const message = { id: 'message-1', files: [{ _id: 'upload-7000', type: 'image/jpeg' }] };

(async () => {
  const [left, right] = await Promise.all([
    context.claimPostMessage(message, read, persistence, logger),
    context.claimPostMessage(message, read, persistence, logger)
  ]);
  const winners = [left, right].filter(Boolean);
  assert.strictEqual(winners.length, 1, `expected one winner, got ${winners.length}`);
  await context.completePostMessageClaim(message, winners[0], persistence, logger);
  const afterComplete = await context.claimPostMessage(message, read, persistence, logger);
  assert.strictEqual(afterComplete, '', 'completed upload must never be claimed again');

  const originalVariant = { id: 'message-preview-pair', files: [{ _id: 'original-upload', type: 'image/jpeg' }] };
  const previewVariant = { id: 'message-preview-pair', files: [{ _id: 'preview-upload', type: 'image/jpeg' }] };
  const originalToken = await context.claimPostMessage(originalVariant, read, persistence, logger);
  assert.ok(originalToken, 'original representation must acquire a claim');
  await context.completePostMessageClaim(originalVariant, originalToken, persistence, logger);
  const previewToken = await context.claimPostMessage(previewVariant, read, persistence, logger);
  assert.strictEqual(previewToken, '', 'preview and original ids of one message must share a completed claim');
  console.log('PASS: concurrent post-message claim allows one financial processor');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
