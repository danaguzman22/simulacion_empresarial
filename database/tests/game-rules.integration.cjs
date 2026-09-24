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
let beforeCards = true; // Historical application code until the 0026 schema is installed.
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const codeRevision=legacyCode?'9ef4b9d61b3f3779fbc6520ce93eed826ed3bf74':beforeCards?'dac0f1269fdad0a6662958bcd65df9ec27f01f76':null;
  const source=codeRevision?require('node:child_process').execFileSync('git',['show',codeRevision+':'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,encoding:'utf8'}):fs.readFileSync(file,'utf8');
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
 // Forward upgrade must preserve existing rule amounts and executions.
 const before25={};for(const table of ['game_rules','game_rule_effects','game_rule_executions','game_kpi_changes'])before25[table]=await sql.unsafe('select to_jsonb(t) row from '+table+' t order by 1');
 await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/0025_rule_effect_editing.sql','utf8').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 for(const table of Object.keys(before25))assert.deepEqual(await sql.unsafe('select to_jsonb(t) row from '+table+' t order by 1'),before25[table]);
 console.log('PASS: populated 0024 -> 0025 preserves rule amounts, executions and KPI history.');
 await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/0026_role_cards.sql','utf8').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/0027_card_responsibilities_modifiers.sql','utf8').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 await sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/0028_card_structure.sql','utf8').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 beforeCards=false;cache.clear();reload();
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

 // 0025: only amounts may change at runtime; past execution amounts stay immutable.
 const live=await fixture(600,3);const liveId=await add(live.game,definition(live.cash));await startGame(live.game);
 const runtimeEdit=async(amount,extra={},actor=master)=>{const r=(await ruleRead(live.game)).rules.find(r=>r.id===liveId);return rules.mutateRule(actor,{gameId:live.game,ruleId:liveId,operation:'update',expectedRevision:r.revision,runtimeEffects:[{kpiId:live.cash,amount}],reason:'Revisar costo',...extra});};
 async function step(sequence,operation){const r=(await rounds.readRounds(live.game,master)).rounds.find(r=>r.sequence===sequence);return rounds.mutateRound(master,{gameId:live.game,roundId:r.id,operation,operationId:randomUUID(),expectedRevision:r.revision});}
 await step(1,'start');await step(1,'finish');
 const oldHistory=JSON.stringify((await ruleRead(live.game)).executions);
 await step(2,'start');await assert.rejects(runtimeEdit('-3000',{reason:''}),/motivo/);
 for(const actor of [co,observer]){await assert.rejects(runtimeEdit('-3000',{},actor));assert.equal((await ruleRead(live.game,actor)).canEditEffects,false);}
 const staleRevision=(await ruleRead(live.game)).rules[0].revision;
 await runtimeEdit('-3000');await assert.rejects(runtimeEdit('2000',{expectedRevision:staleRevision}),/cambi/);
 await assert.rejects(runtimeEdit('-1',{runtimeEffects:[{kpiId:live.inventory,amount:'1'}]}));
 await assert.rejects(runtimeEdit('-1',{runtimeEffects:[]}));
 await assert.rejects(runtimeEdit('-1',{definition:{...definition(live.cash),name:'Forbidden'}}));
 await assert.rejects(sql`update game_rule_effects set amount=-2000 where rule_id=${liveId}`);
 await assert.rejects(sql.begin(async tx=>{await tx`select set_config('nexus.rule_actor',${master},true),set_config('nexus.rule_reason','Direct edit',true)`;await tx`update game_rule_effects set amount=-2000 where rule_id=${liveId}`;}));
 await step(2,'finish');assert.equal(await value(live.game,live.cash),'120135');
 assert.equal(JSON.stringify((await ruleRead(live.game)).executions.slice(0,1)),oldHistory);
 await sql`update games set status='paused' where id=${live.game}`;
 await assert.rejects(runtimeEdit('2000',{reason:'  '}));await runtimeEdit('2000');
 await sql`update games set status='active' where id=${live.game}`;
 await step(3,'start');await step(3,'finish');assert.equal(await value(live.game,live.cash),'122135');
 const changes=await sql`select * from game_rule_changes where rule_id=${liveId} order by revision`;
 assert.deepEqual(changes.map(c=>[c.before_amount,c.after_amount]),[['-5000','-3000'],['-3000','2000']]);assert(changes.every(c=>c.reason==='Revisar costo'&&c.actor_id===master));
 await assert.rejects(sql`update game_rule_changes set reason='Changed' where rule_id=${liveId}`);
 await assert.rejects(sql`delete from game_rule_changes where rule_id=${liveId}`);
 await assert.rejects(runtimeEdit('1'));await lifecycle.finishGame(master,{gameId:live.game,operationId:randomUUID()});await assert.rejects(runtimeEdit('1'));
 const nextLive=(await games.createGame({campaignId:live.campaign,profileId:co,name:'Next',type:'custom'})).game.id;
 assert.equal((await ruleRead(nextLive)).rules[0].effects[0].amount,'2000');assert.equal((await sql`select count(*)::int n from game_rule_changes where game_id=${nextLive}`)[0].n,0);
 await lifecycle.deleteGame(master,{gameId:nextLive,operationId:randomUUID()});
 await assert.rejects(lifecycle.resetGame(master,{gameId:live.game,operationId:randomUUID()}));

 const resetEdit=await fixture();const resetId=await add(resetEdit.game,definition(resetEdit.cash));await startGame(resetEdit.game);
 await rules.mutateRule(master,{gameId:resetEdit.game,ruleId:resetId,operation:'update',expectedRevision:0,runtimeEffects:[{kpiId:resetEdit.cash,amount:'-3000'}],reason:'Acuerdo con proveedor'});
 const resetOperation=randomUUID();
 // A failure after restoration must roll back amounts, audit markers and the complete Reset.
 await sql.unsafe("CREATE FUNCTION fail_reset_rule_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.details->>'lifecycleOperation'='reset' THEN RAISE EXCEPTION 'injected reset failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_reset_rule_test BEFORE INSERT ON game_preparation_changes FOR EACH ROW EXECUTE FUNCTION fail_reset_rule_test();");
 await assert.rejects(lifecycle.resetGame(master,{gameId:resetEdit.game,operationId:resetOperation}));
 assert.equal((await ruleRead(resetEdit.game)).rules[0].effects[0].amount,'-3000');assert.equal((await sql`select status from games where id=${resetEdit.game}`)[0].status,'active');
 assert.equal((await sql`select discarded_by_reset_id from game_rule_changes where rule_id=${resetId}`)[0].discarded_by_reset_id,null);
 await sql.unsafe('DROP TRIGGER fail_reset_rule_test ON game_preparation_changes; DROP FUNCTION fail_reset_rule_test();');
 await lifecycle.resetGame(master,{gameId:resetEdit.game,operationId:resetOperation});assert.equal((await ruleRead(resetEdit.game)).rules[0].effects[0].amount,'-5000');
 const archived=(await sql`select * from game_rule_changes where rule_id=${resetId}`)[0];assert.equal(archived.discarded_by_reset_id,resetOperation);assert.equal(archived.reason,'Acuerdo con proveedor');assert.equal(archived.before_amount,'-5000');assert.equal(archived.after_amount,'-3000');
 const afterResetRevision=(await ruleRead(resetEdit.game)).rules[0].revision;assert.equal(afterResetRevision,2);
 assert.equal((await lifecycle.resetGame(master,{gameId:resetEdit.game,operationId:resetOperation})).replayed,true);assert.equal((await ruleRead(resetEdit.game)).rules[0].revision,afterResetRevision);
 // A later run must restore its own preparation, not the discarded previous run.
 await edit(resetEdit.game,resetId,definition(resetEdit.cash,'-7000'));await startGame(resetEdit.game);
 for(const amount of ['-1000','2000']){const r=(await ruleRead(resetEdit.game)).rules[0];await rules.mutateRule(master,{gameId:resetEdit.game,ruleId:resetId,operation:'update',expectedRevision:r.revision,runtimeEffects:[{kpiId:resetEdit.cash,amount}],reason:'Segunda ejecucion'});}
 const secondReset=randomUUID();await lifecycle.resetGame(master,{gameId:resetEdit.game,operationId:secondReset});assert.equal((await ruleRead(resetEdit.game)).rules[0].effects[0].amount,'-7000');
 const archivedRuns=await sql`select discarded_by_reset_id from game_rule_changes where rule_id=${resetId} order by revision`;
 assert.deepEqual(archivedRuns.map(r=>r.discarded_by_reset_id),[resetOperation,secondReset,secondReset]);
 await assert.rejects(sql`update game_rule_changes set discarded_by_reset_id=null where rule_id=${resetId}`);
 await lifecycle.deleteGame(master,{gameId:resetEdit.game,operationId:randomUUID()});assert.equal((await sql`select count(*)::int n from game_rule_changes where rule_id=${resetId}`)[0].n,0);
 // Normal completion must retain the runtime amount for the successor.
 const completedEdit=await fixture();const completedRule=await add(completedEdit.game,definition(completedEdit.cash));await startGame(completedEdit.game);
 await rules.mutateRule(master,{gameId:completedEdit.game,ruleId:completedRule,operation:'update',expectedRevision:0,runtimeEffects:[{kpiId:completedEdit.cash,amount:'-3000'}],reason:'Acuerdo con proveedor'});
 await roundAction(completedEdit.game,'start');await roundAction(completedEdit.game,'finish');await lifecycle.finishGame(master,{gameId:completedEdit.game,operationId:randomUUID()});
 const inheritedEdit=(await games.createGame({campaignId:completedEdit.campaign,profileId:co,name:'Next',type:'custom'})).game.id;
 assert.equal((await ruleRead(inheritedEdit)).rules[0].effects[0].amount,'-3000');assert.equal((await ruleRead(inheritedEdit)).executions.length,0);
 assert.equal((await sql`select count(*)::int n from game_rule_changes where game_id=${inheritedEdit}`)[0].n,0);
 console.log('PASS: Reset -5000 -> -3000 -> -5000; discarded audit; replay; full rollback; second-run baseline; completed successor inherits -3000.');

 // Delete cleans both discarded history (above) and the current run, atomically.
 const deleteEdit=await fixture(),deleteRule=await add(deleteEdit.game,definition(deleteEdit.cash));await startGame(deleteEdit.game);
 await rules.mutateRule(master,{gameId:deleteEdit.game,ruleId:deleteRule,operation:'update',expectedRevision:0,runtimeEffects:[{kpiId:deleteEdit.cash,amount:'-3000'}],reason:'Delete test'});
 await sql.unsafe("CREATE FUNCTION fail_game_delete_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected delete failure'; END $$; CREATE TRIGGER zz_fail_game_delete_test BEFORE DELETE ON games FOR EACH ROW EXECUTE FUNCTION fail_game_delete_test();");
 await assert.rejects(lifecycle.deleteGame(master,{gameId:deleteEdit.game,operationId:randomUUID()}));
 assert.equal((await sql`select count(*)::int n from game_rule_changes where game_id=${deleteEdit.game}`)[0].n,1);
 assert.equal((await ruleRead(deleteEdit.game)).rules[0].effects[0].amount,'-3000');
 await sql.unsafe('DROP TRIGGER zz_fail_game_delete_test ON games; DROP FUNCTION fail_game_delete_test();');
 await lifecycle.deleteGame(master,{gameId:deleteEdit.game,operationId:randomUUID()});assert.equal((await sql`select count(*)::int n from game_rule_changes where game_id=${deleteEdit.game}`)[0].n,0);
 assert.equal((await sql`select count(*)::int n from game_rule_changes c left join games g on g.id=c.game_id where g.id is null`)[0].n,0);
 // A pending lazy close always uses the amount in force before expiry.
 for(const status of ['active','paused']){
  const late=await fixture(1,2),lateRule=await add(late.game,definition(late.cash));await startGame(late.game);await roundAction(late.game,'start');await sql`select pg_sleep(1.1)`;
  if(status==='paused')await sql`update games set status='paused' where id=${late.game}`;
  const request={gameId:late.game,ruleId:lateRule,operation:'update',expectedRevision:0,runtimeEffects:[{kpiId:late.cash,amount:'-3000'}],reason:'Too late'};
  await assert.rejects(rules.mutateRule(master,request),/venció/);
  await assert.rejects(sql.begin(async tx=>{await tx`select set_config('nexus.rule_actor',${master},true),set_config('nexus.rule_reason','Too late',true)`;await tx`update game_rules set revision=revision+1,updated_by=${master} where id=${lateRule}`;}),/RULE_EDIT_ROUND_EXPIRED/);
  assert.equal((await ruleRead(late.game)).rules[0].revision,0);assert.equal((await sql`select count(*)::int n from game_rule_changes where game_id=${late.game}`)[0].n,0);
  if(status==='paused')await sql`update games set status='active' where id=${late.game}`;
  await rounds.readRounds(late.game,master);assert.equal(await value(late.game,late.cash),'123135');assert.equal((await ruleRead(late.game)).executions[0].effects[0].amount,'-5000');
  await rules.mutateRule(master,request);assert.equal((await ruleRead(late.game)).rules[0].effects[0].amount,'-3000');
 }
 // Expiry during the edit transaction also rolls back and returns a controlled error.
 const crossing=await fixture(1,2),crossingRule=await add(crossing.game,definition(crossing.cash));await startGame(crossing.game);await roundAction(crossing.game,'start');
 await sql.unsafe('CREATE FUNCTION delay_rule_edit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.1); RETURN NEW; END $$; CREATE TRIGGER zz_delay_rule_edit_test AFTER UPDATE ON game_rule_effects FOR EACH ROW EXECUTE FUNCTION delay_rule_edit_test();');
 await assert.rejects(rules.mutateRule(master,{gameId:crossing.game,ruleId:crossingRule,operation:'update',expectedRevision:0,runtimeEffects:[{kpiId:crossing.cash,amount:'-3000'}],reason:'Crossing deadline'}),/venció/);
 await sql.unsafe('DROP TRIGGER zz_delay_rule_edit_test ON game_rule_effects; DROP FUNCTION delay_rule_edit_test();');
 assert.equal((await ruleRead(crossing.game)).rules[0].revision,0);assert.equal((await sql`select count(*)::int n from game_rule_changes where game_id=${crossing.game}`)[0].n,0);
 await rounds.readRounds(crossing.game,master);assert.equal(await value(crossing.game,crossing.cash),'123135');
 console.log('PASS: Delete leaves no rule-change orphans; rollback restores history; expired active/paused edit rejected; late-commit rollback; lazy close uses original amount.');
 const formFixture=await fixture(),formDomain=module('rules/domain/rule');
 for(const [direction,expected]of [['increase','5000'],['decrease','-5000']]){const rid=await add(formFixture.game,definition(formFixture.cash,formDomain.effectAmount(direction,'5000')));assert.equal((await ruleRead(formFixture.game)).rules.find(r=>r.id===rid).effects[0].amount,expected);}
 console.log('PASS 0025: active/paused amount edits; reason; roles; stale revision; targets/structure protected; next close; immutable past amounts; Reset/Delete history and successor.');
 for(const table of ['game_rules','game_rule_effects','game_rule_executions','game_rule_changes'])for(const role of ['anon','authenticated'])assert.equal((await sql`select has_table_privilege(${role},${table},'SELECT,INSERT,UPDATE,DELETE') allowed`)[0].allowed,false);
 console.log('PASS: rule configuration/roles; manual/timer; shared KPI revisions; rollback; 0023/manual coexistence; reset/delete; successor; automatic authorship; RLS.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
