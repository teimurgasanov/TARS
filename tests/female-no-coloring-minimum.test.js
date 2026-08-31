const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
const countsStart = source.indexOf("  femaleServiceCountsFromRows(");
const dailyStart = source.indexOf("  dailyLimitStatus(", countsStart);
const payrollStart = source.indexOf("\n  payrollRule(", dailyStart);
assert(countsStart >= 0 && dailyStart > countsStart && payrollStart > dailyStart, "female daily-limit methods must exist");

const countsMethod = source.slice(countsStart, source.indexOf("\n  femaleResultRating(", countsStart)).trim();
const dailyMethod = source.slice(dailyStart, payrollStart).trim();
const rules = new Function(`return ({ ${countsMethod}, ${dailyMethod} });`)();

function otherClients(quantity) {
  return [{ kind: "service", label: "Женская стрижка", quantity }];
}

assert.strictEqual(rules.dailyLimitStatus("female", otherClients(5)).met, false, "five clients without coloring must not meet the minimum");
assert.strictEqual(rules.dailyLimitStatus("female", otherClients(6)).met, true, "six clients without coloring must meet the minimum");
assert.strictEqual(rules.dailyLimitStatus("female", otherClients(14)).met, true, "fourteen clients without coloring must meet the minimum");

const simpleColoring = [
  { kind: "service", label: "Простое окрашивание", quantity: 1 },
  { kind: "service", label: "Женская стрижка", quantity: 4 }
];
assert.strictEqual(rules.dailyLimitStatus("female", simpleColoring).met, true, "existing coloring rule must remain valid");

console.log("PASS: six female clients without coloring meet the daily minimum");
