const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),web=createRequire(base+'/package.json'),ts=web('typescript');
const code=ts.transpileModule(fs.readFileSync(base+'/src/features/institutions/components/InstitutionDetail.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const mod={};
vm.runInNewContext(code,{exports:mod,require(name){
 if(name==='next/link')return {default:function Link(){}};
 if(name==='./InstitutionForm')return {InstitutionForm:function InstitutionForm(){}};
 return web(name);
}});
function text(node){
 if(Array.isArray(node))return node.map(text).join('');
 if(node===null||node===undefined||typeof node==='boolean')return '';
 if(typeof node!=='object')return String(node);
 return text(node.props.children);
}
function find(node,predicate){
 if(Array.isArray(node))return node.flatMap(n=>find(n,predicate));
 if(!node||typeof node!=='object')return [];
 return [...(predicate(node)?[node]:[]),...find(node.props.children,predicate)];
}
const data=(overrides)=>({institution:{id:'inst',name:'UTN'},admins:[{name:'Admin'}],canManage:true,members:[],requests:[],legacyCompanies:[],...overrides});
const headings=tree=>find(tree,n=>n.type==='h2').map(text);
const linkForms=tree=>find(tree,n=>n.props&&n.props.kind==='link');
const empty=mod.InstitutionDetail({data:data()});
assert.ok(!headings(empty).some(h=>h.includes('pendientes de vinculación')),'empty list hides the section');
assert.deepEqual(headings(empty),['Solicitudes pendientes','Miembros'],'other admin sections stay visible');
const pending=mod.InstitutionDetail({data:data({legacyCompanies:[{id:'c1',name:'nexus'},{id:'c2',name:'otra'}]})});
assert.ok(headings(pending).includes('Tus empresas simuladas pendientes de vinculación'),'non-empty list shows the section');
assert.deepEqual(linkForms(pending).map(f=>f.props.entityId),['c1','c2'],'one link form per pending company');
assert.match(text(pending),/primero aprobá acá a todas las personas que ya participan/);
const member=mod.InstitutionDetail({data:data({canManage:false,legacyCompanies:[{id:'c1',name:'nexus'}]})});
assert.ok(!headings(member).some(h=>h.includes('pendientes de vinculación')),'non-admins never see the section');
console.log('PASS: pending-link section hidden when empty and for non-admins; shown with one link form per company; explanation rendered.');
