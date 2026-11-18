const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Date,Math,require:name=>{if(name.startsWith('@/'))return load(base+'/src/'+name.slice(2)+'.ts');throw new Error('unexpected import '+name);}});return exports;}
const {shouldRefreshOnExpiry}=load(base+'/src/features/students/domain/clock.ts');
const endsAt='2026-11-18T12:00:00.000Z',end=Date.parse(endsAt);
const active={status:'active',endsAt,remainingMs:null};
// Before the end time, and for paused or missing periods, the clock never asks for a refresh.
assert.equal(shouldRefreshOnExpiry(active,end-1000,null),false);
assert.equal(shouldRefreshOnExpiry({status:'paused',endsAt,remainingMs:0},end+5000,null),false);
assert.equal(shouldRefreshOnExpiry(null,end+5000,null),false);
// Lazy closing: the server keeps answering "active" after the end time. Simulate the component across
// several refreshes: it must ask once for this endsAt and then leave it to the 15-second refresh.
let refreshedEndsAt=null,refreshes=0;
const render=(period,now)=>{if(shouldRefreshOnExpiry(period,now,refreshedEndsAt)){refreshedEndsAt=period.endsAt;refreshes++;}};
for(let response=0;response<20;response++)for(let tick=0;tick<4;tick++)render({...active},end+response*300+tick*250);
assert.equal(refreshes,1,'one refresh per expired endsAt, no request loop');
// A different expired end time (next period, or a resume that moved it) gets its own single refresh.
const next={status:'active',endsAt:'2026-11-18T12:10:00.000Z',remainingMs:null};
for(let i=0;i<10;i++)render({...next},Date.parse(next.endsAt)+i*250);
assert.equal(refreshes,2);
console.log('PASS student clock: no refresh before expiry, paused or idle; one refresh per expired endsAt despite lazy closing');
