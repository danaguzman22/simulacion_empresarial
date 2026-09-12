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
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
    return localRequire(name);
  } }, { filename: file });
  return exports;
}

async function apply(name){await sql.begin(async tx=>{for(const q of fs.readFileSync(root+'/database/migrations/'+name,'utf8').split('--> statement-breakpoint'))if(q.trim())await tx.unsafe(q);});console.log('MIGRATION',name);}
async function main(){
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 for(const f of fs.readdirSync(root+'/database/migrations').filter(f=>/^000[0-7].*sql$/.test(f)).sort())await apply(f);
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),outsider=randomUUID(),company=randomUUID(),campaign=randomUUID(),g0=randomUUID(),g1=randomUUID(),lead=randomUUID(),pending=randomUUID(),state=randomUUID();
 for(const id of [master,co,observer,outsider])await sql`INSERT INTO auth.users VALUES(${id},'test@example.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by)VALUES(${company},'Test',${master})`;
 await sql`INSERT INTO campaigns(id,company_id,name,created_by)VALUES(${campaign},${company},'Test',${master})`;
 for(const [id,role]of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role)VALUES(${campaign},${id},${role})`;
 for(const [id,n]of [[g0,0],[g1,1]])await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${id},${campaign},${n},'Game')`;
 for(const [id,key,unit]of [[lead,'lead_time','días'],[pending,'inventory','u']])await sql`INSERT INTO kpi_definitions(id,campaign_id,key,name,unit,precision,required,created_by)VALUES(${id},${campaign},${key},${key},${unit},2,true,${master})`;
 await sql.begin(async tx=>{
  await tx`INSERT INTO game_state_sets(id,game_id,campaign_id,phase,created_by,updated_by)VALUES(${state},${g0},${campaign},'preparation',${master},${master})`;
  await tx`INSERT INTO game_state_values(state_set_id,campaign_id,kpi_definition_id,value)VALUES(${state},${campaign},${lead},30)`;
  await tx`UPDATE game_state_sets SET revision=1 WHERE id=${state}`;
  await tx`INSERT INTO game_preparation_changes(operation_id,campaign_id,state_set_id,actor_id,operation,request_hash,previous_revision,revision,details)VALUES(${randomUUID()},${campaign},${state},${master},'save_values','legacy',0,1,'{}')`;
 });
 const auditBefore=await sql`SELECT * FROM game_preparation_changes`;
 await apply('0008_game_kpi_selection.sql');
 await apply('0009_ordinal_kpis.sql');
 assert.equal((await sql`SELECT count(*)::int n FROM game_kpis WHERE game_id=${g0}`)[0].n,2);
 assert.equal((await sql`SELECT count(*)::int n FROM game_kpis WHERE game_id=${g1}`)[0].n,0);
 assert.equal((await sql`SELECT value FROM game_state_values WHERE kpi_definition_id=${lead}`)[0].value,'30');
 assert.deepEqual(await sql`SELECT * FROM game_preparation_changes`,auditBefore);
 const repo=load(base+'/src/features/preparation/repositories/preparation.repository.ts'),manage=load(base+'/src/features/preparation/repositories/kpi-management.repository.ts');
 const mutation=async(gameId,operation,extra={},actor=master)=>{const d=await repo.readPreparation(gameId,actor);return manage.mutateKpi(actor,{gameId,operation,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,...extra});};
 let data=await repo.readPreparation(g0,master);assert.equal(data.definitions.find(d=>d.id===pending).required,true);assert(!data.values.some(v=>v.kpiId===pending));
 const newDef={key:'quality',name:'Calidad',unit:'%',precision:2,required:true,allowsNegative:false};
 await mutation(g0,'create_kpi',{definition:newDef});
 data=await repo.readPreparation(g0,master);const quality=data.catalog.find(d=>d.key==='quality').id;
 assert(data.definitions.some(d=>d.id===quality));assert(!(await repo.readPreparation(g1,master)).definitions.some(d=>d.id===quality));
 await mutation(g1,'add_kpi',{kpiId:quality,required:false},co);
 assert.equal((await repo.readPreparation(g1,master)).definitions.find(d=>d.id===quality).required,false);
 assert.equal((await repo.readPreparation(g0,master)).definitions.find(d=>d.id===quality).required,true);
 await mutation(g1,'set_required',{kpiId:quality,required:true});
 const save=async(gameId,values)=>{const d=await repo.readPreparation(gameId,master);return repo.writePreparation(master,{gameId,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,operation:'save_values',sourceId:null,values});};
 await save(g1,{[quality]:'45.25'});
 data=await repo.readPreparation(g1,master);const remove={gameId:g1,operation:'remove_kpi',kpiId:quality,confirmed:true,operationId:randomUUID(),expectedRevision:data.revision,catalogToken:data.catalogToken};
 const result=await manage.mutateKpi(master,remove);assert.equal(result.revision,data.revision+1);assert.equal((await manage.mutateKpi(master,remove)).replayed,true);
 assert.equal((await repo.readPreparation(g1,master)).values.length,0);assert((await repo.readPreparation(g0,master)).definitions.some(d=>d.id===quality));
 const removal=(await sql`SELECT details FROM game_preparation_changes WHERE operation_id=${remove.operationId}`)[0];assert.equal(removal.details.removedValue,'45.25');
 let edit={key:'lead_time',name:'Lead Time',unit:'semanas',precision:2,required:false,allowsNegative:false};
 await mutation(g0,'edit_kpi',{kpiId:lead,definition:edit,confirmed:true});
 assert.equal((await sql`SELECT value FROM game_state_values WHERE kpi_definition_id=${lead}`)[0].value,'30');
 assert.equal((await repo.readPreparation(g0,master)).definitions.find(d=>d.id===lead).required,true);
 await save(g0,{[lead]:'30.25',[quality]:'',[pending]:''});
 await assert.rejects(mutation(g0,'edit_kpi',{kpiId:lead,definition:{...edit,precision:0},confirmed:true}));
 await mutation(g0,'edit_kpi',{kpiId:lead,definition:{...edit,allowsNegative:true},confirmed:true});
 await save(g0,{[lead]:'-30.25',[quality]:'',[pending]:''});
 await assert.rejects(mutation(g0,'edit_kpi',{kpiId:lead,definition:edit,confirmed:true}));
 await assert.rejects(mutation(g0,'edit_kpi',{kpiId:lead,definition:{...edit,key:'quality'},confirmed:true}));
 const g1state=(await sql`SELECT id FROM game_state_sets WHERE game_id=${g1} AND phase='preparation'`)[0].id;
 await assert.rejects(sql`INSERT INTO game_state_values(game_id,state_set_id,campaign_id,kpi_definition_id,value)VALUES(${g1},${g1state},${campaign},${lead},1)`);
 await assert.rejects(mutation(g1,'add_kpi',{kpiId:lead},observer));
 await assert.rejects(mutation(g1,'add_kpi',{kpiId:lead},outsider));
 data=await repo.readPreparation(g1,master);const stale={gameId:g1,operation:'add_kpi',kpiId:lead,operationId:randomUUID(),expectedRevision:data.revision,catalogToken:data.catalogToken};
 await mutation(g1,'add_kpi',{kpiId:quality});await assert.rejects(manage.mutateKpi(master,stale));
 // Inject a late audit failure: association must roll back with it.
 await sql.unsafe("CREATE FUNCTION public.test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation='add_kpi' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_fail_audit BEFORE INSERT ON game_preparation_changes FOR EACH ROW EXECUTE FUNCTION test_fail_audit();");
 const beforeRollback=await repo.readPreparation(g1,master);
 await assert.rejects(mutation(g1,'add_kpi',{kpiId:lead}));
 assert.equal((await repo.readPreparation(g1,master)).revision,beforeRollback.revision);assert(!(await repo.readPreparation(g1,master)).definitions.some(d=>d.id===lead));
 await sql.unsafe('DROP TRIGGER test_fail_audit ON game_preparation_changes; DROP FUNCTION public.test_fail_audit();');
 // A different active game does not block configuration of a draft game.
 await sql`UPDATE games SET status='active' WHERE id=${g0}`;
 await mutation(g1,'add_kpi',{kpiId:lead,required:false});
 await assert.rejects(mutation(g1,'edit_kpi',{kpiId:lead,definition:edit,confirmed:true}));
 await sql`UPDATE games SET status='draft' WHERE id=${g0}`;
 // Each historical phase freezes meaning, even if a current value later disappears.
 for(const phase of ['initial','current','final']){
  const historicalGame=randomUUID(),snapshot=randomUUID();
  await sql`INSERT INTO games(id,campaign_id,sequence,name)VALUES(${historicalGame},${campaign},${10+['initial','current','final'].indexOf(phase)},'Historical')`;
  await mutation(historicalGame,'add_kpi',{kpiId:quality});
  await sql.begin(async tx=>{await tx`INSERT INTO game_state_sets(id,game_id,campaign_id,phase,created_by,updated_by)VALUES(${snapshot},${historicalGame},${campaign},${phase},${master},${master})`;await tx`INSERT INTO game_state_values(game_id,state_set_id,campaign_id,kpi_definition_id,value)VALUES(${historicalGame},${snapshot},${campaign},${quality},10)`;if(phase!=='current')await tx`UPDATE game_state_sets SET frozen_at=now() WHERE id=${snapshot}`;});
  await assert.rejects(sql`UPDATE kpi_definitions SET unit='other' WHERE id=${quality}`);
  await assert.rejects(sql`DELETE FROM kpi_definitions WHERE id=${quality}`);
  await assert.rejects(sql`DELETE FROM game_kpis WHERE game_id=${historicalGame} AND kpi_definition_id=${quality}`);
  if(phase==='current'){await sql`DELETE FROM game_state_values WHERE state_set_id=${snapshot}`;await assert.rejects(sql`UPDATE kpi_definitions SET historical_used_at=NULL WHERE id=${quality}`);}
 }
 // Catalog deletion requires no associations; old audits remain.
 await mutation(g0,'remove_kpi',{kpiId:pending,confirmed:true});
 await mutation(g0,'delete_kpi',{kpiId:pending,confirmed:true});
 assert.equal((await sql`SELECT count(*)::int n FROM kpi_definitions WHERE id=${pending}`)[0].n,0);
 for(const role of ['anon','authenticated'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await sql`SELECT has_table_privilege(${role},'public.game_kpis',${privilege}) allowed`)[0].allowed,false);

 // Regression: numeric validation, immutable audit and concurrent revision checks.
 const domain=load(base+'/src/features/preparation/domain/preparation.ts');
 for(const bad of ['NaN','Infinity','1e3','1.234','-1'])assert.throws(()=>domain.normalizeValue(bad,{name:'X',precision:2,allowsNegative:false}));
 assert.equal(domain.normalizeValue('',{name:'X',precision:2,allowsNegative:false}),null);
 await assert.rejects(sql`UPDATE game_preparation_changes SET request_hash='changed'`);
 await assert.rejects(sql`DELETE FROM game_preparation_changes`);
 const g1data=await repo.readPreparation(g1,master);
 const values=Object.fromEntries(g1data.definitions.map(d=>[d.id,'10']));
 const concurrent=await Promise.allSettled([master,co].map(actor=>repo.writePreparation(actor,{gameId:g1,operationId:randomUUID(),expectedRevision:g1data.revision,catalogToken:g1data.catalogToken,operation:'save_values',sourceId:null,values})));
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);assert.equal(concurrent.filter(r=>r.status==='rejected').length,1);
 await assert.rejects(sql`UPDATE game_state_values SET value=11 WHERE state_set_id=${g1state}`);
 console.log('PASS: all 18 requested scenarios; backfill; pending values; per-game required; isolation; idempotence; rollback; history; RLS.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>sql.end());
