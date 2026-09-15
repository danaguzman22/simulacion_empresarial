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
 for (const f of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort()) await sql.begin(async tx=>{for(const q of fs.readFileSync(root+'/database/migrations/'+f,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(q.trim())await tx.unsafe(q);});
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer]) await sql`INSERT INTO auth.users VALUES(${id},'round@test.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by)VALUES(${company},'Company',${master})`;
 const roundsRepo=load(base+'/src/features/rounds/repositories/round.repository.ts');
 const config=load(base+'/src/features/rounds/repositories/period-configuration.repository.ts');
 const start=load(base+'/src/features/games/repositories/start-game.repository.ts');
 const prepRepo=load(base+'/src/features/preparation/repositories/preparation.repository.ts');
 const domain=load(base+'/src/features/rounds/domain/period-configuration.ts');
 assert.equal(domain.parsePeriodConfiguration('6','Semana','20','30').durationSeconds,1230);
 for(const args of [['0','Semana','1','0'],['1','Semana','0','0'],['1','Semana','0','60'],['1','Semana','-1','0'],['1','','1','0']]) assert.throws(()=>domain.parsePeriodConfiguration(...args));
 async function fixture(campaign) {
  const c=campaign??randomUUID(),g=randomUUID();
  if(!campaign){await sql`INSERT INTO campaigns(id,company_id,name,created_by)VALUES(${c},${company},'Campaign',${master})`;for(const [id,role]of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role)VALUES(${c},${id},${role})`;}
  await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${g},${c},${campaign?1:0},'Game')`;
  await sql`INSERT INTO game_state_sets(game_id,campaign_id,phase,created_by,updated_by)VALUES(${g},${c},'preparation',${master},${master})`;
  return {g,c};
 }
 async function request(g) {const data=await prepRepo.readPreparation(g,master);return {gameId:g,operationId:randomUUID(),expectedRevision:data.revision,catalogToken:data.catalogToken,expectedPeriodRevision:(await config.readPeriodConfiguration(g,master)).revision};}
 const save=(g,extra={},actor=master)=>config.savePeriodConfiguration(actor,{gameId:g,operationId:randomUUID(),expectedRevision:0,count:6,label:'Semana',durationSeconds:1230,...extra});
 const a=await fixture();await assert.rejects(start.startGame(master,await request(a.g)));
 await assert.rejects(save(a.g,{},observer));
 const operationId=randomUUID();await save(a.g,{operationId});assert.equal((await save(a.g,{operationId})).replayed,true);
 assert.equal((await config.readPeriodConfiguration(a.g,observer)).canEdit,false);
 const stale=await request(a.g);await save(a.g,{expectedRevision:1},co);await assert.rejects(start.startGame(master,stale));
 await assert.rejects(save(a.g,{expectedRevision:1}));
 await start.startGame(master,await request(a.g));
 let rows=await roundsRepo.readRounds(a.g,observer);
 assert.equal(rows.periodLabel,'Semana');assert.equal(rows.rounds.length,6);
 assert.deepEqual(Array.from(rows.rounds,r=>r.sequence),[1,2,3,4,5,6]);
 assert(rows.rounds.every(r=>r.status==='pending'&&r.durationSeconds===1230));
 await assert.rejects(save(a.g,{expectedRevision:2}));
 await assert.rejects(sql`UPDATE games SET period_count=7,period_revision=period_revision+1 WHERE id=${a.g}`);
 await assert.rejects(sql`UPDATE games SET status='evaluation' WHERE id=${a.g}`);
 await assert.rejects(sql`UPDATE rounds SET duration_seconds=10,revision=revision+1 WHERE game_id=${a.g}`);
 await assert.rejects(sql`INSERT INTO rounds(game_id,campaign_id,sequence,duration_seconds,created_by)VALUES(${a.g},${a.c},7,1230,${master})`);
 // Another game can be configured while this campaign already has an active game.
 const future=await fixture(a.c);await save(future.g);assert.equal((await config.readPeriodConfiguration(future.g,co)).count,6);
 // Config changes are revision-controlled and require immutable audit even via SQL.
 const c=await fixture();const concurrentConfig=await Promise.allSettled([save(c.g),save(c.g,{},co)]);assert.equal(concurrentConfig.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(sql`UPDATE games SET period_count=7,period_revision=period_revision+1 WHERE id=${c.g}`);
 await assert.rejects(sql`DELETE FROM game_period_changes`);
 // Use short periods for real clock integration, without changing runtime durations.
 const b=await fixture();await save(b.g,{count:3,durationSeconds:2});await start.startGame(co,await request(b.g));
 const list=()=>roundsRepo.readRounds(b.g,observer);
 const action=(operation,r,actor=master,extra={})=>roundsRepo.mutateRound(actor,{gameId:b.g,operationId:randomUUID(),operation,roundId:r.id,expectedRevision:r.revision,...extra});
 rows=await list();await assert.rejects(action('start',rows.rounds[0],observer));await assert.rejects(action('start',rows.rounds[1]));
 const first=rows.rounds[0];const startId=randomUUID();const outcomes=await Promise.allSettled([action('start',first,master,{operationId:startId}),action('start',first,co)]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 if(outcomes[0].status==='fulfilled')assert.equal((await action('start',first,master,{operationId:startId})).replayed,true);
 rows=await list();await assert.rejects(action('start',rows.rounds[1]));await action('pause',rows.rounds[0]);
 rows=await list();const remaining=rows.rounds[0].remainingMs;assert(remaining>0&&remaining<=2000);await sql`SELECT pg_sleep(0.15)`;assert.equal((await list()).rounds[0].remainingMs,remaining);
 await action('resume',rows.rounds[0],co);rows=await list();const endsAt=rows.rounds[0].endsAt;
 await sql`SELECT pg_sleep(2.1)`;rows=await list();assert.equal(rows.rounds[0].status,'completed');assert.equal(rows.rounds[0].completedAt,endsAt);assert.equal(rows.rounds[1].status,'pending');assert.equal(rows.gameStatus,'active');
 await list();assert.equal((await sql`SELECT count(*)::int n FROM round_changes WHERE round_id=${first.id} AND operation='finish'`)[0].n,1);
 await action('start',rows.rounds[1]);assert.equal((await list()).rounds[1].status,'active');
 rows=await list();const manualId=randomUUID();await action('finish',rows.rounds[1],co,{operationId:manualId});rows=await list();assert.equal(rows.rounds[1].status,'completed');assert(rows.rounds[1].completedAt);assert.equal(rows.rounds[2].status,'pending');assert.equal(rows.gameStatus,'active');
 const manualAudit=(await sql`SELECT actor_id,details FROM round_changes WHERE operation_id=${manualId}`)[0];assert.equal(manualAudit.actor_id,co);assert.equal(manualAudit.details.reason,'manual');
 await assert.rejects(action('finish',rows.rounds[1],co));
 await action('start',rows.rounds[2],master);rows=await list();await action('pause',rows.rounds[2],master);rows=await list();const pausedFinishId=randomUUID();await action('finish',rows.rounds[2],master,{operationId:pausedFinishId});rows=await list();assert.equal(rows.rounds[2].status,'completed');assert(rows.rounds[2].completedAt);assert.equal(rows.gameStatus,'evaluation');assert.equal((await sql`SELECT status FROM games WHERE id=${b.g}`)[0].status,'evaluation');assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${b.g} AND phase='final'`)[0].n,0);assert.equal((await sql`SELECT details->>'reason' reason FROM round_changes WHERE operation_id=${pausedFinishId}`)[0].reason,'manual');
 await assert.rejects(sql`UPDATE games SET status='active' WHERE id=${b.g}`);
 const gameRepo=load(base+'/src/features/games/repositories/game.repository.ts');const createNext=()=>gameRepo.createGame({campaignId:b.c,profileId:master,name:'Next',type:'custom'});await assert.rejects(createNext(),/Finaliz/);const lifecycle=load(base+'/src/features/games/repositories/game-lifecycle.repository.ts');await lifecycle.finishGame(master,{gameId:b.g,operationId:randomUUID()});const next={g:(await createNext()).game.id};await start.startGame(master,await request(next.g));assert.equal((await sql`SELECT status FROM games WHERE id=${next.g}`)[0].status,'active');
 const timerGame=await fixture();await save(timerGame.g,{count:1,durationSeconds:1});await start.startGame(master,await request(timerGame.g));const timerRows=()=>roundsRepo.readRounds(timerGame.g,master);let timerState=await timerRows();assert.equal(timerState.rounds[0].status,'pending');await roundsRepo.mutateRound(master,{gameId:timerGame.g,roundId:timerState.rounds[0].id,operation:'start',operationId:randomUUID(),expectedRevision:timerState.rounds[0].revision});await sql`SELECT pg_sleep(1.1)`;timerState=await timerRows();assert.equal(timerState.gameStatus,'evaluation');assert.equal(timerState.rounds[0].status,'completed');
 await assert.rejects(sql`UPDATE round_changes SET request_hash='changed'`);
 // Fail on the third insertion: snapshots, prior rounds and audit must all roll back.
 const d=await fixture();await save(d.g);const before=await prepRepo.readPreparation(d.g,master);
 await sql.unsafe("CREATE FUNCTION test_period_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.sequence=3 THEN RAISE EXCEPTION 'injected third period failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_period_failure BEFORE INSERT ON rounds FOR EACH ROW EXECUTE FUNCTION test_period_failure();");
 await assert.rejects(start.startGame(master,await request(d.g)));
 assert.equal((await sql`SELECT count(*)::int n FROM rounds WHERE game_id=${d.g}`)[0].n,0);
 assert.equal((await sql`SELECT count(*)::int n FROM round_changes WHERE game_id=${d.g}`)[0].n,0);
 assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${d.g}`)[0].n,1);
 assert.equal((await sql`SELECT status FROM games WHERE id=${d.g}`)[0].status,'draft');
 assert.equal((await prepRepo.readPreparation(d.g,master)).revision,before.revision);
 assert.equal((await prepRepo.readPreparation(d.g,master)).canEdit,true);
 await sql.unsafe('DROP TRIGGER test_period_failure ON rounds; DROP FUNCTION test_period_failure();');
 await start.startGame(master,await request(d.g));
 for(const role of ['anon','authenticated'])for(const table of ['rounds','round_changes','game_period_changes'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])assert.equal((await sql`SELECT has_table_privilege(${role},${table},${privilege}) allowed`)[0].allowed,false);
 console.log('PASS: 6 weeks, 20:30, pending sequence 1..6; missing/invalid configuration; roles; independent config/revision/audit; active campaign future config; atomic generation; runtime immutable plan/duration; sequential manual start; pause/resume/expiry; idempotence/concurrency; third-round failure full rollback; RLS.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sql.end());
