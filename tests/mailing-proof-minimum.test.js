const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const start = source.indexOf("  payrollRule(");
const end = source.indexOf("\n  async sendReport", start);
assert(start >= 0 && end > start, "payrollRule must exist");

const methodSource = source.slice(start, end).trim();
const payrollRule = new Function(
  `return ({ dailyLimitStatus() { return { met: false }; }, ${methodSource} }).payrollRule;`
)();
const context = { dailyLimitStatus: () => ({ met: false }) };

const nine = payrollRule.call(context, "male", [], 0, { roomFound: true, count: 9 });
assert.strictEqual(nine.proofRequired, 10, "ten mailing screenshots must be required");
assert.strictEqual(nine.proofOk, false, "nine screenshots must not preserve the percentage");
assert.strictEqual(nine.servicePercent, 40, "nine screenshots must recalculate services to 40%");

const ten = payrollRule.call(context, "male", [], 0, { roomFound: true, count: 10 });
assert.strictEqual(ten.proofOk, true, "ten screenshots must satisfy the minimum");
assert.strictEqual(ten.servicePercent, 50, "ten screenshots must preserve 50%");

const eleven = payrollRule.call(context, "male", [], 0, { roomFound: true, count: 11 });
assert.strictEqual(eleven.proofOk, true, "more than ten screenshots must satisfy the minimum");
assert.strictEqual(eleven.proofRemaining, 0, "remaining proof count must never be negative");

console.log("PASS: at least 10 mailing screenshots preserve the service percentage");
