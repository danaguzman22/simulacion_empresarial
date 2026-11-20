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
let sessionActor=null;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const source=fs.readFileSync(file,"utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Date, console, require: (name) => {
    if (name === "server-only") return {};
    if (name === "next/link") return { default: ({children,...props}) => localRequire("react").createElement("a",props,children) };
    if (name === "next/navigation") return { redirect(){throw new Error("redirect");}, notFound(){throw new Error("not-found");} };
    if (name === "next/cache") return { revalidatePath() {} };
    if (name === "@/features/auth/application/get-authenticated-user-id") return {getAuthenticatedUserId:async()=>sessionActor};
    if (name === "@/db") return { db };
    if (name === "@/db/schema") return load(base + "/src/db/schema/index.ts");
    if (name.startsWith("@/")) return load(base+"/src/"+name.slice(2)+".ts");
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + (fs.existsSync(path.resolve(path.dirname(file), name + ".ts")) ? ".ts" : ".tsx")));
    return localRequire(name);
  } }, { filename: file });
  return exports;
}

// #35: the dashboard notice wall carries only public data, for every viewer, with the same access rules.
async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 const migrate=async file=>sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^﻿/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort())await migrate(file);
 // Not about D-33: games created here start with optional goals.
 await sql.unsafe("ALTER TABLE games ALTER COLUMN goals_required SET DEFAULT false");
 const master=randomUUID(),observer=randomUUID(),participant=randomUUID(),outsider=randomUUID(),company=randomUUID(),campaign=randomUUID();
 for(const [id,email] of [[master,'wall-master@test.test'],[observer,'wall-observer@test.test'],[participant,'wall-student@test.test'],[outsider,'wall-outsider@test.test']])await sql`INSERT INTO auth.users VALUES(${id},${email},'{}')`;
 const institution=await require('./institution-fixture.cjs')(sql,[master,observer,participant],master);
 await sql`INSERT INTO companies(id,name,created_by,institution_id) VALUES(${company},'Wall',${master},${institution})`;
 await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${campaign},${company},'Campaign',${master})`;
 for(const [id,role] of [[master,'master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${campaign},${id},${role})`;
 const module=name=>load(base+'/src/features/'+name+'.ts');
 const games=module('games/repositories/game.repository'),start=module('games/repositories/start-game.repository'),lifecycle=module('games/repositories/game-lifecycle.repository');
 const prep=module('preparation/repositories/preparation.repository'),manage=module('preparation/repositories/kpi-management.repository'),periods=module('rounds/repositories/period-configuration.repository');
 const rounds=module('rounds/repositories/round.repository'),rules=module('rules/repositories/rule.repository'),situations=module('situations/repositories/situation.repository');
 const kpiRepo=module('kpis/repositories/game-kpi.repository'),cards=module('cards/repositories/card.repository'),assignments=module('students/repositories/assignment.repository');
 const dashboards=module('dashboard/repositories/dashboard.repository');

 const game=(await games.createGame({campaignId:campaign,profileId:master,name:'Game',type:'custom'})).game.id;
 let d=await prep.readPreparation(game,master);
 await manage.mutateKpi(master,{gameId:game,operationId:randomUUID(),operation:'create_kpi',definition:{key:'cash',name:'Fondos',unit:'ARS',precision:0,required:true,allowsNegative:true,valueType:'numeric',ordinalOptions:[]},expectedRevision:d.revision,catalogToken:d.catalogToken});
 d=await prep.readPreparation(game,master);const cash=d.definitions[0].id;
 await prep.writePreparation(master,{gameId:game,operationId:randomUUID(),operation:'save_values',expectedRevision:d.revision,catalogToken:d.catalogToken,sourceId:null,values:{[cash]:'1000'}});
 await periods.savePeriodConfiguration(master,{gameId:game,operationId:randomUUID(),expectedRevision:0,count:2,label:'Semana',durationSeconds:600});
 // Rules: one visible with a public message, one Master-only.
 const rule=(name,visibility,displayMessage,position)=>({name,description:'Costo',triggerType:'round_end',enabled:true,position,visibility,displayMessage,effects:[{kpiId:cash,amount:'-5'}]});
 await rules.mutateRule(master,{gameId:game,ruleId:randomUUID(),operation:'create',definition:rule('Mantenimiento','display','Se cobró el mantenimiento semanal',0)});
 await rules.mutateRule(master,{gameId:game,ruleId:randomUUID(),operation:'create',definition:rule('REGLA-OCULTA','master_only','MENSAJE-OCULTO',1)});
 // A participant with a card (its private and secret texts must never reach the wall).
 const scope={kind:'campaign',id:campaign};
 await cards.saveCard(scope,master,{fields:{name:'Finanzas',department:'Finanzas',description:'Equipo',responsibilities:'Cuentas',publicInformation:'PUBLIC-CARD',visualIdentity:'',privateInformation:'PRIVATE-CARD',individualObjective:'GOAL-CARD',secretObjective:'SECRET-CARD'},structure:{configuredModifiers:[],abilities:[],weaknesses:[],restrictions:[]}});
 await cards.addCardToGame(game,master,(await cards.readCards(scope,master)).cards[0].id);
 const card=(await cards.readCards({kind:'game',id:game},master)).cards[0].id;
 await assignments.changeAssignment(master,{gameId:game,cardId:card,email:'wall-student@test.test',operation:'add',assignmentId:'',expectedRevision:0});
 d=await prep.readPreparation(game,master);
 await start.startGame(master,{gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:1});
 const round=async()=>(await rounds.readRounds(game,master)).rounds.find(r=>r.status==='active'||r.status==='pending');
 let r=await round();await rounds.mutateRound(master,{gameId:game,roundId:r.id,operation:'start',operationId:randomUUID(),expectedRevision:r.revision});
 // Notices: Master notice (no effects), visible situation with an effect, Master-only situation with an effect, manual change.
 const revision=async()=>(await sql`SELECT revision FROM game_state_sets WHERE game_id=${game} AND phase='current'`)[0].revision;
 const publish=async(title,description,visibility,effects)=>situations.publishSituation(master,{gameId:game,operationId:randomUUID(),expectedRevision:await revision(),title,description,visibility,effects});
 await publish('Aviso general','Traigan las planillas','display',[]);
 await publish('Nuevo socio','Ingresa capital','display',[{kpiId:cash,amount:'200'}]);
 await publish('SITUACION-OCULTA','DETALLE-OCULTO','master_only',[{kpiId:cash,amount:'-333'}]);
 const controls=await kpiRepo.readGameKpiControls(game,master);r=await round();
 await kpiRepo.updateGameKpi(master,{gameId:game,operationId:randomUUID(),kpiDefinitionId:cash,roundId:r.id,expectedRevision:controls.revision,expectedRoundRevision:controls.activeRoundRevision,rawValue:'777'});
 r=await round();await rounds.mutateRound(master,{gameId:game,roundId:r.id,operation:'finish',operationId:randomUUID(),expectedRevision:r.revision});

 // Every viewer gets the same public wall; outsiders get nothing.
 const board=await dashboards.readDashboard(game,participant);assert.equal(board.viewer,'participant');
 const wall=JSON.parse(JSON.stringify(board.wall));
 assert.deepEqual(wall.map(i=>i.kind).sort(),['master_change','notice','rule','situation']);
 assert.deepEqual(wall.find(i=>i.kind==='notice'),{...wall.find(i=>i.kind==='notice'),title:'Aviso general',body:'Traigan las planillas',effects:[]});
 assert.deepEqual(wall.find(i=>i.kind==='situation').effects,[{kpi:'Fondos',before:'1.000 ARS',after:'1.200 ARS'}]);
 assert.equal(wall.find(i=>i.kind==='rule').title,'Se cobró el mantenimiento semanal');
 assert.deepEqual(wall.find(i=>i.kind==='master_change').effects,[{kpi:'Fondos',before:'867 ARS',after:'777 ARS'}]);
 assert(wall.every(i=>i.periodLabel==='Semana 1'));
 const payload=JSON.stringify(board);
 for(const hidden of ['SITUACION-OCULTA','DETALLE-OCULTO','REGLA-OCULTA','MENSAJE-OCULTO','-333','867 ARS → 534','PRIVATE-CARD','SECRET-CARD','GOAL-CARD',master,observer,'wall-master@','wall-student@'])
  assert(!payload.includes(hidden),'the dashboard must not carry '+hidden);
 for(const actor of [master,observer])assert.deepEqual(JSON.parse(JSON.stringify((await dashboards.readDashboard(game,actor)).wall)),wall,'staff sees the same public wall');
 assert.equal(await dashboards.readDashboard(game,outsider),null);
 console.log('PASS wall: Master notice, visible situation and rule, Master change; Master-only items, card texts and actors never travel; same wall for every viewer');

 // A Reset discards the run: the wall starts empty again.
 await lifecycle.resetGame(master,{gameId:game,operationId:randomUUID()});
 assert.deepEqual(JSON.parse(JSON.stringify((await dashboards.readDashboard(game,master)).wall)),[]);
 console.log('PASS wall after Reset: discarded notices never show');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
