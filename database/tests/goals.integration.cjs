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
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
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
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort()) await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'goals@test.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by) VALUES(${company},'Goals',${master})`;
 const module=name=>load(base+'/src/features/'+name+'.ts');
 const goals=module('goals/repositories/goal.repository'),domain=module('goals/domain/goal'),games=module('games/repositories/game.repository'),lifecycle=module('games/repositories/game-lifecycle.repository'),start=module('games/repositories/start-game.repository'),prep=module('preparation/repositories/preparation.repository'),manage=module('preparation/repositories/kpi-management.repository'),periods=module('rounds/repositories/period-configuration.repository'),rounds=module('rounds/repositories/round.repository');
 const generic={title:'Meta repetible',description:null,goalType:'generic',kpiDefinitionId:null,operator:null,numericTarget:null,ordinalTargetKey:null};
 async function fixture() {
  const campaign=randomUUID();await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${campaign},${company},'Campaign',${master})`;
  for(const [id,role]of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${campaign},${id},${role})`;
  const game=(await games.createGame({campaignId:campaign,profileId:master,name:'Game',type:'custom'})).game.id;
  for(const definition of [{key:'cash',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},{key:'inventory',name:'Inventario',unit:'nivel',precision:0,required:true,allowsNegative:false,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'medium',label:'Medio',position:1}]}]) {
   const d=await prep.readPreparation(game,master);await manage.mutateKpi(master,{gameId:game,operationId:randomUUID(),operation:'create_kpi',definition,expectedRevision:d.revision,catalogToken:d.catalogToken});
  }
  const d=await prep.readPreparation(game,master);const cash=d.definitions.find(k=>k.valueType==='numeric').id,inventory=d.definitions.find(k=>k.valueType==='ordinal').id;
  await prep.writePreparation(master,{gameId:game,operationId:randomUUID(),operation:'save_values',expectedRevision:d.revision,catalogToken:d.catalogToken,sourceId:null,values:{[cash]:'9250',[inventory]:'medium'}});
  await periods.savePeriodConfiguration(master,{gameId:game,operationId:randomUUID(),expectedRevision:0,count:1,label:'Semana',durationSeconds:600});
  return {game,campaign,cash,inventory};
 }
 async function startGame(game) { const d=await prep.readPreparation(game,master);return start.startGame(master,{gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:1}); }
 const read=game=>goals.readGoals(game,master);
 const create=(game,definition=generic,actor=master,operationId=randomUUID())=>goals.mutateGoal(actor,{gameId:game,operation:'create',operationId,definition});
 async function change(game,id,operation,extra={},actor=master) {const goal=(await read(game)).goals.find(g=>g.id===id);return goals.mutateGoal(actor,{gameId:game,goalId:id,operation,operationId:randomUUID(),expectedRevision:goal.revision,...extra});}
 async function roundAction(game,operation){const r=(await rounds.readRounds(game,master)).rounds[0];await rounds.mutateRound(master,{gameId:game,roundId:r.id,operation,operationId:randomUUID(),expectedRevision:r.revision});return r.id;}
 async function direct(game,action,actor=master) {return sql.begin(async tx=>{await tx`SELECT set_config('nexus.goal_actor',${actor},true),set_config('nexus.goal_operation_id',${randomUUID()},true),set_config('nexus.goal_request_hash','test',true)`;return action(tx);});}
 const a=await fixture();
 for(const actor of [co,observer])await assert.rejects(create(a.game,generic,actor),/Master|permiso/);
 const idempotency=randomUUID();const concurrent=await Promise.all([create(a.game,generic,master,idempotency),create(a.game,generic,master,idempotency)]);assert.equal(concurrent[0].id,concurrent[1].id);assert.equal((await read(a.game)).goals.length,1);
 await assert.rejects(create(a.game,{...generic,title:'Different'},master,idempotency));
 const duplicate=(await create(a.game)).id;assert.equal((await read(a.game)).goals.length,2);
 await change(a.game,duplicate,'update',{definition:{...generic,title:'Edited'}});await change(a.game,duplicate,'delete');
 assert.equal((await read(a.game)).goals.length,1);
 const numeric={...generic,title:'Fondos >= 8000',goalType:'kpi',kpiDefinitionId:a.cash,operator:'>=',numericTarget:'8000'};
 const ordinal={...generic,title:'Inventario medio',goalType:'kpi',kpiDefinitionId:a.inventory,operator:'=',ordinalTargetKey:'medium'};
 const num=(await create(a.game,numeric)).id,ord=(await create(a.game,ordinal)).id;
 const preparation=await prep.readPreparation(a.game,master);await assert.rejects(manage.mutateKpi(master,{gameId:a.game,operationId:randomUUID(),expectedRevision:preparation.revision,catalogToken:preparation.catalogToken,operation:'remove_kpi',kpiId:a.cash,confirmed:true}),/metas/);
 await assert.rejects(create(a.game,{...numeric,kpiDefinitionId:a.inventory}));await assert.rejects(create(a.game,{...ordinal,kpiDefinitionId:a.cash}));
 const other=await fixture();await assert.rejects(create(a.game,{...numeric,kpiDefinitionId:other.cash}));
 await assert.rejects(direct(a.game,tx=>tx`UPDATE game_goals SET numeric_target=10,ordinal_target_key=NULL,revision=revision+1 WHERE id=${ord}`));
 await assert.rejects(direct(a.game,tx=>tx`UPDATE game_goals SET kpi_definition_id=${other.cash},revision=revision+1 WHERE id=${num}`));
 await assert.rejects(change(a.game,num,'evaluate',{fulfilled:true}));
 await assert.rejects(direct(a.game,tx=>tx`UPDATE game_goals SET fulfilled=true,revision=revision+1 WHERE id=${num}`));
 await startGame(a.game);await assert.rejects(create(a.game));
 for(const operation of ['update','delete'])await assert.rejects(change(a.game,num,operation,{definition:numeric}));
 await assert.rejects(direct(a.game,tx=>tx`DELETE FROM game_goals WHERE id=${num}`));
 await assert.rejects(direct(a.game,tx=>tx`UPDATE game_goals SET title='Changed',revision=revision+1 WHERE id=${num}`));
 const roundId=await roundAction(a.game,'start');const during=(await create(a.game,{...generic,title:'Durante ronda'})).id;
 assert.equal((await read(a.game)).goals.find(g=>g.id===during).createdDuringRoundId,roundId);
 await roundAction(a.game,'pause');await sql`UPDATE games SET status='paused' WHERE id=${a.game}`;const paused=(await create(a.game,{...numeric,title:'Durante pausa',operator:'<=',numericTarget:'20'})).id;assert.equal((await read(a.game)).goals.find(g=>g.id===paused).createdDuringRoundId,roundId);await sql`UPDATE games SET status='active' WHERE id=${a.game}`;
 await roundAction(a.game,'finish');assert.equal((await read(a.game)).status,'evaluation');
 await assert.rejects(create(a.game));await assert.rejects(change(a.game,num,'delete'));
 const evaluation=await read(a.game);assert.equal(evaluation.goals.find(g=>g.id===num).suggestion,true);assert.equal(evaluation.goals.find(g=>g.id===ord).suggestion,true);assert.equal(evaluation.goals.find(g=>g.id===during).suggestion,null);
 assert.equal(evaluation.goals.find(g=>g.id===paused).suggestion,false);
 assert.equal(domain.suggest({...numeric,operator:'<='},{value:'9250',ordinalKey:null}),false);
 assert.equal(domain.suggest(ordinal,{value:null,ordinalKey:'low'}),false);assert.equal(domain.suggest(generic,undefined),null);
 const precise={...numeric,operator:'>',numericTarget:'99999999999999999999999.01'};
 assert.equal(domain.suggest(precise,{value:'99999999999999999999999.02',ordinalKey:null}),true);
 await assert.rejects(lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()}),/metas/);
 await assert.rejects(change(a.game,num,'evaluate',{fulfilled:true},observer));
 await change(a.game,num,'evaluate',{fulfilled:false,observation:'Decision del Master'});
 const stored=(await read(a.game)).goals.find(g=>g.id===num);assert.equal(stored.fulfilled,false);assert.equal(stored.suggestedFulfilled,true);assert.equal(stored.evaluatedBy,master);
 for(const goal of (await read(a.game)).goals.filter(g=>g.fulfilled===null))await change(a.game,goal.id,'evaluate',{fulfilled:true});
 assert.equal((await read(a.game)).goals.find(g=>g.id===paused).suggestedFulfilled,false);
 assert.equal((await read(a.game)).result.category,'epic_victory');
 await sql.unsafe("CREATE FUNCTION fail_goal_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='completed' THEN RAISE EXCEPTION 'finish failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_goal_finish BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION fail_goal_finish();");
 await assert.rejects(lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()}));assert.equal((await sql`SELECT count(*)::int n FROM game_results WHERE game_id=${a.game}`)[0].n,0);assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${a.game} AND phase='final'`)[0].n,0);
 await sql.unsafe('DROP TRIGGER fail_goal_finish ON games;DROP FUNCTION fail_goal_finish();');
 await lifecycle.finishGame(co,{gameId:a.game,operationId:randomUUID()});
 assert.equal((await read(a.game)).result.category,'epic_victory');assert.equal((await read(a.game)).result.fulfilledCount,4);
 await assert.rejects(change(a.game,num,'evaluate',{fulfilled:true}));await assert.rejects(direct(a.game,tx=>tx`UPDATE game_goals SET fulfilled=true,revision=revision+1 WHERE id=${num}`));
 await assert.rejects(sql`UPDATE game_results SET category='epic_failure' WHERE game_id=${a.game}`);
 for(const [count,expected] of [[5,'epic_victory'],[4,'epic_victory'],[3,'partial_victory'],[2,'balanced'],[1,'partial_failure'],[0,'epic_failure']]){assert.equal(domain.classifyResult(count,5),expected);assert.equal((await sql`SELECT goal_result_category(${count},5) category`)[0].category,expected);}
 assert.equal(domain.classifyResult(0,0),null);assert.equal(domain.classifyResult(79999,100000),'partial_victory');
 const successor=(await games.createGame({campaignId:a.campaign,profileId:master,name:'Next',type:'custom'})).game.id;assert.equal((await read(successor)).goals.length,0);
 // Reset keeps definitions, removes evaluations and detaches discarded rounds; audit survives.
 const reset=await fixture();await create(reset.game);await startGame(reset.game);await roundAction(reset.game,'start');const runtime=(await create(reset.game)).id;await roundAction(reset.game,'finish');
 for(const goal of (await read(reset.game)).goals)await change(reset.game,goal.id,'evaluate',{fulfilled:true});
 await lifecycle.resetGame(master,{gameId:reset.game,operationId:randomUUID()});const afterReset=await read(reset.game);assert(afterReset.goals.every(g=>g.fulfilled===null));assert.equal(afterReset.goals.find(g=>g.id===runtime).createdDuringRoundId,null);assert.equal(afterReset.goals.find(g=>g.id===runtime).createdRoundSequence,1);
 await assert.rejects(change(reset.game,runtime,'delete'));
 const editableGoal=afterReset.goals.find(g=>g.createdRoundSequence===null);await change(reset.game,editableGoal.id,'update',{definition:{...generic,title:'Ready edit'}});await change(reset.game,editableGoal.id,'delete');
 const auditBefore=(await sql`SELECT count(*)::int n FROM game_goal_changes WHERE game_id=${reset.game}`)[0].n;await lifecycle.deleteGame(master,{gameId:reset.game,operationId:randomUUID()});assert.equal((await sql`SELECT count(*)::int n FROM game_goals WHERE game_id=${reset.game}`)[0].n,0);assert((await sql`SELECT count(*)::int n FROM game_goal_changes WHERE game_id=${reset.game}`)[0].n>auditBefore);
 await assert.rejects(sql`DELETE FROM game_goal_changes`);
 await startGame(other.game);await roundAction(other.game,'start');await roundAction(other.game,'finish');await lifecycle.finishGame(master,{gameId:other.game,operationId:randomUUID()});assert.equal((await read(other.game)).result.category,null);
 for(const role of ['anon','authenticated'])for(const table of ['game_goals','game_goal_changes','game_results'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await sql`SELECT has_table_privilege(${role},${table},${privilege}) allowed`)[0].allowed,false);
 assert.equal((await sql`SELECT count(*)::int n FROM pg_class WHERE relname IN ('game_goals','game_goal_changes','game_results') AND relrowsecurity`)[0].n,3);
 const snapshot=JSON.parse(fs.readFileSync(root+'/database/migrations/meta/0021_snapshot.json','utf8'));
 for(const table of ['game_goals','game_goal_changes','game_results']) {
  const expected=snapshot.tables['public.'+table];
  const constraints=await sql`SELECT conname FROM pg_constraint WHERE conrelid=${'public.'+table}::regclass`;
  for(const name of [...Object.keys(expected.foreignKeys),...Object.keys(expected.checkConstraints)])assert(constraints.some(c=>c.conname===name),table+': '+name);
  const columns=await sql`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${table}`;
  assert.deepEqual(columns.map(c=>c.column_name).sort(),Object.keys(expected.columns).sort());
 }
 console.log('PASS: goals CRUD; duplicate submit idempotence; intentional same titles; numeric/ordinal targets; current suggestions/override; round provenance; state guards; all five categories; immutable historical result; finish rollback; no-goal legacy finish; reset/delete audit; successor without goals; roles/RLS.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
