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

async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 const migrate=async file=>sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^\uFEFF/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort())await migrate(file);
 // Not about D-33 (0033): games created here start with optional goals, as before 0033.
 await sql.unsafe("ALTER TABLE games ALTER COLUMN goals_required SET DEFAULT false");
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'goals@test.test','{}')`;
 const institution=await require('./institution-fixture.cjs')(sql,[master,co,observer],master);
 await sql`INSERT INTO companies(id,name,created_by,institution_id) VALUES(${company},'Goals',${master},${institution})`;
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



 const assignments=module('students/repositories/assignment.repository'), students=module('students/repositories/student.repository'), cards=module('cards/repositories/card.repository');
 const s1=randomUUID(),s2=randomUUID(),s3=randomUUID();
 for(const [id,email]of [[s1,'one@test.test'],[s2,'two@test.test'],[s3,'three@test.test']])await sql`insert into auth.users values(${id},${email},'{"role":"master"}')`;
 assert.equal((await sql`select * from campaign_members where profile_id=${s1}`).length,0);
 assert.equal(await module('auth/repositories/teacher-access.repository').isTeacherAccount(s1),false);
 await assert.rejects(module('companies/repositories/company.repository').createCompany({name:'Escalation',createdBy:s1}));
 assert.equal(await module('auth/repositories/teacher-access.repository').isTeacherAccount(master),true);
 assert.equal((await students.listAssignedGames(s1)).length,0);
 for(const profile of [s1,s2,s3])await sql`insert into institution_members(institution_id,profile_id,granted_by) values(${institution},${profile},${master})`;
 const a=await fixture(),b=await fixture();
 async function makeCard(f,name){
  const scope={kind:'campaign',id:f.campaign};
  const fields={name,department:name,description:'Shared',responsibilities:'Coordinate',publicInformation:'PUBLIC-'+name,visualIdentity:name,privateInformation:'PRIVATE-'+name,individualObjective:'PUBLIC-GOAL-'+name,secretObjective:'SECRET-'+name};
  await cards.saveCard(scope,master,{fields,structure:{configuredModifiers:[],abilities:[],weaknesses:[],restrictions:[{name:'Restriction',description:'PRIVATE-RESTRICTION-'+name,condition:'',visibility:'private'}]}});
  const base=(await cards.readCards(scope,master)).cards.find(c=>c.name===name);
  await cards.addCardToGame(f.game,master,base.id);
  return (await cards.readCards({kind:'game',id:f.game},master)).cards.find(c=>c.name===name).id;
 }
 const engineering=await makeCard(a,'Engineering'),finance=await makeCard(a,'Finance'),other=await makeCard(b,'Other');
 // #71: departments without members are a non-blocking warning next to the start button.
 const setupRepo=module('games/repositories/game-setup.repository');const teamWarnings=async()=>{const r=await setupRepo.readGameSetup(a.game,master);return {warnings:[...r.warnings],missing:[...r.missing],equipos:r.complete.equipos};};
 let teams=await teamWarnings();assert.deepEqual(teams.warnings,['Estos departamentos no tienen integrantes: Engineering, Finance.']);assert(!teams.missing.some(m=>/integrantes/.test(m)));assert.equal(teams.equipos,false);
 const add=(f,cardId,email,actor=master)=>assignments.changeAssignment(actor,{gameId:f.game,cardId,email,operation:'add',assignmentId:'',expectedRevision:0});
 await add(a,engineering,'ONE@test.test');await add(a,engineering,'two@test.test');await add(a,engineering,'one@test.test');
 teams=await teamWarnings();assert.deepEqual(teams.warnings,['Estos departamentos no tienen integrantes: Finance.']);
 assert.equal((await assignments.readParticipants(a.game,master)).members.length,2);
 await assert.rejects(add(a,finance,'one@test.test'));
 await assert.rejects(add(a,other,'three@test.test'));
 for(const actor of [s1,co,observer])await assert.rejects(add(a,finance,'three@test.test',actor));
 await assert.rejects(assignments.readParticipants(a.game,s1));
 await assert.rejects(cards.readCards({kind:'game',id:a.game},s1));
 await assert.rejects(start.startGame(s1,{gameId:a.game,operationId:randomUUID(),expectedRevision:0,catalogToken:'',expectedPeriodRevision:1}));
 assert.equal(await students.readAssignedCard(a.game,s1),null,'prestart card not read');
 // #32 dashboard access: staff always; an assigned participant only once the game started.
 const dashboards=module('dashboard/repositories/dashboard.repository');
 assert.equal(await dashboards.readDashboard(a.game,s1),null,'prestart dashboard not readable by participants');
 assert.equal((await dashboards.readDashboard(a.game,master)).viewer,'staff');
 assert.equal((await students.listAssignedGames(s1))[0].department,null,'prestart department not disclosed');
 sessionActor=s1;
 const action=module('students/application/assignment-actions');
 const attempted=await action.saveAssignment({},new Map(Object.entries({gameId:a.game,cardId:finance,email:'three@test.test',operation:'add',actorId:master})));
 assert(!attempted.message.includes('actualizados'));
 const accessStudent=module('students/application/student-access');
 await assert.rejects(accessStudent.getStudentCard('not-a-uuid'),/not-found/);
 sessionActor=null;await assert.rejects(accessStudent.getStudentGames(),/redirect/);
 console.log('PASS registration profile, no elevation, no assignments, multi-member unique assignment, cross-game and admin denials, no premature disclosure');
 await startGame(a.game);
 let detail=await students.readAssignedCard(a.game,s1);
 for(const actor of [master,co,observer])assert.equal((await dashboards.readDashboard(a.game,actor)).viewer,'staff');
 const board=await dashboards.readDashboard(a.game,s1);assert.equal(board.viewer,'participant');assert.equal(board.game.id,a.game);assert(Array.isArray(board.periods)&&board.periods.length>0);
 // #33: the dashboard carries the game's KPIs (values from the current state), also for participants.
 assert.deepEqual(JSON.parse(JSON.stringify(board.kpis.map(k=>[k.name,k.current.display,k.series.map(p=>p.label)]))),[['Fondos','128.135,00 ARS',['Inicio']],['Inventario','Medio',['Inicio']]]);
 assert.equal(await dashboards.readDashboard(a.game,s3),null,'a member without a card in this game cannot read it');
 assert.equal(await dashboards.readDashboard(a.game,randomUUID()),null,'outsiders cannot read it');
 const boardPayload=JSON.stringify(board);for(const hidden of ['PRIVATE-','SECRET-','PUBLIC-GOAL-','Engineering','one@test.test'])assert(!boardPayload.includes(hidden),'dashboard must not carry '+hidden);
 assert.equal(detail.card.id,engineering);assert.equal(detail.teammates.length,2);
 assert.equal(detail.clock.period,null,'no period running yet: no countdown');assert(!Number.isNaN(Date.parse(detail.clock.serverNow)));
 const payload=JSON.stringify(detail);assert(!payload.includes('SECRET-'));assert(!payload.includes('secretObjective'));assert(!payload.includes('Finance'));assert(payload.includes('PRIVATE-RESTRICTION-Engineering'));
 assert.equal(await students.readAssignedCard(b.game,s1),null);
 await add(b,other,'one@test.test');await startGame(b.game);
 assert.equal((await students.listAssignedGames(s1)).length,2);
 assert.equal((await students.readAssignedCard(b.game,s1)).card.id,other);
 await add(a,finance,'three@test.test');
 assert.equal((await students.readAssignedCard(a.game,s3)).card.id,finance);
 let roster=await assignments.readParticipants(a.game,master),member=roster.members.find(m=>m.cardId===finance);
 const move={gameId:a.game,cardId:engineering,email:'',assignmentId:member.id,expectedRevision:member.revision,operation:'move'};
 await assignments.changeAssignment(master,move);
 await assert.rejects(assignments.changeAssignment(master,move),/Recarg/);
 assert.equal((await students.readAssignedCard(a.game,s3)).card.id,engineering);
 await assignments.changeAssignment(master,{...move,operation:'remove',expectedRevision:member.revision+1});
 assert.equal(await students.readAssignedCard(a.game,s3),null);
 console.log('PASS active shared reads, exact privacy projection, multiple games, late assignment, correction/removal and stale revision');
 const before=JSON.stringify(await sql`select * from game_card_assignments where game_id=${a.game} order by id`);
 await lifecycle.resetGame(master,{gameId:a.game,operationId:randomUUID()});
 assert.equal(JSON.stringify(await sql`select * from game_card_assignments where game_id=${a.game} order by id`),before);
 assert.equal(await students.readAssignedCard(a.game,s1),null);
 await startGame(a.game);await roundAction(a.game,'start');
 // Clock: the server sends the period end time and its own time; the browser only counts down from them.
 detail=await students.readAssignedCard(a.game,s1);let period=(await rounds.readRounds(a.game,master)).rounds[0];
 assert.deepEqual({...detail.clock.period},{label:'Semana 1',name:period.name,status:'active',endsAt:period.endsAt,remainingMs:null});
 assert(Date.parse(detail.clock.serverNow)<Date.parse(detail.clock.period.endsAt));
 await roundAction(a.game,'pause');detail=await students.readAssignedCard(a.game,s1);period=(await rounds.readRounds(a.game,master)).rounds[0];
 assert.equal(detail.clock.period.status,'paused');assert.equal(detail.clock.period.remainingMs,period.remainingMs);assert(period.remainingMs>0);
 assert.equal(await students.readAssignedCard(a.game,s3),null,'no card, so no clock either');
 await roundAction(a.game,'finish');
 detail=await students.readAssignedCard(a.game,s1);assert.equal(detail.game.status,'evaluation');assert.equal(detail.clock.period,null,'finished periods show no countdown');
 await assert.rejects(add(a,finance,'three@test.test'));
 await lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()});
 assert.equal((await students.readAssignedCard(a.game,s1)).game.status,'completed');
 await assert.rejects(add(a,finance,'three@test.test'));
 const successor=(await games.createGame({campaignId:a.campaign,profileId:master,name:'Successor',type:'custom'})).game.id;
 assert.equal((await assignments.readParticipants(successor,master)).members.length,0);
 const inherited=(await cards.readCards({kind:'game',id:successor},master)).cards;
 assert.equal(inherited.length,2);
 await add({game:successor},inherited[0].id,'one@test.test');
 await lifecycle.deleteGame(master,{gameId:successor,operationId:randomUUID()});
 assert.equal((await sql`select * from game_card_assignments where game_id=${successor}`).length,0);
 assert.equal((await students.readAssignedCard(a.game,s1)).card.id,engineering);
 console.log('PASS Reset retains assignments but hides preparation; evaluation/completed read-only; successor copies no students; Delete cascades');
 for(const role of ['anon','authenticated']) {
  const [p]=await sql`select has_table_privilege(${role},'public.game_card_assignments','SELECT,INSERT,UPDATE,DELETE') as allowed,has_function_privilege(${role},'public.find_registered_profile_by_email(text)','EXECUTE') as lookup`;
  assert.equal(p.allowed,false);assert.equal(p.lookup,false);
 }
 assert.equal((await sql`select relrowsecurity from pg_class where oid='public.game_card_assignments'::regclass`)[0].relrowsecurity,true);
 await assert.rejects(sql`insert into game_card_assignments(game_id,campaign_id,card_id,profile_id,updated_by) values(${b.game},${b.campaign},${engineering},${s3},${master})`);
 assert.equal((await sql`select * from game_card_assignments where game_id=${a.game}`).length,2);
 console.log('PASS RLS/privileges and composite FK prevent cross-campaign assignment');
}
main().then(()=>sql.end()).catch(async error=>{console.error(error);await sql.end();process.exitCode=1;});
