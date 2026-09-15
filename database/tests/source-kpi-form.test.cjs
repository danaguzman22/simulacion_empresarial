const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const base = path.resolve(__dirname, '../../apps/web');
const req = createRequire(base + '/package.json');
const ts = req('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/features/preparation/components/SourceKpiConfiguration.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:exported,require(name){
    if(name==='react') return {useActionState:()=>[{},()=>{},false],useRef:()=>({current:null}),useState:value=>[value,()=>{}]};
    if(name==='../application/configure-source-kpi') return {configureSourceKpiAction:()=>{}};
    return req(name);
  }
});
function render(kpi,canEdit=true){
  const nodes=[],text=[];
  function visit(node,disabled=false){
    if(Array.isArray(node)) return node.forEach(n=>visit(n,disabled));
    if(typeof node==='string') {text.push(node);return;}
    if(!node || typeof node!=='object') return;
    if(typeof node.type==='function') return visit(node.type(node.props),disabled);
    const blocked=disabled||!!node.props.disabled;
    nodes.push({...node.props,tag:node.type,blocked});
    visit(node.props.children,blocked);
  }
  visit(exported.SourceKpiConfiguration({gameId:'game',data:{canEdit,revision:2,catalogToken:'token',predecessor:[kpi],values:[{kpiId:kpi.id,value:'medium'}]}}));
  return {nodes,text:text.join(' ')};
}
const kpi={id:'inventory',name:'Inventario',valueType:'ordinal',value:null,ordinalKey:'low',ordinalOptions:[{key:'low',label:'Bajo'},{key:'medium',label:'Medio'}],included:true,origin:'inherited'};
let result=render(kpi);
assert(result.text.includes('Bajo'));
assert(result.text.includes('Heredar valor anterior'));
assert(!result.nodes.some(n=>n.name==='value'));
result=render({...kpi,origin:'redefined'});
assert(result.nodes.some(n=>n.tag==='select'&&n.name==='value'&&n.defaultValue==='medium'));
assert(result.text.includes('Medio'));
result=render({...kpi,valueType:'numeric',value:'100',unit:'ARS',origin:'redefined'});
assert(result.nodes.some(n=>n.tag==='input'&&n.name==='value'&&n.inputMode==='decimal'));
result=render({...kpi,included:false});
assert(result.nodes.some(n=>n.name==='included'&&!n.checked));
assert(!result.nodes.some(n=>n.name==='value'));
result=render({...kpi,origin:'redefined'},false);
assert(result.nodes.filter(n=>n.tag==='select'||n.tag==='input'&&n.type!=='hidden').every(n=>n.blocked));
assert(!result.nodes.some(n=>n.tag==='button'));
console.log('PASS: source modes, numeric/ordinal editors, human labels, excluded selection and observer read-only controls.');
