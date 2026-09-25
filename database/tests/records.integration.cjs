const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const base = root + "/apps/web";
const localRequire = createRequire(base + "/package.json");
const postgres = localRequire("postgres");
const { drizzle } = localRequire("drizzle-orm/postgres-js");
const ts = localRequire("typescript");
// Only disposable local databases are accepted; never load application credentials.
const url = process.env.PREPARATION_TEST_URL;
if (!url) throw new Error("Set PREPARATION_TEST_URL to a disposable local PostgreSQL database");
const parsed = new URL(url);
if (parsed.hostname !== "127.0.0.1" || !parsed.pathname.startsWith("/preparation_")) throw new Error("Only local preparation_* test databases are allowed");
const sql = postgres(url, { prepare: false, max: 8, onnotice: () => {} });
let queryCount=0;
const db = drizzle(sql,{logger:{logQuery(){queryCount++;}}});
let sessionActor=null;
const cache = new Map();
const legacyCode = false;
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source=legacyCode?require('node:child_process').execFileSync('git',['show','9ef4b9d61b3f3779fbc6520ce93eed826ed3bf74:'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,encoding:'utf8'}):fs.readFileSync(file,'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, Date, console, require: (name) => {
    if (name === "server-only") return {};
    if (name === "@/features/auth/application/get-authenticated-user-id") return {getAuthenticatedUserId:async()=>sessionActor};
    if (name === "@/db") return { db };
    if (name === "@/db/schema") return load(base + "/src/db/schema/index.ts");
    if (name.startsWith("@/")) return load(base+"/src/"+name.slice(2)+".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
    return localRequire(name);
  } }, { filename: file });
  return exports;
}

