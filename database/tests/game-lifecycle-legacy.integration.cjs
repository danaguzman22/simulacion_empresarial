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


async function apply(file) { await sql.begin(async tx=>{for(const q of fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(q.trim())await tx.unsafe(q);}); }
async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 const files=fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const f of files.filter(f=>Number(f.slice(0,4))<=10))await apply(root+'/database/migrations/'+f);
 // Reproduce the deployed OLD 0011, without editing any migration or disabling guards.
 await apply(root+'/database/tests/fixtures/0011_legacy_round_lifecycle.sql');
 const actor=randomUUID(),company=randomUUID(),campaign=randomUUID(),game=randomUUID(),prep=randomUUID();
 await sql`INSERT INTO auth.users VALUES(${actor},'legacy@test.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by)VALUES(${company},'Legacy',${actor})`;
 await sql`INSERT INTO campaigns(id,company_id,name,created_by)VALUES(${campaign},${company},'Legacy',${actor})`;
 await sql`INSERT INTO campaign_members(campaign_id,profile_id,role)VALUES(${campaign},${actor},'master')`;
 await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${game},${campaign},0,'Legacy')`;
 await sql.begin(async tx=>{
  for(const [id,phase]of [[prep,'preparation'],[randomUUID(),'initial'],[randomUUID(),'current']]){await tx`INSERT INTO game_state_sets(id,game_id,campaign_id,phase,created_by,updated_by)VALUES(${id},${game},${campaign},${phase},${actor},${actor})`;if(phase==='initial')await tx`UPDATE game_state_sets SET frozen_at=now() WHERE id=${id}`;}
  await tx`UPDATE game_state_sets SET frozen_at=now(),revision=1 WHERE id=${prep}`;
  await tx`INSERT INTO game_preparation_changes(operation_id,campaign_id,state_set_id,actor_id,operation,request_hash,previous_revision,revision,details)VALUES(${randomUUID()},${campaign},${prep},${actor},'start_game','legacy',0,1,'{}')`;
  await tx`UPDATE games SET status='active',started_at=now() WHERE id=${game}`;
 });
 let r;
 const audit=async(tx,r,operation)=>tx`INSERT INTO round_changes(operation_id,round_id,game_id,campaign_id,actor_id,operation,revision,request_hash,details)VALUES(${randomUUID()},${r.id},${game},${campaign},${actor},${operation},${r.revision},'legacy','{}')`;
 await sql.begin(async tx=>{[r]=await tx`INSERT INTO rounds(game_id,campaign_id,sequence,duration_seconds,created_by)VALUES(${game},${campaign},1,1,${actor}) RETURNING *`;await audit(tx,r,'create');});
 await sql.begin(async tx=>{[r]=await tx`UPDATE rounds SET status='active',revision=revision+1 WHERE id=${r.id} RETURNING *`;await audit(tx,r,'start');});
 await sql`SELECT pg_sleep(1.1)`;
 await sql.begin(async tx=>{[r]=await tx`UPDATE rounds SET status='completed',revision=revision+1 WHERE id=${r.id} RETURNING *`;await audit(tx,r,'finish');});
 for(const f of files.filter(f=>Number(f.slice(0,4))>=12))await apply(root+'/database/migrations/'+f);
 await sql`UPDATE games SET status='evaluation' WHERE id=${game}`;
 const repo=load(base+'/src/features/games/repositories/start-game.repository.ts'),lifecycle=load(base+'/src/features/games/repositories/game-lifecycle.repository.ts');
 assert.equal((await sql`SELECT period_count FROM games WHERE id=${game}`)[0].period_count,null);
 assert.equal((await repo.readGameLifecycle(game,actor)).canFinish,true);
 const states=await sql`SELECT * FROM game_state_sets WHERE game_id=${game} AND phase='initial'`;
 await lifecycle.finishGame(actor,{gameId:game,operationId:randomUUID()});
 assert.equal((await sql`SELECT status FROM games WHERE id=${game}`)[0].status,'completed');
 assert.deepEqual(await sql`SELECT * FROM game_state_sets WHERE game_id=${game} AND phase='initial'`,states);
 assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${game} AND phase IN ('current','final') AND frozen_at IS NOT NULL`)[0].n,2);
 const bindings=await sql`SELECT c.relname AS table_name,t.tgname,p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace ORDER BY c.relname,t.tgname`;
 assert(bindings.some(b=>b.table_name==='game_preparation_changes'&&b.proname==='guard_preparation_change'));
 const successor=await lifecycle.restartCompletedGame(actor,{gameId:game,operationId:randomUUID()});
 const inherited=await sql`SELECT period_count,period_label,period_duration_seconds,period_revision FROM games WHERE id=${successor.gameId}`;
 assert.equal(inherited[0].period_count,null);assert.equal(inherited[0].period_label,null);assert.equal(inherited[0].period_duration_seconds,null);assert.equal(inherited[0].period_revision,0);
 const successorStates=await sql`SELECT phase,frozen_at,source_state_set_id FROM game_state_sets WHERE game_id=${successor.gameId}`;
 assert.equal(successorStates.length,1);assert.equal(successorStates[0].phase,'preparation');assert.equal(successorStates[0].frozen_at,null);assert(successorStates[0].source_state_set_id);
 console.log('PASS: legacy successor preserves final source, starts with editable preparation, and does not invent period configuration or revision.');
 console.log('PASS: old deployed lifecycle -> 0012-0018; evaluation without period_count finishes; frozen final/current; original initial intact; real trigger binding verified.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sql.end());
