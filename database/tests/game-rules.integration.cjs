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
  const source=legacyCode?require('node:child_process').execFileSync('git',['show','9ef4b9d61b3f3779fbc6520ce93eed826ed3bf74:'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,encoding:'utf8'}):fs.readFileSync(file,'utf8');
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
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))<24).sort()) await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'goals@test.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by) VALUES(${company},'Goals',${master})`;
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

 // Upgrade a real 0023 game with snapshots, situations, audits, evaluated goals and results.
 const legacy=await fixture();await create(legacy.game);await startGame(legacy.game);await roundAction(legacy.game,'start');
 const legacyCurrent=(await sql`select * from game_state_sets where game_id=${legacy.game} and phase='current'`)[0];
 await module('situations/repositories/situation.repository').publishSituation(master,{gameId:legacy.game,operationId:randomUUID(),expectedRevision:legacyCurrent.revision,title:'Legacy investment',description:'',visibility:'display',effects:[{kpiId:legacy.cash,amount:'100'}]});
 await roundAction(legacy.game,'finish');for(const goal of (await read(legacy.game)).goals)await change(legacy.game,goal.id,'evaluate',{fulfilled:true});await lifecycle.finishGame(master,{gameId:legacy.game,operationId:randomUUID()});
 const preserved={};for(const table of ['games','rounds','round_changes','game_state_sets','game_state_values','game_preparation_changes','game_kpi_changes','game_situations','game_goals','game_results'])preserved[table]=await sql.unsafe('select to_jsonb(t) row from '+table+' t order by 1');
 await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/0024_game_rules.sql','utf8').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 for(const table of Object.keys(preserved))assert.deepEqual(await sql.unsafe("select to_jsonb(t)"+(table==='game_kpi_changes'?" - 'rule_execution_id'":"")+" row from "+table+" t order by 1"),preserved[table]);
 for(const table of ['game_rules','game_rule_effects','game_rule_executions'])assert.equal((await sql.unsafe('select count(*)::int n from '+table))[0].n,0);
 console.log('PASS: seeded 0023 -> 0024 upgrade preserves snapshots, ordinal/numeric values, audits, situations, goals and results.');
 legacyCode=false;cache.clear();reload();
 const rules=module('rules/repositories/rule.repository'),situations=module('situations/repositories/situation.repository'),operational=module('kpis/repositories/game-kpi.repository');
 const ruleRead=(game,actor=master)=>rules.readRules(game,actor);
 const definition=(cash,amount='-5000',position=0)=>({name:'Mantenimiento',description:'Costo',triggerType:'round_end',enabled:true,position,visibility:'display',displayMessage:'Costo aplicado',effects:[{kpiId:cash,amount}]});
 async function add(game,def,actor=master,id=randomUUID()){await rules.mutateRule(actor,{gameId:game,ruleId:id,operation:'create',definition:def});return id;}
 async function edit(game,id,def){const r=(await ruleRead(game)).rules.find(r=>r.id===id);return rules.mutateRule(master,{gameId:game,ruleId:id,operation:'update',expectedRevision:r.revision,definition:def});}
 async function remove(game,id){const r=(await ruleRead(game)).rules.find(r=>r.id===id);return rules.mutateRule(master,{gameId:game,ruleId:id,operation:'delete',expectedRevision:r.revision});}
 const current=async game=>(await sql`select * from game_state_sets where game_id=${game} and phase='current'`)[0];
 const value=async(game,kpi)=>(await sql`select v.value from game_state_values v join game_state_sets s on s.id=v.state_set_id where s.game_id=${game} and s.phase='current' and v.kpi_definition_id=${kpi}`)[0]?.value;
 const a=await fixture();
 for(const actor of [co,observer]){await assert.rejects(add(a.game,definition(a.cash),actor));assert.equal((await ruleRead(a.game,actor)).canEdit,false);}
 const id=await add(a.game,definition(a.cash));await add(a.game,definition(a.cash),master,id);
 await edit(a.game,id,definition(a.cash,'-100'));await edit(a.game,id,definition(a.cash));
 const disabled=await add(a.game,{...definition(a.cash,'-900000'),enabled:false});
 const deleted=await add(a.game,definition(a.cash,'1'));await remove(a.game,deleted);
 for(const def of [{...definition(a.inventory)},{...definition(a.cash),effects:[{kpiId:a.cash,amount:'1'},{kpiId:a.cash,amount:'2'}]},definition(a.cash,'0.001'),{...definition(a.cash),triggerType:'other'}])await assert.rejects(add(a.game,def));
 let d=await prep.readPreparation(a.game,master);await assert.rejects(manage.mutateKpi(master,{gameId:a.game,operation:'remove_kpi',kpiId:a.cash,confirmed:true,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken}),/regla/);
 await startGame(a.game);await assert.rejects(edit(a.game,id,definition(a.cash,'-1')));await assert.rejects(remove(a.game,id));await roundAction(a.game,'start');
 const beforeRevision=(await current(a.game)).revision;const r=(await rounds.readRounds(a.game,master)).rounds[0];const close={gameId:a.game,roundId:r.id,operation:'finish',operationId:randomUUID(),expectedRevision:r.revision};
 await Promise.all([rounds.mutateRound(master,close),rounds.mutateRound(master,close)]);
 assert.equal(await value(a.game,a.cash),'123135');assert.equal((await current(a.game)).revision,beforeRevision+1);assert.equal((await ruleRead(a.game)).executions.length,1);
 await rounds.readRounds(a.game,observer);await rounds.mutateRound(master,close);assert.equal(await value(a.game,a.cash),'123135');
 const audits=await sql`select * from game_kpi_changes where game_id=${a.game} and source='rule'`;assert.equal(audits.length,1);assert.equal(audits[0].before.value,'128135');assert.equal(audits[0].after.value,'123135');assert.equal(audits[0].amount,'-5000');
 assert.equal((await sql`select status from games where id=${a.game}`)[0].status,'evaluation');assert.equal((await sql`select count(*)::int n from game_situations where game_id=${a.game}`)[0].n,0);
 await lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()});assert.equal(await value(a.game,a.cash),'123135');
 await assert.rejects(sql`update game_rules set name='Changed' where id=${id}`);await assert.rejects(sql`delete from game_rule_executions where game_id=${a.game}`);
 const successor=(await games.createGame({campaignId:a.campaign,profileId:co,name:'Successor',type:'custom'})).game.id;
 assert.equal((await ruleRead(successor)).rules.length,2);assert.equal((await ruleRead(successor)).executions.length,0);assert((await ruleRead(successor)).rules.every(r=>r.id!==id&&r.id!==disabled));
 d=await prep.readPreparation(successor,master);const configure=module('preparation/repositories/configure-source-kpi.repository');await assert.rejects(configure.configureSourceKpi(master,{gameId:successor,kpiId:a.cash,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,included:false,origin:'inherited',value:''}),/regla/);
 // Multiple rules touch the same KPI, with independent audited revisions in one close.
 const b=await fixture();await add(b.game,definition(b.cash,'-5000',0));await add(b.game,definition(b.cash,'-2000',1));await add(b.game,definition(b.cash,'100',2));
 await startGame(b.game);await roundAction(b.game,'start');
 let c=await current(b.game);await situations.publishSituation(master,{gameId:b.game,operationId:randomUUID(),expectedRevision:c.revision,title:'Socio',description:'',visibility:'display',effects:[{kpiId:b.cash,amount:'100000'}]});
 const controls=await operational.readGameKpiControls(b.game,master);await operational.updateGameKpi(master,{gameId:b.game,operationId:randomUUID(),kpiDefinitionId:b.cash,roundId:controls.activeRoundId,expectedRevision:controls.revision,expectedRoundRevision:controls.activeRoundRevision,rawValue:'128135'});
 c=await current(b.game);await roundAction(b.game,'finish');assert.equal(await value(b.game,b.cash),'121235');assert.equal((await current(b.game)).revision,c.revision+3);
 const chain=await sql`select before,after,revision from game_kpi_changes where game_id=${b.game} and source='rule' order by revision`;
 assert.deepEqual(chain.map(x=>[x.before.value,x.after.value]),[['128135','123135'],['123135','121135'],['121135','121235']]);
 await lifecycle.resetGame(master,{gameId:b.game,operationId:randomUUID()});assert.equal((await ruleRead(b.game)).rules.length,3);assert.equal((await ruleRead(b.game)).executions.length,0);
 await startGame(b.game);assert.equal(await value(b.game,b.cash),'128135');await roundAction(b.game,'start');await roundAction(b.game,'finish');assert.equal(await value(b.game,b.cash),'121235');
 await lifecycle.deleteGame(master,{gameId:b.game,operationId:randomUUID()});assert.equal((await sql`select count(*)::int n from game_rules where game_id=${b.game}`)[0].n,0);
 // Every write rolls back when a later rule fails; Start does not predict future balances.
 const fail=await fixture();await add(fail.game,definition(fail.cash,'-1000',0));await add(fail.game,definition(fail.cash,'-999999',1));await startGame(fail.game);await roundAction(fail.game,'start');
 const original=await current(fail.game);await assert.rejects(roundAction(fail.game,'finish'),/regla/);assert.equal(await value(fail.game,fail.cash),'128135');assert.equal((await current(fail.game)).revision,original.revision);assert.equal((await ruleRead(fail.game)).executions.length,0);assert.equal((await sql`select status from rounds where game_id=${fail.game}`)[0].status,'active');
 // Timer attribution remains null even when polling is done by Observer.
 const timer=await fixture(1);await add(timer.game,definition(timer.cash));await startGame(timer.game);await roundAction(timer.game,'start');
 const timerRow=(await sql`select * from rounds where game_id=${timer.game}`)[0];await sql`select pg_sleep(1.1)`;
 const timerRace=await Promise.allSettled([rounds.readRounds(timer.game,observer),rounds.mutateRound(master,{gameId:timer.game,roundId:timerRow.id,operation:'finish',operationId:randomUUID(),expectedRevision:timerRow.revision})]);
 assert.equal(timerRace[0].status,'fulfilled');
 if(timerRace[1].status==='fulfilled')assert.equal(timerRace[1].value.expired,true);
 else assert.match(timerRace[1].reason.message,/activa|cambi/);
 // A new command after a committed timer close is not an idempotency replay.
 await assert.rejects(rounds.mutateRound(master,{gameId:timer.game,roundId:timerRow.id,operation:'finish',operationId:randomUUID(),expectedRevision:timerRow.revision}));
 assert.equal(await value(timer.game,timer.cash),'123135');const timerExec=(await sql`select * from game_rule_executions where game_id=${timer.game}`);assert.equal(timerExec.length,1);assert.equal(timerExec[0].reason,'timer');assert.equal(timerExec[0].actor_id,null);assert.equal((await current(timer.game)).updated_by,null);
 await lifecycle.finishGame(master,{gameId:timer.game,operationId:randomUUID()});assert.equal(await value(timer.game,timer.cash),'123135');
 // Expiry within this request commits even when the submitted revision is stale.
 const staleTimer=await fixture(1);await add(staleTimer.game,definition(staleTimer.cash));await startGame(staleTimer.game);const staleRound=await roundAction(staleTimer.game,'start');await sql`select pg_sleep(1.1)`;
 const staleRequest={gameId:staleTimer.game,roundId:staleRound,operation:'finish',operationId:randomUUID(),expectedRevision:0};
 assert.equal((await rounds.mutateRound(master,staleRequest)).expired,true);
 assert.equal(await value(staleTimer.game,staleTimer.cash),'123135');assert.equal((await sql`select status from rounds where id=${staleRound}`)[0].status,'completed');
 await assert.rejects(rounds.mutateRound(master,{...staleRequest,operationId:randomUUID()}));
 assert.equal((await ruleRead(staleTimer.game)).executions.length,1);
 // Lazy failure returns a controlled error and rolls back every preceding rule.
 const lazyFail=await fixture(1);await add(lazyFail.game,definition(lazyFail.cash,'-1000',0));await add(lazyFail.game,definition(lazyFail.cash,'-999999',1));await startGame(lazyFail.game);await roundAction(lazyFail.game,'start');await sql`select pg_sleep(1.1)`;
 const failedPoll=await rounds.readRounds(lazyFail.game,observer);assert.match(failedPoll.closeError,/regla/);assert.equal(failedPoll.rounds[0].status,'active');assert.equal(await value(lazyFail.game,lazyFail.cash),'128135');assert.equal((await ruleRead(lazyFail.game)).executions.length,0);
 // One rule can affect several KPIs, but advances CURRENT only once.
 const multi=await fixture();let multiPrep=await prep.readPreparation(multi.game,master);
 await manage.mutateKpi(master,{gameId:multi.game,operationId:randomUUID(),operation:'create_kpi',definition:{key:'lead_time',name:'Lead Time',unit:'semanas',precision:1,required:false,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},expectedRevision:multiPrep.revision,catalogToken:multiPrep.catalogToken});
 multiPrep=await prep.readPreparation(multi.game,master);const lead=multiPrep.definitions.find(k=>k.key==='lead_time').id;
 await add(multi.game,{...definition(multi.cash),effects:[{kpiId:multi.cash,amount:'-5000'},{kpiId:lead,amount:'-1.5'}]});
 await assert.rejects(startGame(multi.game),/valor/);
 await prep.writePreparation(master,{gameId:multi.game,operationId:randomUUID(),operation:'save_values',expectedRevision:multiPrep.revision,catalogToken:multiPrep.catalogToken,sourceId:null,values:{[multi.cash]:'128135',[multi.inventory]:'medium',[lead]:'20'}});
 await assert.rejects(add(multi.game,definition(a.cash)));
 await startGame(multi.game);await roundAction(multi.game,'start');const multiRevision=(await current(multi.game)).revision;await roundAction(multi.game,'finish');
 assert.equal(await value(multi.game,multi.cash),'123135');assert.equal(await value(multi.game,lead),'18.5');assert.equal((await current(multi.game)).revision,multiRevision+1);assert.equal((await ruleRead(multi.game)).executions.length,1);
 for(const table of ['game_rules','game_rule_effects','game_rule_executions'])for(const role of ['anon','authenticated'])assert.equal((await sql`select has_table_privilege(${role},${table},'SELECT,INSERT,UPDATE,DELETE') allowed`)[0].allowed,false);
 console.log('PASS: rule configuration/roles; manual/timer; shared KPI revisions; rollback; 0023/manual coexistence; reset/delete; successor; automatic authorship; RLS.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
