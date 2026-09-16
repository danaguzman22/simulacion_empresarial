const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),web=createRequire(base+'/package.json'),ts=web('typescript');
function render(pending=false) {
 const exports={},refs=[];let submitAction;
 const code=ts.transpileModule(fs.readFileSync(base+'/src/features/situations/components/SituationForm.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{exports,crypto:require('node:crypto').webcrypto,require(name){
  if(name==='react')return {useRef(value){const ref={current:value};refs.push(ref);return ref;},useState:value=>[value,()=>{}],useActionState(action){submitAction=action;return [{},()=>{},pending];}};
  if(name==='../application/situation-actions')return {publishSituationAction:async()=>({success:'ok'})};
  if(name==='next/navigation')return {useRouter:()=>({refresh(){}})};
  return web(name);
 }});
 const tree=exports.SituationForm({gameId:'game',data:{revision:1,kpis:[]}});
 return {tree,submit:()=>submitAction({},new FormData()),refs};
}
function find(node,type) {
 if(Array.isArray(node))return node.flatMap(n=>find(n,type));
 if(!node || typeof node!=='object')return [];
 return [...(node.type===type?[node]:[]),...find(node.props.children,type)];
}
async function main(){
 const {tree,submit}=render();let prevented=0;const input={value:''};
 const event={preventDefault(){prevented++;},currentTarget:{elements:{namedItem(){return input;}}}};
 tree.props.onSubmit(event);const first=input.value;assert.match(first,/^[0-9a-f-]{36}$/);
 tree.props.onSubmit(event);assert.equal(prevented,1);assert.equal(input.value,first);
 await submit();tree.props.onSubmit(event);assert.equal(input.value,first,'unchanged retry preserves operation ID');
 await submit();tree.props.onChange();tree.props.onSubmit(event);assert.notEqual(input.value,first,'new intentional input gets a new operation ID');
 const blocked=render(true).tree;assert.equal(find(blocked,'fieldset')[0].props.disabled,true);assert.equal(find(blocked,'button').find(n=>!n.props.type).props.disabled,true);assert.equal(find(blocked,'button').find(n=>!n.props.type).props.children,'Publicando...');
 blocked.props.onSubmit(event);assert.equal(prevented,2);
 console.log('PASS: immediate duplicate submit blocked; pending controls disabled; Publicando label; stable retry ID; edited input gets a new ID.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
