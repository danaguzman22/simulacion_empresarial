const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const mod={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/features/games/domain/game-tabs.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,require:()=>({})});
const {gameTabsFor,defaultGameTab,isGameTab,isPreparationStatus}=mod;
const tabs=status=>[...gameTabsFor(status)];
for(const status of ['draft','ready']){assert.deepEqual(tabs(status),['kpis','tiempos','metas','reglas','fichas','equipos']);assert.equal(defaultGameTab(status),'kpis');assert.equal(isPreparationStatus(status),true);}
for(const status of ['active','paused']){assert.deepEqual(tabs(status),['dashboard','control','metas','reglas','fichas','equipos','registros']);assert.equal(defaultGameTab(status),'dashboard');assert.equal(isPreparationStatus(status),false);}
for(const status of ['evaluation','completed']){assert.equal(tabs(status).at(-1),'evaluacion');assert(tabs(status).includes('control'));assert.equal(defaultGameTab(status),'evaluacion');}
assert.deepEqual(tabs('cancelled'),['registros']);
// Preparation-only tabs never appear once the game started, and play tabs never appear while preparing.
for(const status of ['active','paused','evaluation','completed'])for(const tab of ['kpis','tiempos'])assert(!tabs(status).includes(tab));
for(const tab of ['dashboard','control','registros','evaluacion'])assert(!tabs('draft').includes(tab));
for(const status of ['draft','ready','active','paused','evaluation','completed','cancelled'])assert(tabs(status).includes(defaultGameTab(status)));
assert.equal(isGameTab('control'),true);assert.equal(isGameTab('constructor'),false);assert.equal(isGameTab('../admin'),false);
console.log('PASS game tabs: tabs per status, default tab, no preparation tabs in play, unknown segments rejected');
