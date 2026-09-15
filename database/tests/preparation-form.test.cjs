const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const base = path.resolve(__dirname,'../../apps/web');
const requireWeb = createRequire(base + '/package.json');
const ts = requireWeb('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(base + '/src/features/preparation/components/PreparationForm.tsx','utf8'), {
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}
}).outputText;
vm.runInNewContext(code,{exports:exportsObject,require(name) {
  if(name === 'react') return {useActionState:()=>[{},()=>{},false],useRef:()=>({current:null}),useState:initial=>[initial,()=>{}]};
  if(name === '../application/preparation-actions') return {savePreparationAction:()=>{}};
  return requireWeb(name);
}});
const definitions = [
  {id:'cash',name:'Fondos',valueType:'numeric',inherited:true,required:true,unit:'ARS',precision:2},
  {id:'inventory',name:'Inventario',valueType:'ordinal',inherited:true,required:true,unit:'nivel',ordinalOptions:[{key:'low',label:'Bajo'}]},
  {id:'optional',name:'Optional',valueType:'numeric',inherited:true,required:false,unit:'',precision:0},
  {id:'local',name:'Satisfaccion',valueType:'numeric',inherited:false,required:true,unit:'puntos',precision:0}
];
const tree = exportsObject.PreparationForm({gameId:'game',data:{revision:1,catalogToken:'token',source:{name:'Primera partida'},sources:[],definitions,values:[{kpiId:'cash',value:'7000'},{kpiId:'inventory',value:'low'},{kpiId:'local',value:'88'}]}});
// Apply successful-control rules to the rendered form, including disabled fields.
const form = new FormData();
const controls = [];
function visit(node,disabled=false) {
  if(Array.isArray(node)) {node.forEach(child=>visit(child,disabled));return;}
  if(!node || typeof node !== 'object') return;
  const {type,props} = node;
  const blocked = disabled || !!props.disabled;
  if(type === 'input' || type === 'select') {
    controls.push({type,...props});
    if(props.name && !blocked && props.type !== 'checkbox') form.append(props.name,props.value ?? props.defaultValue ?? '');
  }
  visit(props.children,blocked);
}
visit(tree);
for(const [id,value] of [['cash','7000'],['inventory','low'],['optional',''],['local','88']]) assert.deepEqual(form.getAll('value:'+id),[value]);
for(const id of ['cash','inventory','optional']) {
  assert(controls.some(c=>c.name==='value:'+id && c.disabled));
  assert(controls.some(c=>c.name==='value:'+id && c.type==='hidden' && !c.disabled));
}
assert(controls.some(c=>c.name==='value:local' && !c.disabled && c.type!=='hidden'));
console.log('PASS: inherited numeric/ordinal inputs disabled; hidden values submitted exactly once, including empty optional KPI; local input editable.');