async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort()) await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'goals@test.test','{}')`;
 const institution=await require('./institution-fixture.cjs')(sql,[master,co,observer],master);
 await sql`INSERT INTO companies(id,name,created_by,institution_id) VALUES(${company},'Goals',${master},${institution})`;
 const module=name=>load(base+'/src/features/'+name+'.ts');
 let goals,games,lifecycle,start,prep,manage,periods,rounds;
 function reload(){goals=module('goals/repositories/goal.repository');games=module('games/repositories/game.repository');lifecycle=module('games/repositories/game-lifecycle.repository');start=module('games/repositories/start-game.repository');prep=module('preparation/repositories/preparation.repository');manage=module('preparation/repositories/kpi-management.repository');periods=module('rounds/repositories/period-configuration.repository');rounds=module('rounds/repositories/round.repository');}
 reload();
 const generic={title:'Meta repetible',description:null,goalType:'generic',kpiDefinitionId:null,operator:null,numericTarget:null,ordinalTargetKey:null};
 async function fixture(duration=600,count=1) {
  const campaign=randomUUID();await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${campaign},${company},'Campaign',${master})`;
  for(const [id,role]of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${campaign},${id},${role})`;
  const game=(await games.createGame({campaignId:campaign,profileId:master,name:'Game',type:'custom'})).game.id;
  for(const definition of [{key:'cash',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},{key:'inventory',name:'Inventario',unit:'nivel',precision:0,required:true,allowsNegative:false,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'medium',label:'Medio',position:1}]}]) {
   const d=await prep.readPreparation(game,master);await manage.mutateKpi(master,{gameId:game,operationId:randomUUID(),operation:'create_kpi',definition,expectedRevision:d.revision,catalogToken:d.catalogToken});
  }
  const d=await prep.readPreparation(game,master);const cash=d.definitions.find(k=>k.valueType==='numeric').id,inventory=d.definitions.find(k=>k.valueType==='ordinal').id;
  await prep.writePreparation(master,{gameId:game,operationId:randomUUID(),operation:'save_values',expectedRevision:d.revision,catalogToken:d.catalogToken,sourceId:null,values:{[cash]:'128135',[inventory]:'medium'}});
  await periods.savePeriodConfiguration(master,{gameId:game,operationId:randomUUID(),expectedRevision:0,count,label:'Semana',durationSeconds:duration});
  return {game,campaign,cash,inventory};
 }
 async function startGame(game) { const d=await prep.readPreparation(game,master);return start.startGame(master,{gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:1}); }
 const read=game=>goals.readGoals(game,master);
 const create=(game,definition=generic,actor=master,operationId=randomUUID())=>goals.mutateGoal(actor,{gameId:game,operation:'create',operationId,definition});
 async function change(game,id,operation,extra={},actor=master) {const goal=(await read(game)).goals.find(g=>g.id===id);return goals.mutateGoal(actor,{gameId:game,goalId:id,operation,operationId:randomUUID(),expectedRevision:goal.revision,...extra});}
 async function roundAction(game,operation){const r=(await rounds.readRounds(game,master)).rounds[0];await rounds.mutateRound(master,{gameId:game,roundId:r.id,operation,operationId:randomUUID(),expectedRevision:r.revision});return r.id;}
 async function direct(game,action,actor=master) {return sql.begin(async tx=>{await tx`SELECT set_config('nexus.goal_actor',${actor},true),set_config('nexus.goal_operation_id',${randomUUID()},true),set_config('nexus.goal_request_hash','test',true)`;return action(tx);});}


 const {readRecordsSource}=module('records/repositories/records.repository'),{composeRecords,filterRecords,formatRecordNumber,recordDifference}=module('records/domain/record'),{getGameRecords}=module('records/application/get-game-records');
 const situations=module('situations/repositories/situation.repository'),rules=module('rules/repositories/rule.repository'),operational=module('kpis/repositories/game-kpi.repository');
 const history=async(game,actor=master)=>composeRecords(await readRecordsSource(game,actor));
 const a=await fixture(600,2);assert.equal((await history(a.game)).events.length,0);
 assert.equal((await getGameRecords(a.game)).status,'unauthenticated');sessionActor=master;
 assert.equal((await getGameRecords('invalid')).status,'not-found');assert.equal((await getGameRecords(randomUUID())).status,'not-found');
 const outsider=randomUUID();await sql`insert into auth.users values(${outsider},'outsider@test.test','{}')`;
 await assert.rejects(readRecordsSource(a.game,outsider));sessionActor=outsider;assert.equal((await getGameRecords(a.game)).status,'not-found');sessionActor=master;
 const separate=await fixture();await sql`delete from campaign_members where campaign_id=${separate.campaign} and profile_id=${master}`;await assert.rejects(readRecordsSource(separate.game,master));
 let p=await prep.readPreparation(a.game,master);await manage.mutateKpi(master,{gameId:a.game,operationId:randomUUID(),operation:'create_kpi',definition:{key:'lead',name:'Lead Time',unit:'semanas',precision:1,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},expectedRevision:p.revision,catalogToken:p.catalogToken});
 p=await prep.readPreparation(a.game,master);const lead=p.definitions.find(k=>k.key==='lead').id;
 await prep.writePreparation(master,{gameId:a.game,operationId:randomUUID(),operation:'save_values',expectedRevision:p.revision,catalogToken:p.catalogToken,sourceId:null,values:{[a.cash]:'128135',[a.inventory]:'medium',[lead]:'20'}});
 const ruleId=randomUUID();await rules.mutateRule(master,{gameId:a.game,ruleId,operation:'create',definition:{name:'Mantenimiento',description:'Costo',triggerType:'round_end',enabled:true,position:0,visibility:'display',displayMessage:'Costo aplicado',effects:[{kpiId:a.cash,amount:'-5000'},{kpiId:lead,amount:'-1'}]}});
 await startGame(a.game);
 async function action(sequence,operation){const r=(await rounds.readRounds(a.game,master)).rounds.find(r=>r.sequence===sequence);await rounds.mutateRound(master,{gameId:a.game,roundId:r.id,operation,operationId:randomUUID(),expectedRevision:r.revision});return r.id;}
 const firstRound=await action(1,'start');await action(1,'pause');await action(1,'resume');
 async function update(kpi,rawValue){const c=await operational.readGameKpiControls(a.game,master);await operational.updateGameKpi(master,{gameId:a.game,operationId:randomUUID(),kpiDefinitionId:kpi,roundId:c.activeRoundId,expectedRevision:c.revision,expectedRoundRevision:c.activeRoundRevision,rawValue});}
 await update(a.cash,'130000');await update(a.inventory,'low');
 async function publish(title,effects){const [current]=await sql`select revision from game_state_sets where game_id=${a.game} and phase='current'`;await situations.publishSituation(master,{gameId:a.game,operationId:randomUUID(),expectedRevision:current.revision,title,description:'Una decisión de la simulación.',visibility:'display',effects});}
 await publish('Aviso informativo',[]);await publish('Nuevo socio',[{kpiId:a.cash,amount:'100000'},{kpiId:lead,amount:'-1'}]);
 queryCount=0;const source=await readRecordsSource(a.game,master);assert(queryCount<=15,'batch reads must not grow per event');const records=composeRecords(source);
 assert.equal(records.events.filter(e=>e.kind==='manual').length,2);assert.equal(records.events.filter(e=>e.kind==='situation').length,2);
 const numeric=records.events.find(e=>e.kind==='manual'&&e.effects[0].name==='Fondos');assert.equal(numeric.effects[0].before,'128.135 ARS');assert.equal(numeric.effects[0].after,'130.000 ARS');assert.equal(numeric.effects[0].variation,'+1.865 ARS');
 const ordinal=records.events.find(e=>e.kind==='manual'&&e.effects[0].name==='Inventario');assert.equal(ordinal.effects[0].before,'Medio');assert.equal(ordinal.effects[0].after,'Bajo');assert.equal(ordinal.effects[0].variation,null);
 assert.equal(records.events.find(e=>e.title==='Aviso informativo').effects.length,0);assert.equal(records.events.find(e=>e.title==='Nuevo socio').effects.length,2);
 assert.equal(new Set(records.events.map(e=>e.id)).size,records.events.length);assert.equal(records.periods[0].label,'Semana 1');assert.equal(filterRecords(records,firstRound,'all').some(e=>e.kind==='situation'),true);
 await action(1,'finish');await action(2,'start');
 await rules.mutateRule(master,{gameId:a.game,ruleId,operation:'update',expectedRevision:0,runtimeEffects:[{kpiId:a.cash,amount:'-3000'},{kpiId:lead,amount:'-2'}],reason:'Acuerdo con proveedor'});
 let currentRecords=await history(a.game);assert.equal(currentRecords.events.find(e=>e.kind==='rule').effects.find(e=>e.name==='Fondos').variation,'-5.000 ARS');
 const edited=currentRecords.events.find(e=>e.kind==='rule_change');assert.equal(edited.reason,'Acuerdo con proveedor');assert.equal(edited.effects.find(e=>e.name==='Fondos').before,'Disminuir 5.000 ARS');assert.equal(edited.effects.find(e=>e.name==='Fondos').after,'Disminuir 3.000 ARS');assert.equal(edited.periodId,null);assert.equal(edited.effects.length,2);assert.equal(currentRecords.events.filter(e=>e.kind==='rule_change').length,1);assert.equal(currentRecords.events.find(e=>e.kind==='rule').effects.length,2);
 await action(2,'finish');currentRecords=await history(a.game);assert.deepEqual(Array.from(currentRecords.events.filter(e=>e.kind==='rule'),e=>e.effects.find(e=>e.name==='Fondos').variation),['-5.000 ARS','-3.000 ARS']);assert(currentRecords.events.some(e=>e.id.startsWith('evaluation:')));
 await lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()});const completed=await history(a.game);assert(completed.events.some(e=>e.title==='Partida finalizada'));
 for(const actor of [co,observer])assert.equal(JSON.stringify(await history(a.game,actor)),JSON.stringify(completed));
 const foreign=await history(separate.game,co);assert.equal(foreign.events.length,0);
 // Records does not process an expired timer; the existing round flow does.
 const timer=await fixture(1);await startGame(timer.game);await roundAction(timer.game,'start');await sql`select pg_sleep(1.1)`;
 const timerBefore=await history(timer.game,observer);assert.equal(timerBefore.events.some(e=>e.title.startsWith('Cierre')),false);assert.equal((await sql`select status from rounds where game_id=${timer.game}`)[0].status,'active');
 await rounds.readRounds(timer.game,observer);const timerHistory=await history(timer.game,observer),timerClose=timerHistory.events.find(e=>e.title.startsWith('Cierre'));assert.equal(timerClose.automatic,true);assert.equal(timerClose.actor,null);assert.match(timerClose.description,/timer/);
 // Reset retains starts and discarded rule edits, but deletes operational records.
 const reset=await fixture();const resetRule=randomUUID();await rules.mutateRule(master,{gameId:reset.game,ruleId:resetRule,operation:'create',definition:{name:'Regla a descartar',description:'',triggerType:'round_end',enabled:true,position:0,visibility:'display',displayMessage:'',effects:[{kpiId:reset.cash,amount:'-5000'}]}});await startGame(reset.game);await roundAction(reset.game,'start');
 await rules.mutateRule(master,{gameId:reset.game,ruleId:resetRule,operation:'update',expectedRevision:0,runtimeEffects:[{kpiId:reset.cash,amount:'-3000'}],reason:'Prueba descartada'});
 const resetOperation=randomUUID();await lifecycle.resetGame(master,{gameId:reset.game,operationId:resetOperation});const discarded=await history(reset.game);
 assert.equal(discarded.periods.length,0);assert.equal(discarded.hasResets,true);assert.equal(discarded.events.filter(e=>e.discardedByResetId===resetOperation).length,2);assert.equal(discarded.events.some(e=>['round','rule','situation','manual'].includes(e.kind)),false);
 assert.equal(filterRecords(discarded,'all','current').some(e=>e.kind==='rule_change'),false);assert.equal(filterRecords(discarded,'all','discarded').length,2);
 await startGame(reset.game);const restarted=await history(reset.game);assert.equal(restarted.events.filter(e=>e.id.startsWith('start:')&&!e.discardedByResetId).length,1);assert.equal(restarted.events.find(e=>e.kind==='rule_change').periodId,null);
 assert.equal(formatRecordNumber('999999999999999999999999.12'),'999.999.999.999.999.999.999.999,12');assert.equal(recordDifference('999999999999999999999998.12','999999999999999999999999.13'),'+1,01');
 // Equal timestamps and reversed input order cannot make the order unstable.
 const tied={...source,changes:source.changes.map(c=>({...c,createdAt:'2026-01-01T00:00:00Z'})),situations:source.situations.map(c=>({...c,publishedAt:'2026-01-01T00:00:00Z'}))};assert.equal(JSON.stringify(composeRecords(tied)),JSON.stringify(composeRecords({...tied,changes:[...tied.changes].reverse(),situations:[...tied.situations].reverse()})));
 const reversed={...source,changes:[...source.changes].reverse(),situations:[...source.situations].reverse(),roundChanges:[...source.roundChanges].reverse()};assert.equal(JSON.stringify(composeRecords(reversed)),JSON.stringify(records));
 console.log('PASS Records: empty; periods; numeric/ordinal; grouped informative/multiple effects; rule history/edit; manual/timer; read-only; Reset/restart; completion/evaluation; membership/isolation; exact decimals; deterministic ordering; bounded queries.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
