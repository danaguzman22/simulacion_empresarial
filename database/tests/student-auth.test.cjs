const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const calls=[];let session=null,fail=false;
const client={auth:{async signUp(input){calls.push(input);return {data:{session},error:fail?{}:null};},async signInWithPassword(input){calls.push(input);return {error:fail?{}:null};},async signOut(){calls.push('out');}}};
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/features/auth/application/student-auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,require(name){if(name==='next/navigation')return {redirect(path){throw new Error('redirect:'+path);}};if(name==='@/lib/supabase/server')return {createClient:async()=>client};throw new Error(name);}});
const form=(operation,extra={})=>new Map(Object.entries({operation,email:'student@test.test',password:'safe-test-password',displayName:'Student',role:'master',...extra}));
(async()=>{
 assert.match((await exportsObject.studentAuth({},form('register'))).message,/correo/);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{email:'student@test.test',password:'safe-test-password',options:{data:{display_name:'Student'}}});
 const masterLogin={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/features/auth/application/sign-in-master.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:masterLogin,require(name){if(name==='next/navigation')return {redirect(path){throw new Error('redirect:'+path);}};if(name==='@/lib/supabase/server')return {createClient:async()=>client};throw new Error(name);}});
 await assert.rejects(masterLogin.signInMaster({},form('login')),/redirect:\/acceso/);
 const count=calls.length;await exportsObject.studentAuth({},form('register',{password:'short'}));assert.equal(calls.length,count);
 session={};await assert.rejects(exportsObject.studentAuth({},form('register')),/redirect:\/acceso/);
 await assert.rejects(exportsObject.studentAuth({},form('login')),/redirect:\/acceso/);
 fail=true;assert.match((await exportsObject.studentAuth({},form('login'))).message,/No se pudo/);
 await assert.rejects(exportsObject.signOutStudent(),/redirect:\/login\/alumno/);
 console.log('PASS signup/login/logout contract; confirmation-required and immediate-session flows; role metadata ignored; validation and generic errors');
})().catch(e=>{console.error(e);process.exitCode=1;});
