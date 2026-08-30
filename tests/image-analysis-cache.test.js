const fs = require("fs");
const assert = require("assert");

const source = fs.readFileSync("TarsReportApp.js", "utf8");
for (const cacheName of ["personalImageKindCache", "workPhotoCheckCache", "strictReceiptValidationCache"]) {
  assert(source.includes(`const ${cacheName} =`), `${cacheName} missing`);
  assert(source.includes(`${cacheName}.get(key)`), `${cacheName} is not read`);
  assert(source.includes(`${cacheName}.set(key`), `${cacheName} is not written`);
  assert(source.includes(`${cacheName}.delete(key)`), `${cacheName} failures are not evicted`);
}
assert(source.includes("expectedReceiptDate(config)"), "cache keys must be scoped to the business date");
assert(source.includes("exactHash(content)"), "cache keys must identify exact image content");

console.log("PASS: repeated classifiers share bounded per-image analysis");
