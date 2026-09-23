const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),web=createRequire(base+'/package.json'),ts=web('typescript');
function domain(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/'+file+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:n=>n.startsWith('@/')?domain(n.slice(2)):web(n)});return exports;}
const ruleDomain=domain('features/rules/domain/rule');
function render(pending=false,rule, runtime=false){
 const exports={};let submit;
 const code=ts.transpileModule(fs.readFileSync(base+'/src/features/rules/components/RuleForm.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,crypto:require('node:crypto').webcrypto,require(name){
  if(name==='react')return {useRef:value=>({current:value}),useState:value=>[value,()=>{}],useActionState(action){submit=action;return [{},()=>{},pending];}};
  if(name==='../application/rule-actions')return {ruleAction:async()=>({success:'ok'})};
  if(name==='../domain/rule')return ruleDomain;
  if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
  return web(name);
 }});
 return {tree:exports.RuleForm({data:{gameId:'game',rules:[],kpis:[{id:'cash',name:'Fondos',unit:'ARS'}],canEditEffects:runtime},rule}),submit:()=>submit({},new FormData())};
}
function find(node,type){if(Array.isArray(node))return node.flatMap(n=>find(n,type));if(!node||typeof node!=='object')return [];return [...(node.type===type?[node]:[]),...find(node.props.children,type)];}
async function main(){
 assert.equal(ruleDomain.effectAmount('increase','5000'),'5000');assert.equal(ruleDomain.effectAmount('decrease','5000'),'-5000');
 for(const text of ['-5000','+5000','1e3','NaN',''])assert.throws(()=>ruleDomain.effectAmount('increase',text));
 for(const [amount,direction] of [['-5000','decrease'],['5000','increase']]){
  const edit=render(false,{id:'rule',revision:1,effects:[{kpiId:'cash',amount}]},true).tree;
  assert.equal(find(edit,'select').find(n=>n.props.name==='direction').props.defaultValue,direction);
  assert.equal(find(edit,'input').find(n=>n.props.name==='magnitude').props.defaultValue,'5000');
  assert.equal(find(edit,'textarea').find(n=>n.props.name==='reason').props.required,true);
  assert.equal(find(edit,'select').some(n=>n.props.name==='kpiId'),false);
  assert.equal(find(edit,'button').some(n=>n.props.children==='Quitar efecto'),false);
 }
 assert.equal(find(render().tree,'textarea').some(n=>n.props.name==='reason'),false);
 const {tree,submit}=render();let prevented=0;const input={value:''},event={preventDefault(){prevented++;},currentTarget:{elements:{namedItem(){return input;}}}};
 tree.props.onSubmit(event);const first=input.value;assert.match(first,/^[0-9a-f-]{36}$/);
 tree.props.onSubmit(event);assert.equal(prevented,1);assert.equal(input.value,first);
 await submit();tree.props.onSubmit(event);assert.equal(input.value,first,'retry retains rule ID');
 await submit();tree.props.onChange();tree.props.onSubmit(event);assert.notEqual(input.value,first,'intentional new input gets a new rule ID');
 const blocked=render(true).tree;assert.equal(find(blocked,'fieldset')[0].props.disabled,true);assert.equal(find(blocked,'button').find(n=>!n.props.type).props.children,'Guardando...');blocked.props.onSubmit(event);assert.equal(prevented,2);
 console.log('PASS: rule form blocks duplicate submits; stable retry ID; intentional edits get a new ID; pending controls disabled.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
