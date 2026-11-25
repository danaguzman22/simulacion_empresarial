const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,Object,String,Number,
  require:name=>name.startsWith('@/')?load(base+'/src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):(()=>{throw new Error('unexpected import '+name)})()});return exports;}
const P=load(base+'/src/features/students/domain/pending-game.ts');

// Portal: a game that did not start yet. Same text in "Mis partidas" and on the game's URL.
assert.equal(P.pendingGameTitle,'La partida todavía no empezó');
assert.equal(P.pendingPeriodText({periodCount:4,periodLabel:'Ronda',periodDurationSeconds:1200}),'Programada: 4 períodos (Ronda) de 20 min.');
assert.equal(P.pendingPeriodText({periodCount:1,periodLabel:'  Semana ',periodDurationSeconds:5400}),'Programada: 1 período (Semana) de 1 h 30 min.');
assert.equal(P.pendingPeriodText({periodCount:2,periodLabel:null,periodDurationSeconds:45}),'Programada: 2 períodos de 45 s.');
for(const p of [{periodCount:null,periodLabel:'Ronda',periodDurationSeconds:600},{periodCount:3,periodLabel:'Ronda',periodDurationSeconds:null},{periodCount:0,periodLabel:'Ronda',periodDurationSeconds:600}])
 assert.equal(P.pendingPeriodText(p),null,'no periods yet: nothing about them');
console.log('PASS pending game: title and periods text, nothing when periods are not set');
