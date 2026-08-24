const fs=require('fs'); const assert=require('assert');
const s=fs.readFileSync('TarsReportApp.js','utf8');
const a=s.indexOf('let preclassifiedRoom;');
const b=s.indexOf('protectedRoom = preclassifiedRoom || await protectedRoomForPersonalFile',a);
assert(a>=0 && b>a,'pre-upload classification must be checked before reclassification');
assert(s.slice(a,b).includes('PROTECTED_ROOMS.kassa'));
assert(s.slice(a,b).includes('PROTECTED_ROOMS.otchet'));
assert(s.slice(a,b).includes('entry.source === "pre"'));
console.log('PASS: post-message reuses pre-upload receipt/photo classification');
