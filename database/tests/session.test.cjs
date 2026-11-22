const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const run=(file,require)=>{const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:require??(()=>{throw new Error('unexpected import');}),process});return exports;};
const domain=run('features/session/domain/session.ts'),watch=run('features/session/domain/session-watch.ts');
const {roleLabel,personName,pickActiveInstitution,bestCampaignRole,isSessionArea,areaHome}=domain;
const A={id:'11111111-1111-4111-8111-111111111111',name:'Alfa',role:'teacher'},B={id:'22222222-2222-4222-8222-222222222222',name:'Beta',role:'member'},C={id:'33333333-3333-4333-8333-333333333333',name:'Gama',role:'admin'};

// D-38: generic labels; the interface never says "Alumno".
assert.equal(roleLabel({area:'participant',active:A}),'Participante');
assert.equal(roleLabel({area:'panel',active:A,campaignRole:'observer'}),'Docente','a teacher of the active institution is "Docente"');
assert.equal(roleLabel({area:'panel',active:B,campaignRole:'co_master'}),'Co-Master');
assert.equal(roleLabel({area:'panel',active:B,campaignRole:'observer'}),'Observador');
assert.equal(roleLabel({area:'panel',active:B,bestRole:'master'}),'Master');
assert.equal(roleLabel({area:'panel',active:C}),'Administrador');
assert.equal(roleLabel({area:'admin',active:C}),'Administrador');
assert.equal(roleLabel({area:'admin',active:B}),'Participante');
assert.equal(roleLabel({area:'nexus',active:null}),'Administrador de NEXUS');
for(const area of ['participant','panel','admin','nexus'])for(const active of [A,B,C,null])for(const campaignRole of [null,'master','co_master','observer'])
 assert(!/alumn/i.test(roleLabel({area,active,campaignRole})),'never "Alumno"');
assert.equal(bestCampaignRole(['observer','master','co_master']),'master');assert.equal(bestCampaignRole(['observer','co_master']),'co_master');assert.equal(bestCampaignRole([]),null);
// The person's name; without one, the e-mail.
assert.equal(personName('  Ana  ','ana@test.test'),'Ana');assert.equal(personName('   ','ana@test.test'),'ana@test.test');assert.equal(personName(null,null),'Sin nombre');
console.log('PASS session labels: Participante, Docente, Master, Co-Master, Observador, Administrador; name or e-mail');

// D-39: the cookie only chooses among ACTIVE memberships; foreign, revoked or malformed ids fall back to the first.
const memberships=[A,B];
assert.equal(pickActiveInstitution(memberships,B.id),B);
assert.equal(pickActiveInstitution(memberships,B.id.toUpperCase()),B);
for(const cookie of [C.id,'not-a-uuid','',null,undefined,"' or 1=1 --",B.id+'x'])assert.equal(pickActiveInstitution(memberships,cookie),A,'ignored: '+cookie);
assert.equal(pickActiveInstitution([],A.id),null,'without memberships a cookie gives nothing');
assert(isSessionArea('panel')&&!isSessionArea('/master')&&!isSessionArea(undefined));
assert.deepEqual({...areaHome},{participant:'/alumno',panel:'/master',admin:'/instituciones',nexus:'/nexus'});
console.log('PASS active institution: cookie only chooses among active memberships');

// Session change in another tab: reload only for a different stored key.
assert.equal(watch.sessionChanged('k1','k2'),true);assert.equal(watch.sessionChanged('k1','k1'),false);
assert.equal(watch.sessionChanged('k1',null),false);assert.equal(watch.sessionChanged('k1',''),false);assert.equal(watch.sessionChanged('k1',undefined),false);
assert.equal(watch.sessionChanged('k1',watch.SIGNED_OUT_KEY),true,'sign-out in another tab reloads');
console.log('PASS session watch: reloads on a different session, never because of itself');

// Server actions: the cookie keeps only a validated id with safe attributes; sign-out removes it.
const jar=new Map(),log=[];let actor='actor',valid=new Set([B.id]);
const actions=run('features/session/application/session-actions.ts',name=>({
 'next/headers':{cookies:async()=>({set:(n,v,o)=>{jar.set(n,{value:v,options:o});log.push(['set',n]);},delete:n=>{jar.delete(n);log.push(['delete',n]);}})},
 'next/cache':{revalidatePath:()=>{}},
 'next/navigation':{redirect:p=>{throw new Error('redirect:'+p);}},
 '@/lib/supabase/server':{createClient:async()=>({auth:{signOut:async()=>log.push(['signOut'])}})},
 '@/features/auth/application/get-authenticated-user-id':{getAuthenticatedUserId:async()=>actor},
 '../domain/session':domain,
 '../repositories/session.repository':{resolveInstitutionChoice:async(_,raw)=>valid.has(raw)?raw:null},
})[name]??(()=>{throw new Error('unexpected import '+name);})());
const form=entries=>new Map(Object.entries(entries));
(async()=>{
 await assert.rejects(actions.chooseInstitution(form({institutionId:C.id,area:'panel'})),/redirect:\/master$/);
 assert.equal(jar.size,0,'a foreign or revoked institution is never stored');
 await assert.rejects(actions.chooseInstitution(form({institutionId:B.id,area:'https://evil.test'})),/redirect:\/$/,'an unknown area goes home, never to a given URL');
 const stored=jar.get('nexus-institution');assert.equal(stored.value,B.id,'only the id');
 assert.deepEqual({...stored.options},{httpOnly:true,sameSite:'lax',secure:false,path:'/',maxAge:31536000});
 const env=process.env.NODE_ENV;process.env.NODE_ENV='production';
 try{await assert.rejects(actions.chooseInstitution(form({institutionId:B.id,area:'participant'})),/redirect:\/alumno$/);}finally{process.env.NODE_ENV=env;}
 assert.equal(jar.get('nexus-institution').options.secure,true,'Secure in production');
 actor=null;jar.clear();await assert.rejects(actions.chooseInstitution(form({institutionId:B.id,area:'panel'})),/redirect:\/$/);assert.equal(jar.size,0,'no session, no cookie');
 actor='actor';jar.set('nexus-institution',{value:B.id});log.length=0;
 await assert.rejects(actions.signOut(),/redirect:\/$/);
 assert.deepEqual(log,[['signOut'],['delete','nexus-institution']]);
 console.log('PASS session actions: validated id only, httpOnly + SameSite=Lax, no redirect to given URLs, sign-out clears the choice');
})().catch(e=>{console.error(e);process.exitCode=1;});
