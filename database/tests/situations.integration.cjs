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
let legacyCode = true;
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source = legacyCode ? require('node:child_process').execFileSync('git',['show','aa3ae6e1ae34957beb36f1a0f949a500e4e11590:'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,encoding:'utf8'}) : fs.readFileSync(file,'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
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
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))<23).sort()) await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'goals@test.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by) VALUES(${company},'Goals',${master})`;
 const module=name=>load(base+'/src/features/'+name+'.ts');
 let goals,games,lifecycle,start,prep,manage,periods,rounds;
 function reload(){goals=module('goals/repositories/goal.repository');games=module('games/repositories/game.repository');lifecycle=module('games/repositories/game-lifecycle.repository');start=module('games/repositories/start-game.repository');prep=module('preparation/repositories/preparation.repository');manage=module('preparation/repositories/kpi-management.repository');periods=module('rounds/repositories/period-configuration.repository');rounds=module('rounds/repositories/round.repository');}
 reload();
 const generic={title:'Meta repetible',description:null,goalType:'generic',kpiDefinitionId:null,operator:null,numericTarget:null,ordinalTargetKey:null};
 async function fixture() {
  const campaign=randomUUID();await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${campaign},${company},'Campaign',${master})`;
  for(const [id,role]of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${campaign},${id},${role})`;
  const game=(await games.createGame({campaignId:campaign,profileId:master,name:'Game',type:'custom'})).game.id;
  for(const definition of [{key:'cash',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},{key:'inventory',name:'Inventario',unit:'nivel',precision:0,required:true,allowsNegative:false,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'medium',label:'Medio',position:1}]}]) {
   const d=await prep.readPreparation(game,master);await manage.mutateKpi(master,{gameId:game,operationId:randomUUID(),operation:'create_kpi',definition,expectedRevision:d.revision,catalogToken:d.catalogToken});
  }
  const d=await prep.readPreparation(game,master);const cash=d.definitions.find(k=>k.valueType==='numeric').id,inventory=d.definitions.find(k=>k.valueType==='ordinal').id;
  await prep.writePreparation(master,{gameId:game,operationId:randomUUID(),operation:'save_values',expectedRevision:d.revision,catalogToken:d.catalogToken,sourceId:null,values:{[cash]:'28135',[inventory]:'medium'}});
  await periods.savePeriodConfiguration(master,{gameId:game,operationId:randomUUID(),expectedRevision:0,count:1,label:'Semana',durationSeconds:600});
  return {game,campaign,cash,inventory};
 }
 async function startGame(game) { const d=await prep.readPreparation(game,master);return start.startGame(master,{gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:1}); }
 const read=game=>goals.readGoals(game,master);
 const create=(game,definition=generic,actor=master,operationId=randomUUID())=>goals.mutateGoal(actor,{gameId:game,operation:'create',operationId,definition});
 async function change(game,id,operation,extra={},actor=master) {const goal=(await read(game)).goals.find(g=>g.id===id);return goals.mutateGoal(actor,{gameId:game,goalId:id,operation,operationId:randomUUID(),expectedRevision:goal.revision,...extra});}
 async function roundAction(game,operation){const r=(await rounds.readRounds(game,master)).rounds[0];await rounds.mutateRound(master,{gameId:game,roundId:r.id,operation,operationId:randomUUID(),expectedRevision:r.revision});return r.id;}
 async function direct(game,action,actor=master) {return sql.begin(async tx=>{await tx`SELECT set_config('nexus.goal_actor',${actor},true),set_config('nexus.goal_operation_id',${randomUUID()},true),set_config('nexus.goal_request_hash','test',true)`;return action(tx);});}


 // Upgrade seeded 0022 data, including an operational audit, without changing history.
 const legacy=await fixture();await startGame(legacy.game);const legacyRound=await roundAction(legacy.game,'start');
 await sql.begin(async tx=>{
  const [current]=await tx`select * from game_state_sets where game_id=${legacy.game} and phase='current' for update`;
  await tx`update game_state_values set value=30000 where state_set_id=${current.id} and kpi_definition_id=${legacy.cash}`;
  await tx`update game_state_sets set revision=revision+1,updated_by=${master} where id=${current.id}`;
  await tx`insert into game_kpi_changes(operation_id,game_id,campaign_id,state_set_id,round_id,kpi_definition_id,actor_id,revision,request_hash,before,after)
  values(${randomUUID()},${legacy.game},${legacy.campaign},${current.id},${legacyRound},${legacy.cash},${master},${current.revision+1},'legacy','{"value":"28135"}','{"value":"30000"}')`;
 });
 const preserved={};for(const table of ['game_state_sets','game_state_values','game_preparation_changes','game_kpi_changes','game_goals','game_results'])preserved[table]=await sql.unsafe('select to_jsonb(t) row from '+table+' t order by 1');
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.startsWith('0023')&&f.endsWith('.sql')))await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 for(const table of Object.keys(preserved))assert.deepEqual(await sql.unsafe("select to_jsonb(t)"+(table==='game_kpi_changes'?" - ARRAY['source','situation_id','effect_type','amount']":"")+" row from "+table+" t order by 1"),preserved[table]);
 assert.equal((await sql`select count(*)::int n from game_situations`)[0].n,0);
 console.log('PASS: real 0022 -> 0023 upgrade preserves snapshots, values, operational/preparation audits, goals and results.');
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))>23).sort())await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 legacyCode=false;cache.clear();reload();
 const situations=module('situations/repositories/situation.repository'),operational=module('kpis/repositories/game-kpi.repository');
 const state=async game=>(await sql`select * from game_state_sets where game_id=${game} and phase='current'`)[0];
 const value=async(game,kpi)=>(await sql`select v.value from game_state_values v join game_state_sets s on s.id=v.state_set_id where s.game_id=${game} and s.phase='current' and v.kpi_definition_id=${kpi}`)[0]?.value;
 const readSituations=(game,actor=master)=>situations.readSituations(game,actor);
 async function input(game,effects=[]){return {gameId:game,operationId:randomUUID(),expectedRevision:(await state(game))?.revision??0,title:'Nuevo socio',description:'Una inversion.',visibility:'display',effects};}
 async function publish(game,effects=[],actor=master){return situations.publishSituation(actor,await input(game,effects));}
 const a=await fixture();
 await assert.rejects(publish(a.game),/activa/);
 await sql`update games set status='ready' where id=${a.game}`;
 await assert.rejects(publish(a.game),/activa/);
 await startGame(a.game);
 await assert.rejects(publish(a.game),/vigente/);
 await roundAction(a.game,'start');
 const initial=await sql`select v.* from game_state_values v join game_state_sets s on s.id=v.state_set_id where s.game_id=${a.game} and s.phase='initial' order by v.id`;
 const rev=(await state(a.game)).revision;
 await publish(a.game);assert.equal((await state(a.game)).revision,rev);assert.equal((await readSituations(a.game)).situations[0].effects.length,0);
 for(const actor of [co,observer]){await assert.rejects(publish(a.game,[],actor),/Master|permiso/);assert.equal((await readSituations(a.game,actor)).situations.length,1);}
 const request=await input(a.game,[{kpiId:a.cash,amount:'100000'}]);
 const replay=await Promise.all([situations.publishSituation(master,request),situations.publishSituation(master,request)]);
 assert.equal(replay[0].id,replay[1].id);assert.equal(await value(a.game,a.cash),'128135');
 await assert.rejects(situations.publishSituation(master,{...request,title:'Different'}),/otros datos/);
 await publish(a.game,[{kpiId:a.cash,amount:'-15000'}]);assert.equal(await value(a.game,a.cash),'113135');
 const before=JSON.stringify(await sql`select * from game_kpi_changes where game_id=${a.game} order by id`);
 const n=(await readSituations(a.game)).situations.length;
 const other=await fixture();
 for(const effects of [[{kpiId:a.cash,amount:'-999999'}],[{kpiId:a.inventory,amount:'1'}],[{kpiId:other.cash,amount:'1'}],[{kpiId:a.cash,amount:'1'},{kpiId:a.cash,amount:'2'}],[{kpiId:a.cash,amount:'0.001'}],[{kpiId:a.cash,amount:'10'},{kpiId:a.inventory,amount:'1'}]])await assert.rejects(publish(a.game,effects));
 assert.equal((await readSituations(a.game)).situations.length,n);assert.equal(await value(a.game,a.cash),'113135');assert.equal(JSON.stringify(await sql`select * from game_kpi_changes where game_id=${a.game} order by id`),before);
 assert.deepEqual(await sql`select v.* from game_state_values v join game_state_sets s on s.id=v.state_set_id where s.game_id=${a.game} and s.phase='initial' order by v.id`,initial);
 // Database guards: published history is immutable, even for the owner connection.
 await assert.rejects(sql`update game_situations set title='Tampered' where game_id=${a.game}`);
 await assert.rejects(sql`delete from game_situations where game_id=${a.game}`);
 await assert.rejects(sql`delete from game_kpi_changes where game_id=${a.game}`);
 const controls=await operational.readGameKpiControls(a.game,master),concurrentRequest=await input(a.game,[{kpiId:a.cash,amount:'10'}]);
 const results=await Promise.allSettled([situations.publishSituation(master,concurrentRequest),operational.updateGameKpi(master,{gameId:a.game,operationId:randomUUID(),kpiDefinitionId:a.cash,roundId:controls.activeRoundId,expectedRevision:controls.revision,expectedRoundRevision:controls.activeRoundRevision,rawValue:'120000'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 await roundAction(a.game,'pause');await sql`update games set status='paused' where id=${a.game}`;
 await publish(a.game,[{kpiId:a.cash,amount:'1'}]);await sql`update games set status='active' where id=${a.game}`;
 const saved=await value(a.game,a.cash);await roundAction(a.game,'finish');await assert.rejects(publish(a.game),/activa/);
 await lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()});await assert.rejects(publish(a.game),/activa/);
 assert.equal((await sql`select v.value from game_state_values v join game_state_sets s on s.id=v.state_set_id where s.game_id=${a.game} and s.phase='final' and v.kpi_definition_id=${a.cash}`)[0].value,saved);
 const successor=await lifecycle.restartCompletedGame(master,{gameId:a.game,operationId:randomUUID()});assert.equal((await readSituations(successor.gameId)).situations.length,0);
 // Two valid numeric effects share one current revision. Missing/foreign/ordinal targets reject.
 const b=await fixture();let d=await prep.readPreparation(b.game,master);
 await manage.mutateKpi(master,{gameId:b.game,operationId:randomUUID(),operation:'create_kpi',definition:{key:'cost',name:'Costos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},expectedRevision:d.revision,catalogToken:d.catalogToken});
 d=await prep.readPreparation(b.game,master);const cost=d.definitions.find(k=>k.key==='cost').id;
 await prep.writePreparation(master,{gameId:b.game,operationId:randomUUID(),operation:'save_values',expectedRevision:d.revision,catalogToken:d.catalogToken,sourceId:null,values:{[b.cash]:'28135',[b.inventory]:'medium',[cost]:'50000'}});

 const unused=randomUUID();await sql`insert into kpi_definitions(id,campaign_id,key,name,unit,precision,created_by) values(${unused},${b.campaign},'unused','No seleccionado','ARS',2,${master})`;
 d=await prep.readPreparation(b.game,master);await manage.mutateKpi(master,{gameId:b.game,operationId:randomUUID(),operation:'create_kpi',definition:{key:'empty',name:'Sin valor',unit:'ARS',precision:2,required:false,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},expectedRevision:d.revision,catalogToken:d.catalogToken});
 const empty=(await prep.readPreparation(b.game,master)).definitions.find(k=>k.key==='empty').id;
 await startGame(b.game);await roundAction(b.game,'start');
 await assert.rejects(publish(b.game,[{kpiId:unused,amount:'1'}]));await assert.rejects(publish(b.game,[{kpiId:empty,amount:'1'}]));
 // Direct SQL must enforce actor, same-game round, complete effect count and auditing.
 async function directSituation(overrides={}){return sql.begin(async tx=>{
  const c=await state(b.game),r=(await rounds.readRounds(b.game,master)).rounds[0];
  return tx`insert into game_situations(game_id,campaign_id,round_id,state_set_id,title,description,actor_id,operation_id,request_hash,previous_revision,revision,effect_count)
   values(${b.game},${b.campaign},${overrides.round??r.id},${c.id},'Direct','',${overrides.actor??master},${randomUUID()},'direct',${c.revision},${c.revision+(overrides.effects?1:0)},${overrides.effects??0})`;
 });}
 await assert.rejects(directSituation({actor:co}));await assert.rejects(directSituation({actor:observer}));await assert.rejects(directSituation({round:legacyRound}));await assert.rejects(directSituation({effects:1}));
 await assert.rejects(sql`update game_state_values set value=value+1 where state_set_id=(select id from game_state_sets where game_id=${b.game} and phase='current') and kpi_definition_id=${b.cash}`);

 await assert.rejects(sql.begin(async tx=>{
  const c=await state(b.game),r=(await rounds.readRounds(b.game,master)).rounds[0],sid=randomUUID();
  await tx`insert into game_situations(id,game_id,campaign_id,round_id,state_set_id,title,description,actor_id,operation_id,request_hash,previous_revision,revision,effect_count) values(${sid},${b.game},${b.campaign},${r.id},${c.id},'Forged','',${master},${randomUUID()},'forged',${c.revision},${c.revision+1},1)`;
  await tx`update game_state_sets set revision=revision+1,updated_by=${master} where id=${c.id}`;
  await tx`insert into game_kpi_changes(operation_id,game_id,campaign_id,state_set_id,round_id,kpi_definition_id,actor_id,revision,request_hash,before,after,source,situation_id,effect_type,amount) values(${randomUUID()},${b.game},${b.campaign},${c.id},${r.id},${b.cash},${master},${c.revision+1},'forged','{"value":"28134"}','{"value":"28135"}','situation',${sid},'numeric_add',1)`;
 }),/value write/);
 const add=module('effects/domain/numeric-add').numericAdd;assert.equal(add('9007199254740993.25','0.10',{name:'Exact',precision:2,allowsNegative:false,valueType:'numeric'}).after,'9007199254740993.35');
 const oldRevision=(await state(b.game)).revision;
 const multi=await publish(b.game,[{kpiId:cost,amount:'10000'},{kpiId:b.cash,amount:'-10000'}]);
 assert.equal((await state(b.game)).revision,oldRevision+1);assert.equal(await value(b.game,cost),'60000');assert.equal(await value(b.game,b.cash),'18135');
 const effectRows=await sql`select * from game_kpi_changes where situation_id=${multi.id}`;assert.equal(effectRows.length,2);assert(effectRows.every(e=>e.source==='situation'&&e.revision===oldRevision+1));
 // Force an error after writes start; transaction must roll back publication, values and audit.
 await sql.unsafe("CREATE FUNCTION fail_situation_effect() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source='situation' AND NEW.amount=777 THEN RAISE EXCEPTION 'injected effect failure'; END IF; RETURN NEW; END; $$; CREATE TRIGGER zz_fail_situation_effect BEFORE INSERT ON game_kpi_changes FOR EACH ROW EXECUTE FUNCTION fail_situation_effect();");
 const snapshot=JSON.stringify({data:await readSituations(b.game),state:await state(b.game),cash:await value(b.game,b.cash),cost:await value(b.game,cost)});
 await assert.rejects(publish(b.game,[{kpiId:b.cash,amount:'2'},{kpiId:cost,amount:'777'}]));
 assert.equal(JSON.stringify({data:await readSituations(b.game),state:await state(b.game),cash:await value(b.game,b.cash),cost:await value(b.game,cost)}),snapshot);
 await sql.unsafe('DROP TRIGGER zz_fail_situation_effect ON game_kpi_changes; DROP FUNCTION fail_situation_effect();');
 await lifecycle.resetGame(master,{gameId:b.game,operationId:randomUUID()});assert.equal((await readSituations(b.game)).situations.length,0);
 assert.equal((await sql`select count(*)::int n from game_kpi_changes where game_id=${b.game}`)[0].n,0);
 await startGame(b.game);assert.equal(await value(b.game,b.cash),'28135');assert.equal((await readSituations(b.game)).situations.length,0);
 await roundAction(b.game,'start');await publish(b.game);await lifecycle.deleteGame(master,{gameId:b.game,operationId:randomUUID()});assert.equal((await sql`select count(*)::int n from game_situations where game_id=${b.game}`)[0].n,0);
 const grants=await sql`select relrowsecurity from pg_class where oid='public.game_situations'::regclass`;assert(grants[0].relrowsecurity);
 for(const role of ['anon','authenticated']){const [p]=await sql`select has_table_privilege(${role},'public.game_situations','SELECT,INSERT,UPDATE,DELETE') allowed`;assert.equal(p.allowed,false);}
 console.log('PASS: informative/multiple effects; exact numeric math; roles; states; idempotence; stale revision/concurrency; atomic rollback; immutable initial/history; final once; reset/delete; successor; RLS.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
