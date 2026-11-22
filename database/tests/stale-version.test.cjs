const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Number,Set});return exports;}
const {decideStaleRecovery,parseLastReload,isDraftField,STALE_RELOAD_COOLDOWN_MS}=load(base+'/src/features/app-version/domain/stale-version.ts');
const now=1_800_000_000_000;

// #85: a window with the old version reloads by itself the first time.
assert.equal(decideStaleRecovery({now,lastReloadAt:null,hasDraft:false}),'reload');
// No loop: right after an automatic reload, it asks instead of reloading again...
assert.equal(decideStaleRecovery({now,lastReloadAt:now-1000,hasDraft:false}),'ask');
assert.equal(decideStaleRecovery({now,lastReloadAt:now-STALE_RELOAD_COOLDOWN_MS+1,hasDraft:false}),'ask');
// ...and after the cooldown it may reload again (an unattended projection keeps recovering).
assert.equal(decideStaleRecovery({now,lastReloadAt:now-STALE_RELOAD_COOLDOWN_MS,hasDraft:false}),'reload');
// A stored time in the future (clock changed) does not block recovery forever.
assert.equal(decideStaleRecovery({now,lastReloadAt:now+60_000,hasDraft:false}),'reload');
// Unsent text is never lost: always ask, even the first time.
assert.equal(decideStaleRecovery({now,lastReloadAt:null,hasDraft:true}),'ask');
assert.equal(decideStaleRecovery({now,lastReloadAt:now-STALE_RELOAD_COOLDOWN_MS*10,hasDraft:true}),'ask');
// Bounded loop: simulate a server that keeps failing every 5 s for 10 minutes: at most one reload per cooldown.
let last=null,reloads=0;for(let t=now;t<now+10*60_000;t+=5000)if(decideStaleRecovery({now:t,lastReloadAt:last,hasDraft:false})==='reload'){reloads++;last=t;}
assert.equal(reloads,Math.ceil(10*60_000/STALE_RELOAD_COOLDOWN_MS));
console.log('PASS stale version: reloads once, no loop, retries after the cooldown, never with unsent text');

// Stored value: anything unreadable counts as "never reloaded".
assert.equal(parseLastReload(String(now)),now);
for(const raw of [null,'','abc','-5','1e12','12.5',' 123','9'.repeat(16)])assert.equal(parseLastReload(raw),null,'unreadable: '+raw);
// Drafts: text fields count, filters do not.
for(const f of [{tagName:'TEXTAREA'},{tagName:'input',type:'text'},{tagName:'INPUT',type:''},{tagName:'INPUT',type:'number'},{tagName:'DIV',isContentEditable:true}])assert.equal(isDraftField(f),true,JSON.stringify(f));
for(const f of [{tagName:'SELECT'},{tagName:'INPUT',type:'checkbox'},{tagName:'INPUT',type:'radio'},{tagName:'INPUT',type:'hidden'},{tagName:'BUTTON'},{tagName:'DIV'}])assert.equal(isDraftField(f),false,JSON.stringify(f));
console.log('PASS stale version: stored time parsing and draft fields');
