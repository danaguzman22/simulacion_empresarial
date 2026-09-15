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

async function main(){
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 for(const f of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort())await sql.begin(async tx=>{for(const q of fs.readFileSync(root+'/database/migrations/'+f,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(q.trim())await tx.unsafe(q);});
 const master=randomUUID(),co=randomUUID(),observer=randomUUID();for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'test@example.test','{}')`;
 const company=randomUUID();await sql`INSERT INTO companies(id,name,created_by)VALUES(${company},'Test',${master})`;
 const repo=load(base+'/src/features/games/repositories/start-game.repository.ts'),prep=load(base+'/src/features/preparation/repositories/preparation.repository.ts'),manage=load(base+'/src/features/preparation/repositories/kpi-management.repository.ts'),lifecycle=load(base+'/src/features/games/repositories/game-lifecycle.repository.ts');
 const roundsRepo=load(base+'/src/features/rounds/repositories/round.repository.ts'),kpiRepo=load(base+'/src/features/kpis/repositories/game-kpi.repository.ts');
 const periods=load(base+"/src/features/rounds/repositories/period-configuration.repository.ts");
 async function fixture(){const campaign=randomUUID(),game=randomUUID();await sql`INSERT INTO campaigns(id,company_id,name,created_by)VALUES(${campaign},${company},'Campaign',${master})`;for(const [id,role] of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role)VALUES(${campaign},${id},${role})`;await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${game},${campaign},0,'Game')`;
 await periods.savePeriodConfiguration(master,{gameId:game,operationId:randomUUID(),expectedRevision:0,count:6,label:'Semana',durationSeconds:1230});
 for(const definition of [{key:'cash',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},{key:'inventory',name:'Inventario',unit:'nivel',precision:0,required:true,allowsNegative:false,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'medium',label:'Medio',position:1}]}]){const d=await prep.readPreparation(game,master);await manage.mutateKpi(master,{gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,operation:'create_kpi',definition});}return {game,campaign};}
 async function request(game){const d=await prep.readPreparation(game,master);return {gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:(await periods.readPeriodConfiguration(game,master)).revision};}
 async function fill(game){const d=await prep.readPreparation(game,master);await prep.writePreparation(master,{...await request(game),operation:'save_values',sourceId:null,values:Object.fromEntries(d.definitions.map(k=>[k.id,k.valueType==='numeric'?'35.50':'medium']))});}
 const a=await fixture();await assert.rejects(repo.startGame(master,await request(a.game)),/obligatorios/);await fill(a.game);
 await assert.rejects(repo.startGame(observer,await request(a.game)));
 const input=await request(a.game);const result=await Promise.allSettled([repo.startGame(master,input),repo.startGame(co,{...input,operationId:randomUUID()})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const audit=await sql`SELECT actor_id,operation_id FROM game_preparation_changes WHERE operation='start_game'`;const winner=audit[0].actor_id;const winningInput={...input,operationId:audit[0].operation_id};assert.equal((await repo.startGame(winner,winningInput)).replayed,true);
 await assert.rejects(repo.startGame(master,await request(a.game)));
 const states=await sql`SELECT * FROM game_state_sets WHERE game_id=${a.game}`;assert.equal(states.length,3);const initial=states.find(s=>s.phase==='initial'),current=states.find(s=>s.phase==='current'),preparation=states.find(s=>s.phase==='preparation');assert(initial.frozen_at);assert(preparation.frozen_at);assert.equal(current.frozen_at,null);
 const iv=await sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=${initial.id} ORDER BY kpi_definition_id`;const cv=await sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=${current.id} ORDER BY kpi_definition_id`;assert.deepEqual(iv,cv);assert(iv.some(v=>v.ordinal_key==='medium'));assert(iv.some(v=>v.value==='35.5'));
 assert((await repo.readGameLifecycle(a.game,observer)).snapshots.every(s=>s.values.some(v=>v.value==='Medio')));
 let controls=await kpiRepo.readGameKpiControls(a.game,master);assert.equal(controls.canEdit,false);const periodRows=await roundsRepo.readRounds(a.game,master);const first=periodRows.rounds[0];await roundsRepo.mutateRound(master,{gameId:a.game,roundId:first.id,operation:'start',operationId:randomUUID(),expectedRevision:first.revision});controls=await kpiRepo.readGameKpiControls(a.game,master);assert.equal(controls.canEdit,true);const cash=controls.kpis.find(k=>k.name==='Fondos'),inventory=controls.kpis.find(k=>k.name==='Inventario');assert(cash&&inventory);
 const cashChange={gameId:a.game,operationId:randomUUID(),kpiDefinitionId:cash.id,roundId:first.id,expectedRevision:controls.revision,expectedRoundRevision:controls.activeRoundRevision,rawValue:'30'};await kpiRepo.updateGameKpi(master,cashChange);assert.equal((await kpiRepo.updateGameKpi(master,cashChange)).replayed,true);await assert.rejects(kpiRepo.updateGameKpi(master,{...cashChange,operationId:randomUUID(),rawValue:'31'}));
 controls=await kpiRepo.readGameKpiControls(a.game,co);const inventoryChange={gameId:a.game,operationId:randomUUID(),kpiDefinitionId:inventory.id,roundId:first.id,expectedRevision:controls.revision,expectedRoundRevision:controls.activeRoundRevision,rawValue:'low'};await kpiRepo.updateGameKpi(co,inventoryChange);assert.equal((await kpiRepo.readGameKpiControls(a.game,observer)).canEdit,false);
 const updatedCurrent=await sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=${current.id} ORDER BY kpi_definition_id`;assert(updatedCurrent.some(v=>v.value==='30'));assert(updatedCurrent.some(v=>v.ordinal_key==='low'));assert((await sql`SELECT value FROM game_state_values WHERE state_set_id=${initial.id} AND value IS NOT NULL`)[0].value!=='30');assert.equal((await sql`SELECT count(*)::int n FROM game_kpi_changes WHERE game_id=${a.game}`)[0].n,2);
 await assert.rejects(sql`UPDATE game_state_values SET value=99 WHERE state_set_id=${initial.id} AND value IS NOT NULL`);
 await assert.rejects(sql`UPDATE game_state_values SET value=99 WHERE state_set_id=${preparation.id} AND value IS NOT NULL`);
 await assert.rejects(sql`UPDATE game_state_values SET value=99 WHERE state_set_id=${current.id} AND value IS NOT NULL`);
 const other=randomUUID();await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${other},${a.campaign},1,'Future')`;const d=await prep.readPreparation(other,master);await manage.mutateKpi(master,{gameId:other,operationId:randomUUID(),expectedRevision:0,catalogToken:d.catalogToken,operation:'add_kpi',kpiId:d.catalog[0].id,required:false});
 for(const status of ['active','paused']){await sql`UPDATE games SET status=${status} WHERE id=${a.game}`;await assert.rejects(repo.startGame(master,await request(other)),/activa o pausada/);}
 const b=await fixture();await fill(b.game);const before=await prep.readPreparation(b.game,master);
 await sql.unsafe("CREATE FUNCTION test_start_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_start_failure BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION test_start_failure();");
 await assert.rejects(repo.startGame(master,await request(b.game)));
 assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${b.game}`)[0].n,1);assert.equal((await prep.readPreparation(b.game,master)).revision,before.revision);assert.equal((await prep.readPreparation(b.game,master)).canEdit,true);
 await sql.unsafe('DROP TRIGGER test_start_failure ON games; DROP FUNCTION test_start_failure();');
 await assert.rejects(sql`UPDATE games SET status='active',started_at=now() WHERE id=${b.game}`);
 await repo.startGame(co,await request(b.game));
 const resetGame=await fixture();let resetData=await prep.readPreparation(resetGame.game,master);await manage.mutateKpi(master,{gameId:resetGame.game,operationId:randomUUID(),expectedRevision:resetData.revision,catalogToken:resetData.catalogToken,operation:'create_kpi',definition:{key:'lead_time',name:'Lead Time',unit:'semanas',precision:1,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]}});resetData=await prep.readPreparation(resetGame.game,master);await prep.writePreparation(master,{...await request(resetGame.game),operation:'save_values',sourceId:null,values:Object.fromEntries(resetData.definitions.map(k=>[k.id,k.key==='lead_time'?'30':k.valueType==='numeric'?'35':'medium']))});await repo.startGame(master,await request(resetGame.game));
 await lifecycle.resetGame(master,{gameId:resetGame.game,operationId:randomUUID()});
 const afterResetStates=await sql`SELECT phase,frozen_at FROM game_state_sets WHERE game_id=${resetGame.game} ORDER BY phase`;assert.deepEqual(afterResetStates.map(s=>s.phase),['preparation']);assert.equal(afterResetStates[0].frozen_at,null);assert.equal((await prep.readPreparation(resetGame.game,master)).canEdit,true);assert.equal((await sql`SELECT count(*)::int n FROM rounds WHERE game_id=${resetGame.game}`)[0].n,0);assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${resetGame.game} AND phase='final'`)[0].n,0);

 const editable=await prep.readPreparation(resetGame.game,master);
 await prep.writePreparation(master,{...await request(resetGame.game),operation:'save_values',sourceId:null,values:Object.fromEntries(editable.definitions.map(k=>[k.id,k.key==='lead_time'?'20':k.valueType==='numeric'?'8000':'medium']))});
 await periods.savePeriodConfiguration(master,{gameId:resetGame.game,operationId:randomUUID(),expectedRevision:1,count:2,label:'Mes',durationSeconds:61});
 const resetPrepared=await sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=(SELECT id FROM game_state_sets WHERE game_id=${resetGame.game} AND phase='preparation') ORDER BY kpi_definition_id`;
 assert(resetPrepared.some(v=>v.value==='8000'));assert(resetPrepared.some(v=>v.value==='20'));assert.equal((await repo.readGameLifecycle(resetGame.game,master)).canStart,true);
 await repo.startGame(master,await request(resetGame.game));assert.equal((await sql`SELECT count(*)::int n FROM rounds WHERE game_id=${resetGame.game}`)[0].n,2);
 assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${resetGame.game}`)[0].n,3);
 for(const phase of ['initial','current'])assert.deepEqual(await sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=(SELECT id FROM game_state_sets WHERE game_id=${resetGame.game} AND phase=${phase}) ORDER BY kpi_definition_id`,resetPrepared);

 // Finish does not depend on being last: preplanned successors must not hide it.
 async function completeRounds(game) { let data=await roundsRepo.readRounds(game,master);for(const row of data.rounds){if(row.status==='pending')await roundsRepo.mutateRound(master,{gameId:game,roundId:row.id,operation:'start',operationId:randomUUID(),expectedRevision:row.revision});data=await roundsRepo.readRounds(game,master);const active=data.rounds.find(r=>r.id===row.id);if(active.status!=='completed')await roundsRepo.mutateRound(master,{gameId:game,roundId:row.id,operation:'finish',operationId:randomUUID(),expectedRevision:active.revision});} }
 const op=game=>({gameId:game,operationId:randomUUID()});
 const valuesOf=async(game,phase)=>sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=(SELECT id FROM game_state_sets WHERE game_id=${game} AND phase=${phase}) ORDER BY kpi_definition_id`;
 await sql`UPDATE games SET status='active' WHERE id=${a.game}`;
 await assert.rejects(lifecycle.deleteGame(master,op(a.game)));await assert.rejects(lifecycle.resetGame(master,op(a.game)));
 await completeRounds(a.game);assert.equal((await repo.readGameLifecycle(a.game,master)).canFinish,true);assert.equal((await repo.readGameLifecycle(a.game,observer)).canFinish,false);
 await assert.rejects(lifecycle.finishGame(observer,op(a.game)));const finishInput=op(a.game);await lifecycle.finishGame(master,finishInput);assert.equal((await lifecycle.finishGame(master,finishInput)).replayed,true);
 assert.equal((await sql`SELECT status FROM games WHERE id=${a.game}`)[0].status,'completed');assert.deepEqual(await valuesOf(a.game,'final'),updatedCurrent);assert.deepEqual(await valuesOf(a.game,'initial'),iv);
 assert((await sql`SELECT frozen_at FROM game_state_sets WHERE game_id=${a.game} AND phase IN ('current','final')`).every(r=>r.frozen_at));
 await assert.rejects(lifecycle.deleteGame(master,op(a.game)));await assert.rejects(lifecycle.resetGame(master,op(a.game)));
 const deleteFuture=op(other);assert.equal((await lifecycle.deleteGame(master,deleteFuture)).campaignId,a.campaign);assert.equal((await lifecycle.deleteGame(master,deleteFuture)).replayed,true);
 assert.equal((await sql`SELECT game_id FROM game_lifecycle_changes WHERE operation_id=${deleteFuture.operationId}`)[0].game_id,null);
 // Completed restart copies FINAL, including operational changes, never INITIAL/current.
 const successorInput=op(a.game);const next=await lifecycle.restartCompletedGame(master,successorInput);assert.equal((await lifecycle.restartCompletedGame(master,successorInput)).gameId,next.gameId);
 assert.deepEqual(await valuesOf(next.gameId,'preparation'),updatedCurrent);assert.equal((await valuesOf(next.gameId,'initial')).length,0);assert.deepEqual(await valuesOf(a.game,'initial'),iv);assert.deepEqual(await valuesOf(a.game,'final'),updatedCurrent);
 assert.equal((await sql`SELECT sequence,period_revision FROM games WHERE id=${next.gameId}`)[0].period_revision,1);
 await repo.startGame(master,await request(next.gameId));assert.equal((await sql`SELECT count(*)::int n FROM rounds WHERE game_id=${next.gameId}`)[0].n,6);
 // Reset after actual numeric + ordinal operational mutations.
 let nextRounds=await roundsRepo.readRounds(next.gameId,master);let nextRound=nextRounds.rounds[0];await roundsRepo.mutateRound(master,{gameId:next.gameId,roundId:nextRound.id,operation:'start',operationId:randomUUID(),expectedRevision:nextRound.revision});
 for(const type of ['numeric','ordinal']){const d=await kpiRepo.readGameKpiControls(next.gameId,master);const k=d.kpis.find(k=>k.valueType===type);await kpiRepo.updateGameKpi(master,{gameId:next.gameId,operationId:randomUUID(),kpiDefinitionId:k.id,roundId:nextRound.id,expectedRevision:d.revision,expectedRoundRevision:d.activeRoundRevision,rawValue:type==='numeric'?'7010':'medium'});}
 assert.notDeepEqual(await valuesOf(next.gameId,'current'),await valuesOf(next.gameId,'initial'));
 const beforeSuccessorReset=await valuesOf(next.gameId,'initial');await lifecycle.resetGame(master,op(next.gameId));assert.equal((await prep.readPreparation(next.gameId,master)).canEdit,true);assert.deepEqual(await valuesOf(next.gameId,'preparation'),beforeSuccessorReset);assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${next.gameId} AND phase<>'preparation'`)[0].n,0);assert.equal((await sql`SELECT count(*)::int n FROM game_kpi_changes WHERE game_id=${next.gameId}`)[0].n,0);
 await repo.startGame(master,await request(next.gameId));
 // A previous game remains protected; context flags alone do not grant deletion.
 await assert.rejects(lifecycle.resetGame(master,op(a.game)));await assert.rejects(lifecycle.deleteGame(master,op(a.game)));
 await assert.rejects(sql.begin(async tx=>{await tx`SELECT set_config('nexus.lifecycle_operation','delete',true),set_config('nexus.lifecycle_game_id',${next.gameId},true)`;await tx`DELETE FROM game_preparation_changes WHERE state_set_id IN (SELECT id FROM game_state_sets WHERE game_id=${next.gameId})`;}));
 // Evaluation reset with changed numeric/ordinal current, then start without duplicating snapshots.
 await completeRounds(next.gameId);const resetInput=op(next.gameId);const nextInitial=await valuesOf(next.gameId,'initial');await lifecycle.resetGame(master,resetInput);assert.equal((await lifecycle.resetGame(master,resetInput)).replayed,true);assert.deepEqual(await valuesOf(next.gameId,'preparation'),nextInitial);assert.equal((await prep.readPreparation(next.gameId,master)).canEdit,true);assert.equal((await valuesOf(next.gameId,'current')).length,0);assert.equal((await valuesOf(next.gameId,'initial')).length,0);await repo.startGame(master,await request(next.gameId));assert.deepEqual(await valuesOf(next.gameId,'current'),nextInitial);
 const deleteActive=op(next.gameId);await lifecycle.deleteGame(master,deleteActive);assert.equal((await sql`SELECT count(*)::int n FROM games WHERE id=${next.gameId}`)[0].n,0);assert.deepEqual(await valuesOf(a.game,'final'),updatedCurrent);
 const deletionAudit=(await sql`SELECT * FROM game_lifecycle_changes WHERE operation_id=${deleteActive.operationId}`)[0];assert.equal(deletionAudit.game_id,null);assert.equal(deletionAudit.details.subjectGameId,next.gameId);
 await assert.rejects(sql`UPDATE game_lifecycle_changes SET details='{}' WHERE operation_id=${deleteActive.operationId}`);await assert.rejects(sql`DELETE FROM game_lifecycle_changes WHERE operation_id=${deleteActive.operationId}`);
 // Rollback must restore all children if the final DELETE fails.
 const rollback=await fixture();await fill(rollback.game);await repo.startGame(master,await request(rollback.game));
 await sql.unsafe("CREATE FUNCTION test_delete_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'late delete failure'; END $$; CREATE TRIGGER test_delete_failure BEFORE DELETE ON games FOR EACH ROW EXECUTE FUNCTION test_delete_failure();");
 await assert.rejects(lifecycle.deleteGame(master,op(rollback.game)));assert.equal((await sql`SELECT count(*)::int n FROM rounds WHERE game_id=${rollback.game}`)[0].n,6);assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${rollback.game}`)[0].n,3);
 await sql.unsafe('DROP TRIGGER test_delete_failure ON games; DROP FUNCTION test_delete_failure();');
 console.log('PASS: finish with future game; final=current numeric/ordinal; initial immutable; completed successor initial=final; reset/restart; deletion child-first with surviving immutable audit; protection without context/audit; full delete rollback.');
 console.log('PASS: success; required; numeric/ordinal exact copies; observer; concurrent start; retry; second start; active/paused conflict; immutable initial/preparation; independent current; rollback; DB activation guard.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sql.end());
