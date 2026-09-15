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
  for (const file of fs.readdirSync(root + '/database/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await sql.begin(async tx => {
      for (const statement of fs.readFileSync(root + '/database/migrations/' + file, 'utf8').replace(/^\uFEFF/, '').split('--> statement-breakpoint')) {
        if (statement.trim()) await tx.unsafe(statement);
      }
    });
  }
  const master = randomUUID(), co = randomUUID(), observer = randomUUID(), company = randomUUID(), campaign = randomUUID();
  for (const id of [master, co, observer]) await sql`INSERT INTO auth.users VALUES(${id},'inheritance@test.test','{}')`;
  await sql`INSERT INTO companies(id,name,created_by) VALUES(${company},'Company',${master})`;
  await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${campaign},${company},'Campaign',${master})`;
  for (const [id, role] of [[master,'master'],[co,'co_master'],[observer,'observer']]) await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${campaign},${id},${role})`;
  const module = name => load(base + '/src/features/' + name + '.ts');
  const games = module('games/repositories/game.repository');
  const lifecycle = module('games/repositories/game-lifecycle.repository');
  const start = module('games/repositories/start-game.repository');
  const prep = module('preparation/repositories/preparation.repository');
  const manage = module('preparation/repositories/kpi-management.repository');
  const periods = module('rounds/repositories/period-configuration.repository');
  const rounds = module('rounds/repositories/round.repository');
  const create = (actor = master) => games.createGame({campaignId:campaign,profileId:actor,name:'Game',description:null,type:'custom'});
  const read = game => prep.readPreparation(game,master);
  async function request(game) { const d = await read(game); return {gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:(await periods.readPeriodConfiguration(game,master)).revision}; }
  async function mutate(game, change, actor = master) { return manage.mutateKpi(actor,{...await request(game),...change}); }
  async function save(game, changes = {}, actor = master) { const d = await read(game); return prep.writePreparation(actor,{...await request(game),operation:'save_values',sourceId:null,values:{...Object.fromEntries(d.definitions.map(k => [k.id,d.values.find(v => v.kpiId === k.id)?.value ?? ''])),...changes}}); }
  const values = (game, phase) => sql`SELECT kpi_definition_id,value,ordinal_key FROM game_state_values WHERE state_set_id=(SELECT id FROM game_state_sets WHERE game_id=${game} AND phase=${phase}) ORDER BY kpi_definition_id`;
  async function complete(game) {
    for (const row of (await rounds.readRounds(game,master)).rounds) {
      await rounds.mutateRound(master,{gameId:game,roundId:row.id,operation:'start',operationId:randomUUID(),expectedRevision:row.revision});
      const active = (await rounds.readRounds(game,master)).rounds.find(r => r.id === row.id);
      await rounds.mutateRound(master,{gameId:game,roundId:row.id,operation:'finish',operationId:randomUUID(),expectedRevision:active.revision});
    }
  }
  assert.equal((await create(observer)).status,'forbidden');
  const first = (await create()).game.id;
  assert.equal((await read(first)).source,null);
  await assert.rejects(create(),/Finaliz/);
  const definitions = [
    {key:'cash_available',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]},
    {key:'inventory_level',name:'Inventario',unit:'nivel',precision:0,required:true,allowsNegative:false,valueType:'ordinal',ordinalOptions:[{key:'low',label:'Bajo',position:0},{key:'medium',label:'Medio',position:1}]},
    {key:'lead_time',name:'Lead Time',unit:'semanas',precision:1,required:true,allowsNegative:false,valueType:'numeric',ordinalOptions:[]}
  ];
  for (const definition of definitions) await mutate(first,{operation:'create_kpi',definition});
  let d = await read(first);
  const a = d.definitions.find(k => k.key === 'cash_available').id;
  const b = d.definitions.find(k => k.key === 'inventory_level').id;
  const c = d.definitions.find(k => k.key === 'lead_time').id;
  await save(first,{[a]:'7000',[b]:'low',[c]:'20'});
  const beforeRemove = (await read(first)).revision;
  await mutate(first,{operation:'remove_kpi',kpiId:c,confirmed:true});
  assert.equal((await read(first)).revision,beforeRemove + 1);
  assert(!(await values(first,'preparation')).some(v => v.kpi_definition_id === c));
  assert.equal((await sql`SELECT count(*)::int n FROM kpi_definitions WHERE id=${c}`)[0].n,1);
  await mutate(first,{operation:'add_kpi',kpiId:c,required:true});
  await save(first,{[c]:'20'});
  await periods.savePeriodConfiguration(master,{gameId:first,operationId:randomUUID(),expectedRevision:0,count:1,label:'Semana',durationSeconds:600});
  await start.startGame(master,await request(first));
  await complete(first);
  await assert.rejects(create(),/Finaliz/);
  await lifecycle.finishGame(master,{gameId:first,operationId:randomUUID()});
  const originalFinal = await values(first,'final');
  assert(originalFinal.some(v => v.value === '7000'));
  assert(originalFinal.some(v => v.value === '20'));
  assert(originalFinal.some(v => v.ordinal_key === 'low'));
  // A late failure during copying must leave neither game nor child/audit rows.
  const gameCount = (await sql`SELECT count(*)::int n FROM games`)[0].n;
  await sql.unsafe("CREATE FUNCTION fail_successor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM game_state_sets WHERE id=NEW.state_set_id AND source_state_set_id IS NOT NULL) THEN RAISE EXCEPTION 'copy failed'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_successor BEFORE INSERT ON game_state_values FOR EACH ROW EXECUTE FUNCTION fail_successor();");
  await assert.rejects(create());
  assert.equal((await sql`SELECT count(*)::int n FROM games`)[0].n,gameCount);
  await sql.unsafe('DROP TRIGGER fail_successor ON game_state_values; DROP FUNCTION fail_successor();');
  const concurrent = await Promise.allSettled([create(),create(co)]);
  assert.equal(concurrent.filter(r => r.status === 'fulfilled').length,1);
  const second = concurrent.find(r => r.status === 'fulfilled').value.game.id;
  d = await read(second);
  assert.equal(d.definitions.length,3);assert(d.definitions.every(k => k.inherited));assert.equal(d.canEdit,true);
  assert.equal((await prep.readPreparation(second,observer)).canEdit,false);
  assert.deepEqual(await values(second,'preparation'),originalFinal);
  assert.equal((await values(second,'initial')).length,0);
  assert.equal((await periods.readPeriodConfiguration(second,master)).revision,1);
  await mutate(second,{operation:'remove_kpi',kpiId:a,confirmed:true});
  assert(!(await read(second)).definitions.some(k=>k.id===a));
  assert(!(await values(second,'preparation')).some(v=>v.kpi_definition_id===a));
  assert.deepEqual(await values(first,'final'),originalFinal);
  await mutate(second,{operation:'add_kpi',kpiId:a,required:true});
  assert.equal((await read(second)).definitions.find(k=>k.id===a).origin,'inherited');
  assert.deepEqual(await values(second,'preparation'),originalFinal);
  await mutate(second,{operation:'set_required',kpiId:a,required:false});
  assert.equal((await read(second)).definitions.find(k=>k.id===a).required,false);
  await mutate(second,{operation:'set_required',kpiId:a,required:true});
  await assert.rejects(save(second,{[a]:'1'}),/heredado/);
  await assert.rejects(sql`DELETE FROM game_kpis WHERE game_id=${second} AND kpi_definition_id=${a}`);
  await assert.rejects(sql`UPDATE game_kpis SET required=false WHERE game_id=${second} AND kpi_definition_id=${a}`,/audited/);
  await assert.rejects(sql`UPDATE game_state_values SET value=1 WHERE game_id=${second} AND kpi_definition_id=${a}`,/Inherited|audited/);
  const localDefinition = {...definitions[0],key:'satisfaction',name:'Satisfaccion',unit:'puntos',required:false};
  await assert.rejects(mutate(second,{operation:'create_kpi',definition:localDefinition},observer));
  await mutate(second,{operation:'create_kpi',definition:localDefinition},co);
  const local = (await read(second)).definitions.find(k => k.key === 'satisfaction');assert.equal(local.inherited,false);
  await mutate(second,{operation:'set_required',kpiId:local.id,required:true},co);
  await save(second,{[local.id]:'88'},co);
  await mutate(second,{operation:'remove_kpi',kpiId:local.id,confirmed:true},co);
  assert.deepEqual(await values(second,'preparation'),originalFinal);
  assert.equal((await sql`SELECT count(*)::int n FROM kpi_definitions WHERE id=${local.id}`)[0].n,1);
  await mutate(second,{operation:'add_kpi',kpiId:local.id,required:true});
  await assert.rejects(sql`DELETE FROM game_kpis WHERE game_id=${second} AND kpi_definition_id=${local.id}`);
  await save(second,{[local.id]:'88'});
  await start.startGame(master,await request(second));
  for (const id of [a,local.id]) await assert.rejects(mutate(second,{operation:'remove_kpi',kpiId:id,confirmed:true}));
  assert.equal((await values(second,'initial')).length,4);
  const beforeReset = await values(second,'initial');
  const beforeSelection = await sql`SELECT kpi_definition_id,origin,required FROM game_kpis WHERE game_id=${second} ORDER BY kpi_definition_id`;
  await lifecycle.resetGame(master,{gameId:second,operationId:randomUUID()});
  assert.equal((await values(second,'current')).length,0);
  assert.equal((await values(second,'initial')).length,0);
  assert.deepEqual(await values(second,'preparation'),beforeReset);
  assert.deepEqual(await sql`SELECT kpi_definition_id,origin,required FROM game_kpis WHERE game_id=${second} ORDER BY kpi_definition_id`,beforeSelection);
  assert.equal((await read(second)).canEdit,true);
  await start.startGame(master,await request(second));
  assert.deepEqual(await values(second,'current'),beforeReset);
  await complete(second);await lifecycle.finishGame(master,{gameId:second,operationId:randomUUID()});
  const thirdInput = {gameId:second,operationId:randomUUID()};
  const third = (await lifecycle.restartCompletedGame(master,thirdInput)).gameId;
  assert.equal((await lifecycle.restartCompletedGame(master,thirdInput)).gameId,third);
  assert.equal((await read(third)).definitions.length,4);assert((await read(third)).definitions.every(k => k.inherited));
  assert.deepEqual(await values(third,'preparation'),await values(second,'final'));
  assert.deepEqual(await values(first,'final'),originalFinal);
  console.log('PASS: full A/B/C -> A/B/C + local D -> inherited A/B/C/D chain; numeric 7000/20 and ordinal low; catalogue preserved; local delete audited; inherited SQL/application protection; post-start protection; roles; evaluation gate; concurrent creation; rollback; shared successor retry.');
}
main().catch(e => { console.error(e);process.exitCode=1; }).finally(() => sql.end());
