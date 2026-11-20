const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const mod={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/features/dashboard/domain/kpi-series.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod,Intl,Number,Math,Map,String});
const {buildKpiSeries}=mod;
const cash={id:'cash',name:'Fondos',unit:'ARS',precision:2,valueType:'numeric',ordinalOptions:[]};
const level={id:'level',name:'Inventario',unit:'',precision:0,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'mid',label:'Medio',position:1},{key:'high',label:'Alto',position:2}]};
const v=(value,ordinalKey=null)=>({value,ordinalKey});
const periods=[{id:'r1',sequence:1,status:'completed'},{id:'r2',sequence:2,status:'completed'},{id:'r3',sequence:3,status:'active'},{id:'r4',sequence:4,status:'pending'}];
const changes=[
 {kpiDefinitionId:'cash',roundId:'r1',revision:1,after:v('1200')},{kpiDefinitionId:'cash',roundId:'r1',revision:2,after:v('1500.5')},
 {kpiDefinitionId:'level',roundId:'r2',revision:3,after:v(null,'high')},{kpiDefinitionId:'cash',roundId:'r3',revision:4,after:v('900')},
];
const kpis=buildKpiSeries({definitions:[cash,level],periodLabel:'Semana',periods,initial:new Map([['cash',v('1000')],['level',v(null,'mid')]]),current:new Map([['cash',v('900')],['level',v(null,'high')]]),changes});
const plain=x=>JSON.parse(JSON.stringify(x));
const [c,l]=plain(kpis);
// Series: start, close of each started period (last change in it, or carried), running period = current; pending excluded.
assert.deepEqual(c.series.map(p=>p.label),['Inicio','Semana 1','Semana 2','Semana 3']);
assert.deepEqual(c.series.map(p=>p.number),[1000,1500.5,1500.5,900]);
assert.equal(c.series[3].running,true);assert.equal(c.series[1].running,undefined);
assert.equal(c.current.display,'900,00 ARS');assert.equal(c.series[1].display,'1.500,50 ARS');
// Trend against the previous point (close of Semana 2): numeric difference with sign, unit and locale.
assert.deepEqual(c.trend,{direction:'down',display:'−600,50 ARS',against:'Semana 2'});
// Ordinal: positions in the series, labels in the display, trend as "from → to".
assert.deepEqual(l.series.map(p=>p.number),[1,1,2,2]);assert.deepEqual(l.series.map(p=>p.display),['Medio','Medio','Alto','Alto']);
assert.deepEqual(l.trend,{direction:'flat',display:'Sin cambios',against:'Semana 2'});assert.deepEqual(l.levels.map(x=>x.label),['Bajo','Medio','Alto']);
// Before any period starts there is only the start point and no trend.
const [fresh]=plain(buildKpiSeries({definitions:[cash],periodLabel:'Semana',periods:[{id:'r1',sequence:1,status:'pending'}],initial:new Map([['cash',v('1000')]]),current:new Map([['cash',v('1000')]]),changes:[]}));
assert.deepEqual(fresh.series.map(p=>p.label),['Inicio']);assert.equal(fresh.trend,null);assert.equal(fresh.current.display,'1.000,00 ARS');
// Rising value, and a KPI without a value never breaks the series.
const [up]=plain(buildKpiSeries({definitions:[cash],periodLabel:'Ronda',periods:[{id:'r1',sequence:1,status:'completed'}],initial:new Map([['cash',v('10')]]),current:new Map([['cash',v('15')]]),changes:[{kpiDefinitionId:'cash',roundId:'r1',revision:1,after:v('15')}]}));
assert.deepEqual(up.trend,{direction:'up',display:'+5,00 ARS',against:'Inicio'});
const [empty]=plain(buildKpiSeries({definitions:[cash],periodLabel:'Ronda',periods:[],initial:new Map(),current:new Map(),changes:[]}));
assert.equal(empty.current.display,'Sin valor');assert.equal(empty.current.number,null);assert.equal(empty.trend,null);
console.log('PASS kpi series: start and period closes, running period, numeric and ordinal display, trend direction, empty values');
