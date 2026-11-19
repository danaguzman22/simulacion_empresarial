const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const base=path.resolve(__dirname,'../../apps/web'),req=createRequire(base+'/package.json'),ts=req('typescript');
const mod={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(base+'/src/features/games/domain/start-errors.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod});
const {startErrorMessage,databaseErrorMessage}=mod;
// Every database rule that can reject a start maps to a concrete reason (never the generic message).
const cases={
 'Start requires at least one goal while goals are required':/^Metas: /,
 'Start requires at least one enabled rule while rules are required':/^Reglas: activá/,
 'Start requires valid enabled rules and configured numeric targets':/^Reglas: cada regla/,
 'A required KPI is missing':/^KPIs: /,
 'Starting game requires period configuration':/^Tiempos: /,
 'Starting a game requires frozen preparation/initial and an independent current state':/Recargá los datos/,
 'Start must create exactly all configured pending periods':/Recargá los datos/,
};
for(const [raw,expected] of Object.entries(cases))assert.match(startErrorMessage(raw),expected,raw);
assert.match(startErrorMessage('Something new'),/Motivo informado por la base: Something new/);
for(const message of Object.keys(cases).map(startErrorMessage))assert.doesNotMatch(message,/No se pudo iniciar la partida\. Recargá/);
// Only the PostgreSQL message is used, never the wrapping query text or its parameters.
const pg={name:'PostgresError',message:'A required KPI is missing',severity:'ERROR'};
assert.equal(databaseErrorMessage({message:'Failed query: select secret where id = $1',cause:pg}),'A required KPI is missing');
assert.equal(databaseErrorMessage(pg),'A required KPI is missing');
assert.equal(databaseErrorMessage(new Error('boom')),null);
console.log('PASS start errors: database start rules map to concrete reasons; only the PostgreSQL message is used');
