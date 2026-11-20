const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const mod={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/features/rounds/domain/round.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,Date,Math});
const {allPeriodsCompleted,periodBarState}=mod;
const p=(sequence,status)=>({sequence,status});
// #83: one criterion, the same as the database (0016) and the move to evaluation.
assert.equal(allPeriodsCompleted([]),false,'no periods is not "all finished"');
assert.equal(allPeriodsCompleted([p(1,'completed'),p(2,'completed')]),true);
assert.equal(allPeriodsCompleted([p(1,'completed'),p(2,'cancelled')]),false,'a cancelled period does not count as finished');
assert.equal(allPeriodsCompleted([p(1,'completed'),p(2,'pending')]),false);
// The header bar shows "all finished" only under that same criterion.
assert.equal(periodBarState([p(1,'completed'),p(2,'completed')]).kind,'all-completed');
assert.equal(periodBarState([p(1,'completed'),p(2,'cancelled')]).kind,'none','never "Todos los períodos finalizaron" with a cancelled period');
assert.equal(periodBarState([]).kind,'none');
let state=periodBarState([p(1,'completed'),p(2,'active'),p(3,'pending')]);assert.equal(state.kind,'running');assert.equal(state.period.sequence,2);
state=periodBarState([p(1,'completed'),p(2,'paused')]);assert.equal(state.kind,'running');
state=periodBarState([p(2,'pending'),p(1,'completed'),p(3,'pending')]);assert.equal(state.kind,'next');assert.equal(state.period.sequence,2);assert.equal(state.ready,true);
state=periodBarState([p(1,'cancelled'),p(2,'pending')]);assert.equal(state.kind,'next');assert.equal(state.ready,false,'next period waits while an earlier one is not completed');
console.log('PASS round periods: single "all completed" criterion (cancelled excluded) and header bar state');
