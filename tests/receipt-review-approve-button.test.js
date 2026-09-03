const fs = require('fs');
const assert = require('assert');
const { loadTrackedAppWithGuard } = require('./helpers/canonical-tars-runtime');

const source = fs.readFileSync('TarsReportApp.js', 'utf8');
const reviewStart = source.indexOf('async function createReviewMessageForUpload');
const reviewEnd = source.indexOf('async function findOtchetRoom', reviewStart);
const handlerStart = source.indexOf('async handleApproveReceiptButton');
const handlerEnd = source.indexOf('async executeActionButtonHandler', handlerStart);

assert.ok(reviewStart >= 0 && reviewEnd > reviewStart, 'receipt review message block not found');
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'receipt approval button handler not found');

const review = source.slice(reviewStart, reviewEnd);
const publishStart = source.indexOf('async function publishRejectedReceiptReview');
const publishEnd = source.indexOf('async function archiveUploadExists', publishStart);
const publishReview = source.slice(publishStart, publishEnd);
const handler = source.slice(handlerStart, handlerEnd);

assert.match(review, /actionId: APPROVE_REJECTED_RECEIPT_ACTION/);
assert.match(review, /newPlainTextObject\("ЗАЧЕСТЬ ЧЕК"\)/);
assert.match(review, /value: String\(details\.exact\)/);
assert.match(review, /detailsBuilder[\s\S]*setText\(text\)/);
assert.match(review, /finish\(detailsBuilder\)[\s\S]*startMessage\(\{[\s\S]*file: reviewFile/);
assert.match(review, /finish\(detailsBuilder\)[\s\S]*fileBuilder\.setBlocks\(blocks\)/);
assert.doesNotMatch(review, /detailsBuilder\.setBlocks\(blocks\)/);
assert.match(review, /text: "Фото чека для проверки"/);
assert.match(publishReview, /finish\(detailsBuilder\)/);
assert.match(publishReview, /actionBuilder\.setBlocks\(blocks\)/);
assert.doesNotMatch(publishReview, /detailsBuilder\.setBlocks\(blocks\)/);
assert.match(handler, /roomSlug !== "cheki-kontrol"/);
assert.match(handler, /candidate\.source === "rejected"/);
assert.match(handler, /candidate\.exact \|\| ""\) === exact/);
assert.match(handler, /RECEIPT_APPROVAL_AMOUNT_VIEW_PREFIX/);
assert.match(handler, /newPlainTextObject\("Подтверждённая сумма чека, ₽"\)/);
assert.match(handler, /openSurfaceView/);
assert.match(handler, /handleApproveReceiptAmountSubmit/);
assert.match(handler, /entry\.receiptAmount = amount/);
assert.match(handler, /entry\.source = "confirmed"/);
assert.match(handler, /publishMasterTransferSummary[\s\S]*true, \[entry\]/);
assert.match(handler, /✅ ЧЕК ЗАЧТЁН/);
assert.match(source, /if \(a\.actionId === K\)[\s\S]*handleApproveReceiptButton/);
assert.match(source, /o\.startsWith\(RECEIPT_APPROVAL_AMOUNT_VIEW_PREFIX\)[\s\S]*handleApproveReceiptAmountSubmit/);

function associationKey(association) {
  return String(association && association.key || '');
}

(async () => {
  const loaded = loadTrackedAppWithGuard();
  const guard = loaded.__testGuard;
  const app = Object.create(loaded.TarsReportApp.prototype);
  app.receiptOcrConfig = async () => ({ ownerUsername: 'teimur', adminUsername: 'shura' });
  app.getLogger = () => ({ info() {}, warn() {}, error() {} });

  const owner = { id: 'owner-id', username: 'master', name: 'Master' };
  const shura = { id: 'shura-id', username: 'shura', name: 'Shura' };
  const appUser = { id: 'tars-id', username: 'tars', name: 'TARS' };
  const controlRoom = { id: 'control-id', slugifiedName: 'cheki-kontrol', type: 'p' };
  const records = new Map();
  const entry = {
    source: 'rejected',
    exact: 'exact-manual-amount',
    receiptAmount: 1,
    receiptDate: '2026-09-03',
    invalidReason: 'Сумма распознана ненадёжно',
    userId: owner.id,
    username: owner.username,
    userName: owner.name,
    roomId: 'personal-owner-room'
  };
  records.set(guard.PROTECTED_ROOMS.kassa.index, [{ version: 1, photos: [entry] }]);
  const persistenceReader = {
    async readByAssociation(association) {
      return records.get(associationKey(association)) || [];
    }
  };
  const persistence = {
    async updateByAssociation(association, value) {
      records.set(associationKey(association), [value]);
      return value;
    }
  };
  const read = {
    getPersistenceReader() { return persistenceReader; },
    getUserReader() {
      return {
        async getByUsername(username) { return username === 'tars' ? appUser : undefined; },
        async getAppUser() { return appUser; }
      };
    },
    getRoomReader() {
      return {
        async getByName(name) { return name === 'cheki-kontrol' ? controlRoom : undefined; },
        async getById(id) { return id === entry.roomId ? { id, type: 'd' } : undefined; },
        async getMembers(id) { return id === entry.roomId ? [appUser, owner, shura] : []; }
      };
    }
  };
  const published = [];
  const opened = [];
  const blockBuilder = {
    blocks: [],
    addInputBlock(value) { this.blocks.push(value); },
    getBlocks() { return this.blocks; },
    newPlainTextObject(text) { return { text }; },
    newPlainTextInputElement(value) { return value; },
    newButtonElement(value) { return value; }
  };
  const creator = {
    getBlockBuilder() { return blockBuilder; },
    startMessage() {
      const state = {};
      return {
        setSender(value) { state.sender = value; return this; },
        setRoom(value) { state.room = value; return this; },
        setText(value) { state.text = value; return this; },
        __state: state
      };
    },
    async finish(builder) { published.push(builder.__state); return `message-${published.length}`; }
  };
  const modify = {
    getCreator() { return creator; },
    getUiController() {
      return {
        async openSurfaceView(view, context, user) { opened.push({ view, context, user }); }
      };
    },
    getNotifier() {
      return {
        getMessageBuilder() {
          const state = {};
          return {
            setSender(value) { state.sender = value; return this; },
            setRoom(value) { state.room = value; return this; },
            setText(value) { state.text = value; return this; },
            getMessage() { return state; }
          };
        },
        async notifyUser() {}
      };
    }
  };

  await app.handleApproveReceiptButton(read, modify, persistence, {
    actionId: 'approve-rejected-receipt',
    value: entry.exact,
    triggerId: 'trigger-id',
    user: shura,
    room: controlRoom
  });
  assert.strictEqual(opened.length, 1, 'approval button must open exactly one amount modal');
  assert.strictEqual(opened[0].view.type, 'modal');
  assert.match(opened[0].view.id, /^receipt-approval-amount:/);
  assert.strictEqual(opened[0].view.blocks[0].element.initialValue, '1');
  assert.strictEqual(entry.source, 'rejected', 'opening the modal must not credit the receipt');

  const summaries = [];
  const originalSummary = guard.publishMasterTransferSummary;
  guard.publishMasterTransferSummary = async (...args) => { summaries.push(args); };
  const responses = [];
  let submittedAmount = '0';
  const submitContext = {
    getInteractionData() {
      return {
        user: shura,
        view: {
          id: opened[0].view.id,
          state: { 'receipt-approval-amount': { value: submittedAmount } }
        }
      };
    },
    getInteractionResponder() {
      return {
        successResponse() { responses.push({ type: 'success' }); return { success: true }; },
        viewErrorResponse(value) { responses.push({ type: 'error', value }); return value; }
      };
    }
  };
  try {
    await app.executeViewSubmitHandler(submitContext, read, {}, persistence, modify);
    assert.strictEqual(entry.source, 'rejected', 'zero amount must fail closed');
    assert.strictEqual(summaries.length, 0);
    assert.strictEqual(responses[0].type, 'error');

    submittedAmount = '1 300';
    responses.length = 0;
    await app.executeViewSubmitHandler(submitContext, read, {}, persistence, modify);
    assert.strictEqual(entry.source, 'confirmed');
    assert.strictEqual(entry.receiptAmount, 1300, 'Shura-entered amount must become the accounting amount');
    assert.strictEqual(entry.userId, owner.id, 'manual amount must not change room-owner attribution');
    assert.strictEqual(entry.username, owner.username, 'manual amount must preserve the accounting username');
    assert.strictEqual(entry.approvedBy, shura.username);
    assert.strictEqual(entry.manualApprovalPreviousAmount, 1, 'previous OCR amount must remain available for audit');
    assert.strictEqual(summaries.length, 1, 'running total must be refreshed exactly once');
    assert.strictEqual(summaries[0][0].userId, owner.id);
    assert.strictEqual(summaries[0][8][0].receiptAmount, 1300);
    assert.ok(published.some((message) => /Сумма: 1 300 ₽/.test(message.text || '')));
    assert.deepStrictEqual(responses, [{ type: 'success' }]);

    await app.executeViewSubmitHandler(submitContext, read, {}, persistence, modify);
    assert.strictEqual(summaries.length, 1, 'repeated modal submit must not credit the receipt twice');
  } finally {
    guard.publishMasterTransferSummary = originalSummary;
  }

  console.log('PASS: rejected receipt approval requires an idempotent Shura-entered amount and preserves room owner');
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
