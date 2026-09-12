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
 const repo=load(base+'/src/features/games/repositories/start-game.repository.ts'),prep=load(base+'/src/features/preparation/repositories/preparation.repository.ts'),manage=load(base+'/src/features/preparation/repositories/kpi-management.repository.ts');
 async function fixture(){const campaign=randomUUID(),game=randomUUID();await sql`INSERT INTO campaigns(id,company_id,name,created_by)VALUES(${campaign},${company},'Campaign',${master})`;for(const [id,role] of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role)VALUES(${campaign},${id},${role})`;await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${game},${campaign},0,'Game')`;
 for(const definition of [{key:'cash',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},{key:'inventory',name:'Inventario',unit:'nivel',precision:0,required:true,allowsNegative:false,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'medium',label:'Medio',position:1}]}]){const d=await prep.readPreparation(game,master);await manage.mutateKpi(master,{gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,operation:'create_kpi',definition});}return {game,campaign};}
 async function request(game){const d=await prep.readPreparation(game,master);return {gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken};}
 async function fill(game){const d=await prep.readPreparation(game,master);await prep.writePreparation(master,{...await request(game),operation:'save_values',sourceId:null,values:Object.fromEntries(d.definitions.map(k=>[k.id,k.valueType==='numeric'?'35.50':'medium']))});}
 const a=await fixture();await assert.rejects(repo.startGame(master,await request(a.game)),/obligatorios/);await fill(a.game);
 await assert.rejects(repo.startGame(observer,await request(a.game)));
 const input=await request(a.game);const result=await Promise.allSettled([repo.startGame(master,input),repo.startGame(co,{...input,operationId:randomUUID()})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const audit=await sql`SELECT actor_id,operation_id FROM game_preparation_changes WHERE operation='start_game'`;const winner=audit[0].actor_id;const winningInput={...input,operationId:audit[0].operation_id};assert.equal((await repo.startGame(winner,winningInput)).replayed,true);
 await assert.rejects(repo.startGame(master,await request(a.game)));
 const states=await sql`SELECT * FROM game_state_sets WHERE game_id=${a.game}`;assert.equal(states.length,3);const initial=states.find(s=>s.phase==='initial'),current=states.find(s=>s.phase==='current'),preparation=states.find(s=>s.phase==='preparation');assert(initial.frozen_at);assert(preparation.frozen_at);assert.equal(current.frozen_at,null);
 const iv=await sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=${initial.id} ORDER BY kpi_definition_id`;const cv=await sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=${current.id} ORDER BY kpi_definition_id`;assert.deepEqual(iv,cv);assert(iv.some(v=>v.ordinal_key==='medium'));assert(iv.some(v=>v.value==='35.5'));
 assert((await repo.readGameLifecycle(a.game,observer)).snapshots.every(s=>s.values.some(v=>v.value==='Medio')));
 await assert.rejects(sql`UPDATE game_state_values SET value=99 WHERE state_set_id=${initial.id} AND value IS NOT NULL`);
 await assert.rejects(sql`UPDATE game_state_values SET value=99 WHERE state_set_id=${preparation.id} AND value IS NOT NULL`);
 await sql`UPDATE game_state_values SET value=99 WHERE state_set_id=${current.id} AND value IS NOT NULL`;
 assert((await sql`SELECT value FROM game_state_values WHERE state_set_id=${initial.id} AND value IS NOT NULL`)[0].value!=='99');
 const other=randomUUID();await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${other},${a.campaign},1,'Future')`;const d=await prep.readPreparation(other,master);await manage.mutateKpi(master,{gameId:other,operationId:randomUUID(),expectedRevision:0,catalogToken:d.catalogToken,operation:'add_kpi',kpiId:d.catalog[0].id,required:false});
 for(const status of ['active','paused']){await sql`UPDATE games SET status=${status} WHERE id=${a.game}`;await assert.rejects(repo.startGame(master,await request(other)),/activa o pausada/);}
 const b=await fixture();await fill(b.game);const before=await prep.readPreparation(b.game,master);
 await sql.unsafe("CREATE FUNCTION test_start_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'late failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_start_failure BEFORE UPDATE ON games FOR EACH ROW EXECUTE FUNCTION test_start_failure();");
 await assert.rejects(repo.startGame(master,await request(b.game)));
 assert.equal((await sql`SELECT count(*)::int n FROM game_state_sets WHERE game_id=${b.game}`)[0].n,1);assert.equal((await prep.readPreparation(b.game,master)).revision,before.revision);assert.equal((await prep.readPreparation(b.game,master)).canEdit,true);
 await sql.unsafe('DROP TRIGGER test_start_failure ON games; DROP FUNCTION test_start_failure();');
 await assert.rejects(sql`UPDATE games SET status='active',started_at=now() WHERE id=${b.game}`);
 await repo.startGame(co,await request(b.game));
 console.log('PASS: success; required; numeric/ordinal exact copies; observer; concurrent start; retry; second start; active/paused conflict; immutable initial/preparation; independent current; rollback; DB activation guard.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sql.end());
