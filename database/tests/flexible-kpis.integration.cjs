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
const db = drizzle(sql);
const cache = new Map();
let legacy = true;
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule((legacy ? require('node:child_process').execFileSync('git',['show','d730e1f053ef29e182ddfc862580ff165b82c650:'+path.relative(root,file).split(path.sep).join('/')],{cwd:root,encoding:'utf8'}) : fs.readFileSync(file,"utf8")), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, Date, console, require: (name) => {
    if (name === "server-only") return {};
    if (name === "@/db") return { db };
    if (name === "@/db/schema") return load(base + "/src/db/schema/index.ts");
    if (name.startsWith("@/")) return load(base+"/src/"+name.slice(2)+".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
    return localRequire(name);
  } }, { filename: file });
  return exports;
}

async function main() {
 await sql.unsafe('CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 async function migrate(file){await sql.begin(async tx=>{for(const q of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(q.trim())await tx.unsafe(q);});}
 for(const f of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))<22).sort())await migrate(f);
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID(),campaign=randomUUID();for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'flexible@test.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by)VALUES(${company},'Company',${master})`;await sql`INSERT INTO campaigns(id,company_id,name,created_by)VALUES(${campaign},${company},'Campaign',${master})`;
 for(const [id,role]of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role)VALUES(${campaign},${id},${role})`;
 let games,prep,manage,start,lifecycle,rounds,periods,goals,operational,configure;
 function modules(){const m=name=>load(base+'/src/features/'+name+'.ts');games=m('games/repositories/game.repository');prep=m('preparation/repositories/preparation.repository');manage=m('preparation/repositories/kpi-management.repository');start=m('games/repositories/start-game.repository');lifecycle=m('games/repositories/game-lifecycle.repository');rounds=m('rounds/repositories/round.repository');periods=m('rounds/repositories/period-configuration.repository');goals=m('goals/repositories/goal.repository');operational=m('kpis/repositories/game-kpi.repository');if(!legacy)configure=m('preparation/repositories/configure-source-kpi.repository');}
 modules();
 const create=(actor=master)=>games.createGame({campaignId:campaign,profileId:actor,name:'Game',type:'custom'});
 const read=game=>prep.readPreparation(game,master);
 async function request(game){const d=await read(game);return {gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:(await periods.readPeriodConfiguration(game,master)).revision};}
 async function mutate(game,extra,actor=master){return manage.mutateKpi(actor,{...await request(game),...extra});}
 async function save(game,values){const d=await read(game);return prep.writePreparation(master,{...await request(game),operation:'save_values',sourceId:null,values:{...Object.fromEntries(d.definitions.map(k=>[k.id,d.values.find(v=>v.kpiId===k.id)?.value??''])),...values}});}
 async function config(game,kpiId,included,origin='inherited',value='',actor=master){return configure.configureSourceKpi(actor,{...await request(game),kpiId,included,origin,value});}
 async function auditedAttempt(game,change){return sql.begin(async tx=>{
  const [p]=await tx`SELECT * FROM game_state_sets WHERE game_id=${game} AND phase='preparation' FOR UPDATE`;
  await tx`UPDATE game_state_sets SET revision=revision+1,updated_by=${master} WHERE id=${p.id}`;
  await tx`INSERT INTO game_preparation_changes(operation_id,campaign_id,state_set_id,actor_id,operation,request_hash,previous_revision,revision,details) VALUES(${randomUUID()},${p.campaign_id},${p.id},${master},'save_values','direct-invariant-test',${p.revision},${p.revision+1},'{}')`;
  await change(tx);
 });}
 async function roundAction(game,operation){const r=(await rounds.readRounds(game,master)).rounds[0];await rounds.mutateRound(master,{gameId:game,roundId:r.id,operation,operationId:randomUUID(),expectedRevision:r.revision});return r.id;}
 async function finish(game){await roundAction(game,'start');await roundAction(game,'finish');await lifecycle.finishGame(master,{gameId:game,operationId:randomUUID()});}
 const rows=(game,phase)=>sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=(SELECT id FROM game_state_sets WHERE game_id=${game} AND phase=${phase}) ORDER BY kpi_definition_id`;
 const first=(await create()).game.id;
 const definitions=[{key:'cash',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},{key:'inventory',name:'Inventario',unit:'nivel',precision:0,required:true,allowsNegative:false,valueType:'ordinal',ordinalOptions:[{key:'high',label:'Alto',position:0},{key:'medium',label:'Medio',position:1}]},{key:'lead_time',name:'Lead Time',unit:'dias',precision:1,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]}];
 for(const definition of definitions)await mutate(first,{operation:'create_kpi',definition});const d=await read(first),a=d.definitions.find(k=>k.key==='cash').id,b=d.definitions.find(k=>k.key==='inventory').id,c=d.definitions.find(k=>k.key==='lead_time').id;
 await save(first,{[a]:'28100',[b]:'high',[c]:'21'});await periods.savePeriodConfiguration(master,{gameId:first,operationId:randomUUID(),expectedRevision:0,count:1,label:'Semana',durationSeconds:600});await start.startGame(master,await request(first));
 const firstRound=await roundAction(first,'start'),firstControls=await operational.readGameKpiControls(first,master);await operational.updateGameKpi(master,{gameId:first,operationId:randomUUID(),kpiDefinitionId:a,roundId:firstRound,expectedRevision:firstControls.revision,expectedRoundRevision:firstControls.activeRoundRevision,rawValue:'28135'});await roundAction(first,'finish');await lifecycle.finishGame(master,{gameId:first,operationId:randomUUID()});
 const second=(await create()).game.id;const oldStates=await sql`SELECT * FROM game_state_sets ORDER BY id`,oldValues=await sql`SELECT * FROM game_state_values ORDER BY id`,oldAudit=await sql`SELECT * FROM game_preparation_changes ORDER BY id`,oldOperationalAudit=await sql`SELECT * FROM game_kpi_changes ORDER BY id`;
 assert(oldOperationalAudit.length>0);
 await migrate('0022_flexible_kpi_preparation.sql');legacy=false;cache.clear();modules();
 assert.deepEqual(await sql`SELECT * FROM game_state_sets ORDER BY id`,oldStates);assert.deepEqual(await sql`SELECT * FROM game_state_values ORDER BY id`,oldValues);assert.deepEqual(await sql`SELECT * FROM game_preparation_changes ORDER BY id`,oldAudit);
 assert.deepEqual(await sql`SELECT * FROM game_kpi_changes ORDER BY id`,oldOperationalAudit);
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))>22).sort())await migrate(file);
 assert((await read(first)).definitions.every(k=>k.origin==='new'));assert((await read(second)).definitions.every(k=>k.origin==='inherited'));assert.equal((await read(second)).predecessor.length,3);
 const finalBefore=await rows(first,'final');assert.deepEqual(await rows(second,'preparation'),finalBefore);
 await assert.rejects(config(second,a,false,'inherited','',observer));
 await config(second,b,false);assert(!(await read(second)).definitions.some(k=>k.id===b));assert(!(await rows(second,'preparation')).some(k=>k.kpi_definition_id===b));
 await config(second,c,true,'redefined','40',co);assert.equal((await read(second)).definitions.find(k=>k.id===c).origin,'redefined');assert((await rows(second,'preparation')).some(v=>v.value==='40'));
 await config(second,c,true);assert((await rows(second,'preparation')).some(v=>v.value==='21'));await config(second,c,false);await config(second,c,true);assert.equal((await read(second)).definitions.find(k=>k.id===c).origin,'inherited');
 await config(second,b,true);assert((await rows(second,'preparation')).some(v=>v.ordinal_key==='high'));await config(second,b,true,'redefined','medium');assert((await rows(second,'preparation')).some(v=>v.ordinal_key==='medium'));
 await assert.rejects(config(second,b,true,'redefined','999'));await assert.rejects(config(second,c,true,'redefined','1.234'));await assert.rejects(config(second,c,true,'redefined','-2'));
 const localDef={...definitions[0],key:'rotation',name:'Rotacion',unit:'veces',precision:0};await mutate(second,{operation:'create_kpi',definition:localDef});let local=(await read(second)).definitions.find(k=>k.key==='rotation').id;assert.equal((await read(second)).definitions.find(k=>k.id===local).origin,'new');await save(second,{[local]:'5'});
 await mutate(second,{operation:'remove_kpi',kpiId:local,confirmed:true});await mutate(second,{operation:'add_kpi',kpiId:local,required:true});await save(second,{[local]:'5'});
 const goal=(await goals.mutateGoal(master,{gameId:second,operationId:randomUUID(),operation:'create',definition:{title:'Inventory',description:null,goalType:'kpi',kpiDefinitionId:b,operator:'=',numericTarget:null,ordinalTargetKey:'medium'}})).id;
 await assert.rejects(config(second,b,false),/meta/);let goalRow=(await goals.readGoals(second,master)).goals.find(g=>g.id===goal);await goals.mutateGoal(master,{gameId:second,operationId:randomUUID(),operation:'delete',goalId:goal,expectedRevision:goalRow.revision});
 await config(second,c,false);await assert.rejects(goals.mutateGoal(master,{gameId:second,operationId:randomUUID(),operation:'create',definition:{title:'Excluded',description:null,goalType:'kpi',kpiDefinitionId:c,operator:'=',numericTarget:'21',ordinalTargetKey:null}}));
 await assert.rejects(sql`UPDATE game_state_values SET value=1 WHERE game_id=${second} AND kpi_definition_id=${a}`);
 await assert.rejects(sql`UPDATE game_kpis SET origin='inherited' WHERE game_id=${second} AND kpi_definition_id=${local}`);
 await assert.rejects(sql`UPDATE game_state_sets SET source_state_set_id=NULL WHERE game_id=${second} AND phase='preparation'`);
 await assert.rejects(auditedAttempt(second,tx=>tx`UPDATE game_state_values SET value=1 WHERE game_id=${second} AND kpi_definition_id=${a}`),/Inherited value/);
 await assert.rejects(auditedAttempt(second,tx=>tx`UPDATE game_kpis SET origin='inherited' WHERE game_id=${second} AND kpi_definition_id=${local}`),/origin/);
 await assert.rejects(auditedAttempt(second,tx=>tx`UPDATE game_state_values SET value=1,ordinal_key=NULL WHERE game_id=${second} AND kpi_definition_id=${b}`),/ordinal/);
 const changes=await sql`SELECT c.* FROM game_preparation_changes c JOIN game_state_sets p ON p.id=c.state_set_id WHERE p.game_id=${second}`;
 const configurationChanges=changes.filter(c=>c.details.action==='configure_source_kpi');
 assert(configurationChanges.some(c=>c.details.after.included===false));
 assert(configurationChanges.some(c=>c.details.before.association===null&&c.details.after.included));
 assert(configurationChanges.some(c=>c.details.before.association?.origin==='inherited'&&c.details.after.origin==='redefined'));
 assert(configurationChanges.some(c=>c.details.before.association?.origin==='redefined'&&c.details.after.origin==='inherited'));
 assert(changes.some(c=>c.operation==='create_kpi'));assert(changes.some(c=>c.operation==='remove_kpi'));
 const configured=await rows(second,'preparation');const associations=await sql`SELECT kpi_definition_id,origin,required FROM game_kpis WHERE game_id=${second} ORDER BY kpi_definition_id`;
 await start.startGame(master,await request(second));assert.deepEqual(await rows(second,'initial'),configured);assert.deepEqual(await rows(second,'current'),configured);assert.equal(configured.length,3);
 await assert.rejects(config(second,a,false));await assert.rejects(sql`UPDATE game_kpis SET origin='redefined' WHERE game_id=${second} AND kpi_definition_id=${a}`);
 const roundId=await roundAction(second,'start');const controls=await operational.readGameKpiControls(second,master);await operational.updateGameKpi(master,{gameId:second,operationId:randomUUID(),kpiDefinitionId:a,roundId,expectedRevision:controls.revision,expectedRoundRevision:controls.activeRoundRevision,rawValue:'123'});
 await lifecycle.resetGame(master,{gameId:second,operationId:randomUUID()});assert.deepEqual(await rows(second,'preparation'),configured);assert.deepEqual(await sql`SELECT kpi_definition_id,origin,required FROM game_kpis WHERE game_id=${second} ORDER BY kpi_definition_id`,associations);assert.equal((await rows(second,'initial')).length,0);assert.equal((await rows(second,'current')).length,0);assert.equal((await read(second)).canEdit,true);
 await start.startGame(master,await request(second));assert.deepEqual(await rows(second,'current'),configured);await finish(second);
 const input={gameId:second,operationId:randomUUID()};const third=(await lifecycle.restartCompletedGame(master,input)).gameId;assert.equal((await lifecycle.restartCompletedGame(master,input)).gameId,third);assert((await read(third)).definitions.every(k=>k.origin==='inherited'));assert.equal((await read(third)).definitions.length,3);assert(!(await read(third)).definitions.some(k=>k.id===c));assert.deepEqual(await rows(first,'final'),finalBefore);
 const configInput={...await request(third),kpiId:a,included:true,origin:'redefined',value:'9'};const concurrent=await Promise.allSettled([configure.configureSourceKpi(master,configInput),configure.configureSourceKpi(co,{...configInput,operationId:randomUUID(),value:'10'})]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);
 const winner=concurrent[0].status==='fulfilled';if(winner)assert.equal((await configure.configureSourceKpi(master,configInput)).replayed,true);
 await lifecycle.deleteGame(master,{gameId:third,operationId:randomUUID()});
 const gameCount=(await sql`SELECT count(*)::int n FROM games`)[0].n;await sql.unsafe("CREATE FUNCTION fail_flexible_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_state_set_id IS NOT NULL THEN RAISE EXCEPTION 'copy failed'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_flexible_copy BEFORE INSERT ON game_state_sets FOR EACH ROW EXECUTE FUNCTION fail_flexible_copy();");await assert.rejects(create());assert.equal((await sql`SELECT count(*)::int n FROM games`)[0].n,gameCount);await sql.unsafe('DROP TRIGGER fail_flexible_copy ON game_state_sets;DROP FUNCTION fail_flexible_copy();');
 const creates=await Promise.allSettled([create(),create(co)]);assert.equal(creates.filter(r=>r.status==='fulfilled').length,1);
 console.log('PASS: real 0021 -> 0022 backfill without snapshot/value/audit changes; include/exclude/reinclude; numeric/ordinal redefine/inherit; new KPI; goals; start selected configuration; operational changes; exact reset; restart/campaign shared successor; immutable history; roles; concurrent writes/creation; rollback.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
