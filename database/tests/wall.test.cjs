const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Intl,Number,Math,Map,String,BigInt,
  require:name=>name.startsWith('@/')?load(base+'/src/'+name.slice(2)+'.ts'):name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):(()=>{throw new Error('unexpected import '+name)})()});return exports;}
const {buildWall,wallKindLabels}=load(base+'/src/features/dashboard/domain/wall.ts');
const cash={id:'cash',name:'Fondos',unit:'ARS',precision:0,valueType:'numeric',ordinalOptions:[]};
const v=value=>({value,ordinalKey:null});
const change=(id,extra)=>({id,source:'manual',roundId:'r1',kpiDefinitionId:'cash',situationId:null,ruleExecutionId:null,before:v('100'),after:v('90'),createdAt:'2026-11-20T10:00:00.000Z',...extra});
const wall=JSON.parse(JSON.stringify(buildWall({
 definitions:[cash],periodLabel:'Semana',periods:[{id:'r1',sequence:1},{id:'r2',sequence:2}],
 situations:[{id:'s1',roundId:'r1',title:'Aviso general',description:'Traigan las planillas',effectCount:0,publishedAt:'2026-11-20T09:00:00.000Z'},
  {id:'s2',roundId:'r2',title:'Nuevo socio',description:'',effectCount:1,publishedAt:'2026-11-20T11:00:00.000Z'}],
 ruleExecutions:[{id:'e1',roundId:'r2',name:'Mantenimiento',displayMessage:'  ',executedAt:'2026-11-20T12:00:00.000Z'}],
 changes:[change('c1',{}),change('c2',{source:'situation',situationId:'s2',roundId:'r2',before:v('90'),after:v('80'),createdAt:'2026-11-20T11:00:00.000Z'}),
  change('c3',{source:'rule',ruleExecutionId:'e1',roundId:'r2',before:v('80'),after:v('75'),createdAt:'2026-11-20T12:00:00.000Z'}),
  change('c4',{source:'situation',situationId:'hidden',roundId:'r2',before:v('75'),after:v('1'),createdAt:'2026-11-20T13:00:00.000Z'})],
})));
// Newest first; kinds: notice (situation without effects), situation, rule, Master change.
assert.deepEqual(wall.map(i=>[i.kind,i.periodLabel,i.title]),[['rule','Semana 2','Mantenimiento'],['situation','Semana 2','Nuevo socio'],['master_change','Semana 1','El Master ajustó Fondos'],['notice','Semana 1','Aviso general']]);
// Each notice carries only its own effects: a change from a situation not on the wall (hidden) never shows.
assert.deepEqual(wall.find(i=>i.kind==='situation').effects,[{kpi:'Fondos',before:'90 ARS',after:'80 ARS'}]);
assert.deepEqual(wall.find(i=>i.kind==='rule').effects,[{kpi:'Fondos',before:'80 ARS',after:'75 ARS'}]);
assert.deepEqual(wall.find(i=>i.kind==='master_change').effects,[{kpi:'Fondos',before:'100 ARS',after:'90 ARS'}]);
assert(!JSON.stringify(wall).includes('"1 ARS"'),'effects of a hidden situation never reach the wall');
assert.equal(wall.find(i=>i.kind==='notice').body,'Traigan las planillas');assert.equal(wall.find(i=>i.kind==='situation').body,null);
// Only public fields: no actor or source identifiers.
for(const item of wall)assert.deepEqual(Object.keys(item).sort(),['at','body','effects','id','kind','periodId','periodLabel','title']);
assert.equal(wallKindLabels.notice,'Aviso del Master');
console.log('PASS wall: kinds, newest first, own effects only, rule name fallback, public fields only');
