const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Intl,Number,Math,Map,String,BigInt,
  require:name=>name.startsWith('@/')?load(base+'/src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):(()=>{throw new Error('unexpected import '+name)})()});return exports;}
const {buildGoalBoard,resultScale}=load(base+'/src/features/dashboard/domain/goal-board.ts');
const lead={id:'lead',name:'Lead Time',unit:'semanas',precision:1,valueType:'numeric',ordinalOptions:[]};
const stock={id:'stock',name:'Inventario',unit:'',precision:0,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'mid',label:'Medio',position:1}]};
const goal=(id,extra)=>({id,title:'Meta '+id,goalType:'kpi',kpiDefinitionId:null,operator:null,numericTarget:null,ordinalTargetKey:null,fulfilled:null,...extra});
const goals=[goal('a',{kpiDefinitionId:'lead',operator:'<=',numericTarget:'30'}),goal('b',{kpiDefinitionId:'stock',operator:'=',ordinalTargetKey:'mid'}),goal('c',{goalType:'generic'})];
const current=new Map([['lead',{value:'36',ordinalKey:null}],['stock',{value:null,ordinalKey:'mid'}]]);
const plain=x=>JSON.parse(JSON.stringify(x));
// Live: per-goal "meets now" from the system suggestion, generic goals wait for the Master, summary over measurable goals.
let board=plain(buildGoalBoard({status:'active',goals,definitions:[lead,stock],current,storedResult:null}));
assert.equal(board.phase,'live');assert.deepEqual(board.liveSummary,{meeting:1,measurable:2});
assert.deepEqual(board.goals.map(g=>[g.target,g.current,g.meetsNow]),[['Lead Time ≤ 30,0 semanas','36,0 semanas',false],['Inventario = Medio','Medio',true],[null,null,null]]);
assert.equal(board.result,null);
// Only public fields travel: no observations, evaluator or descriptions.
for(const g of board.goals)assert.deepEqual(Object.keys(g).sort(),['current','evaluation','id','kind','kpiName','meetsNow','target','title']);
// Evaluating: partial evaluation shows progress; once every goal is evaluated the result is computed (D-10).
board=plain(buildGoalBoard({status:'evaluation',goals:goals.map((g,i)=>({...g,fulfilled:i===0?false:null})),definitions:[lead,stock],current,storedResult:null}));
assert.equal(board.phase,'evaluating');assert.equal(board.evaluated,1);assert.equal(board.result,null);
board=plain(buildGoalBoard({status:'evaluation',goals:goals.map((g,i)=>({...g,fulfilled:i!==0})),definitions:[lead,stock],current,storedResult:null}));
assert.deepEqual(board.result,{fulfilled:2,evaluated:3,percent:67,category:'partial_victory',label:'Victoria parcial'});
// Final: the stored result wins; the scale has the five D-10 categories from worst to best.
board=plain(buildGoalBoard({status:'completed',goals:goals.map(g=>({...g,fulfilled:true})),definitions:[lead,stock],current,storedResult:{fulfilledCount:3,evaluatedCount:3,category:'epic_victory'}}));
assert.equal(board.phase,'final');assert.deepEqual(board.result,{fulfilled:3,evaluated:3,percent:100,category:'epic_victory',label:'Victoria épica'});
assert.deepEqual([...resultScale],['epic_failure','partial_failure','balanced','partial_victory','epic_victory']);
// No goals: no result (D-33 notice in the panel).
board=plain(buildGoalBoard({status:'active',goals:[],definitions:[lead],current,storedResult:null}));assert.equal(board.phase,'none');assert.equal(board.result,null);
console.log('PASS goal board: live progress, evaluation progress, D-10 result and scale, public fields only, no goals');
