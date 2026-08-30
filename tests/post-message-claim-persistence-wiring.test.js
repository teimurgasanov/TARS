const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "TarsReportApp.js"), "utf8");

assert(
  source.includes("G.claimPostMessage(e, n, s, this.getLogger())"),
  "post-message claims must receive Apps Engine persistence"
);
assert(
  source.includes("G.completePostMessageClaim(e, postMessageClaimToken, s, this.getLogger())"),
  "completed post-message claims must be written through Apps Engine persistence"
);
assert(
  !source.includes("G.claimPostMessage(e, n, r, this.getLogger())"),
  "message modify must never be passed as persistence to claimPostMessage"
);
assert(
  !source.includes("G.completePostMessageClaim(e, postMessageClaimToken, r, this.getLogger())"),
  "message modify must never be passed as persistence to completePostMessageClaim"
);

console.log("post-message claim persistence wiring tests passed");
