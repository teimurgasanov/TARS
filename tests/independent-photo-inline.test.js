const fs=require("fs"),assert=require("assert");
const s=fs.readFileSync("TarsReportApp.js","utf8");
assert(s.includes("INDEPENDENT_PHOTO_ROUTE_BEGIN"));
assert(s.includes("async function routeIndependentPhoto"));
assert(s.includes('kind !== "photo"'));
assert(s.includes('intent === "receipt" || intent === "mailing"'));
assert(s.includes('routeIndependentPhoto(e, n, t, r'));
assert(!s.includes('require("./IndependentPhotoRoute")'));
console.log("PASS: independent photo route is inline and leaves deploy package unchanged");
