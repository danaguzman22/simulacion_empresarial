const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web');const req=createRequire(base+'/package.json');const ts=req('typescript');
class BusinessError extends Error {} class PreparationError extends Error {}
const gameId='80d85a05-19ab-4bd2-9698-50f80c7cc126',campaignId='d4c53074-1776-4c78-aabb-26d95870f4dc';
let fail=false,redirects=[];const moduleExports={};
const code=ts.transpileModule(fs.readFileSync(base+'/src/features/games/application/game-lifecycle-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
vm.runInNewContext(code,{exports:moduleExports,console,require(name){
 if(name==='next/cache')return {revalidatePath(){}};
 if(name==='next/navigation')return {redirect(url){redirects.push(url);throw {redirect:url};}};
 if(name.includes('get-authenticated-user-id'))return {getAuthenticatedUserId:async()=>gameId};
 if(name.includes('domain/preparation'))return {PreparationError,UUID_PATTERN:/^[a-f0-9-]{36}$/};
 if(name.includes('game-lifecycle.repository'))return {GameLifecycleError:BusinessError,deleteGame:async()=>{if(fail)throw new BusinessError('Datos protegidos');return {campaignId};}};
 throw Error(name);
}});
(async()=>{const f=new FormData();f.set('gameId',gameId);f.set('operationId',campaignId);
 await assert.rejects(moduleExports.deleteGameAction({},f),e=>e.redirect==='/master/campanas/'+campaignId);assert.equal(redirects.length,1);
 fail=true;const result=await moduleExports.deleteGameAction({},f);assert.equal(result.error,'Datos protegidos');assert.equal(redirects.length,1);
 console.log('PASS: successful delete redirects to campaign; redirect is not swallowed; failed delete preserves business error and does not redirect.');
})().catch(e=>{console.error(e);process.exitCode=1;});
