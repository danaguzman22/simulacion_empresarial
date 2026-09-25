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
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))<31).sort())await migrate(file);
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'goals@test.test','{}')`;
 const institution=await require('./institution-fixture.cjs')(sql,[master,co,observer],master);
 await sql`INSERT INTO companies(id,name,created_by,institution_id) VALUES(${company},'Goals',${master},${institution})`;
 const oldCampaign=randomUUID(),oldGame=randomUUID(),oldBase=randomUUID(),oldCard=randomUUID();
 await sql`insert into campaigns(id,company_id,name,created_by) values(${oldCampaign},${company},'Old campaign',${master})`;
 await sql`insert into games(id,campaign_id,sequence,name) values(${oldGame},${oldCampaign},0,'Old game')`;
 await sql`insert into campaign_role_cards(id,campaign_id,name,created_by,updated_by) values(${oldBase},${oldCampaign},'Old card',${master},${master})`;
 await sql`insert into game_role_cards(id,game_id,campaign_id,source_card_id,name,secret_objective,created_by,updated_by) values(${oldCard},${oldGame},${oldCampaign},${oldBase},'Old card','OLD SECRET',${master},${master})`;
 const before31=await sql`select to_jsonb(c) as row from game_role_cards c where id=${oldCard}`;
 await migrate('0031_card_secret_reveals.sql');
 assert.deepEqual(await sql`select to_jsonb(c)-'secret_reveal_limit'-'secret_reveal_seconds' as row from game_role_cards c where id=${oldCard}`,before31);
 assert.equal((await sql`select secret_reveal_limit from game_role_cards where id=${oldCard}`)[0].secret_reveal_limit,null);
 console.log('PASS upgrade 0030 -> 0031 preserves every existing card field and revision; no retrospective configuration');
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



 const cards=module('cards/repositories/card.repository'),assignment=module('students/repositories/assignment.repository'),students=module('students/repositories/student.repository'),secrets=module('secrets/repositories/reveal.repository');
 const s1=randomUUID(),s2=randomUUID(),s3=randomUUID();
 for(const [id,email]of [[s1,'one@test.test'],[s2,'two@test.test'],[s3,'three@test.test']]){await sql`insert into auth.users values(${id},${email},'{}')`;await sql`insert into institution_members(institution_id,profile_id,granted_by) values(${institution},${id},${master})`;}
 const a=await fixture(),b=await fixture(1);
 async function makeCard(f,name){const scope={kind:'campaign',id:f.campaign};await cards.saveCard(scope,master,{fields:{name,department:name,description:'Shared',responsibilities:'Coordinate',publicInformation:'Public',visualIdentity:name,privateInformation:'Private',individualObjective:'Public goal',secretObjective:'SECRET-'+name}});const base=(await cards.readCards(scope,master)).cards.find(c=>c.name===name);await cards.addCardToGame(f.game,master,base.id);return (await cards.readCards({kind:'game',id:f.game},master)).cards.find(c=>c.name===name);}
 const engineering=await makeCard(a,'Engineering'),finance=await makeCard(a,'Finance'),other=await makeCard(b,'Other');
 const assign=(f,card,email)=>assignment.changeAssignment(master,{gameId:f.game,cardId:card.id,email,operation:'add',assignmentId:'',expectedRevision:0});
 await assign(a,engineering,'one@test.test');await assign(a,engineering,'two@test.test');await assign(a,finance,'three@test.test');await assign(b,other,'three@test.test');
 assert.equal(engineering.secretRevealLimit,2);assert.equal(engineering.secretRevealSeconds,10);
 for(const actor of [co,observer,s1])await assert.rejects(secrets.configureReveals(actor,{gameId:a.game,cardId:engineering.id,revision:0,limit:2,seconds:10}));
 await secrets.configureReveals(master,{gameId:a.game,cardId:engineering.id,revision:0,limit:2,seconds:10});
 await assert.rejects(secrets.configureReveals(master,{gameId:a.game,cardId:engineering.id,revision:0,limit:1,seconds:1}));
 assert.equal((await secrets.revealSecret(s1,a.game,randomUUID())).status,'closed');
 await startGame(a.game);await startGame(b.game);
 await assert.rejects(secrets.configureReveals(master,{gameId:a.game,cardId:engineering.id,revision:1,limit:4,seconds:10}));
 for(const actor of [master,co,observer])await assert.rejects(secrets.revealSecret(actor,a.game,randomUUID()));
 await assert.rejects(secrets.revealSecret(s1,b.game,randomUUID()));
 const op=randomUUID(),first=await secrets.revealSecret(s1,a.game,op);assert.equal(first.status,'revealed');assert.equal(first.text,'SECRET-Engineering');assert(first.remainingMs>0&&first.remainingMs<=10000);
 const [stored]=await sql`select * from card_secret_reveals where operation_id=${op}`;
 assert.equal(new Date(stored.expires_at)-new Date(stored.started_at),10000);
 const replay=await secrets.revealSecret(s1,a.game,op);assert.equal(replay.status,'revealed');assert.equal(replay.expiresAt,first.expiresAt);
 const restored=await secrets.revealSecret(s1,a.game);assert.equal(restored.status,'revealed');assert(restored.remainingMs<=first.remainingMs);assert.equal(restored.operationId,op);
 assert.equal((await secrets.revealSecret(s2,a.game)).status,'expired','peer cannot recover another actor window');
 await assert.rejects(secrets.revealSecret(s2,a.game,op));await assert.rejects(secrets.revealSecret(s3,a.game,op));
 assert.equal((await secrets.revealSecret(s1,a.game,randomUUID())).status,'already-open');
 for(const actor of [s1,s2]){const d=await students.readAssignedCard(a.game,actor);assert.equal(d.reveal.used,1);assert(!JSON.stringify(d).includes('SECRET-'));assert(!('secretObjective' in d.card));}
 assert.equal((await students.readAssignedCard(a.game,s3)).reveal.used,0);
 await assert.rejects(sql`update card_secret_reveals set expires_at=expires_at+interval '1 hour' where operation_id=${op}`);
 await assert.rejects(sql`delete from card_secret_reveals where operation_id=${op}`);
 console.log('PASS configuration/defaults/roles/stale revision; shared consumption; only actor sees text; refresh/replay do not extend or consume; normal payload never contains secret');
 // Wait for the actual PostgreSQL clock, without modifying recorded timestamps.
 await new Promise(resolve=>setTimeout(resolve,10200));
 assert.equal((await secrets.revealSecret(s1,a.game)).status,'expired');assert.equal((await secrets.revealSecret(s1,a.game,op)).status,'expired');
 assert.equal((await students.readAssignedCard(a.game,s1)).reveal.used,1);
 const race=await Promise.all([secrets.revealSecret(s1,a.game,randomUUID()),secrets.revealSecret(s2,a.game,randomUUID())]);
 assert.equal(race.filter(r=>r.status==='revealed').length,1);assert.equal(race.filter(r=>r.status==='exhausted').length,1);
 assert.equal((await students.readAssignedCard(a.game,s2)).reveal.used,2);
 await assert.rejects(sql`insert into card_secret_reveals(game_id,campaign_id,card_id,actor_id,operation_id,expires_at) values(${a.game},${a.campaign},${engineering.id},${s1},${randomUUID()},clock_timestamp()+interval '1 day')`);
 console.log('PASS real 10-second expiry; expired replay never returns text; two simultaneous students cannot consume the last use twice; DB also enforces quota');
 const settings=(await sql`select secret_reveal_limit,secret_reveal_seconds,revision from game_role_cards where id=${engineering.id}`)[0];
 await lifecycle.resetGame(master,{gameId:a.game,operationId:randomUUID()});
 assert.equal((await sql`select * from card_secret_reveals where card_id=${engineering.id} and discarded_at is not null`).length,2);
 assert.equal((await secrets.revealSecret(s1,a.game,randomUUID())).status,'closed');
 assert.deepEqual((await sql`select secret_reveal_limit,secret_reveal_seconds,revision from game_role_cards where id=${engineering.id}`)[0],settings);
 await startGame(a.game);assert.equal((await students.readAssignedCard(a.game,s1)).reveal.used,0);
 assert.equal((await secrets.revealSecret(s1,a.game,op)).status,'expired','discarded operation is never reused');
 const newUse=await secrets.revealSecret(s1,a.game,randomUUID());assert.equal(newUse.status,'revealed');
 await sql`update games set status='paused' where id=${a.game}`;
 assert.equal((await secrets.revealSecret(s1,a.game)).status,'closed');
 await sql`update games set status='active' where id=${a.game}`;
 assert.equal((await secrets.revealSecret(s1,a.game)).expiresAt,newUse.expiresAt,'pause does not extend deadline');
 await roundAction(a.game,'start');await roundAction(a.game,'finish');assert.equal((await secrets.revealSecret(s1,a.game)).status,'closed');await lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()});
 assert.equal((await secrets.revealSecret(s2,a.game,randomUUID())).status,'closed');
 assert.equal((await sql`select * from card_secret_reveals where card_id=${engineering.id}`).length,3);
 const successor=(await games.createGame({campaignId:a.campaign,profileId:master,name:'Successor',type:'custom'})).game.id;
 const next=(await cards.readCards({kind:'game',id:successor},master)).cards.find(c=>c.name==='Engineering');assert.equal(next.secretRevealLimit,2);assert.equal(next.secretRevealSeconds,10);assert.notEqual(next.id,engineering.id);
 assert.equal((await sql`select * from card_secret_reveals where game_id=${successor}`).length,0);
 await assign({game:successor},next,'one@test.test');await startGame(successor);assert.equal((await students.readAssignedCard(successor,s1)).reveal.used,0);assert.equal((await secrets.revealSecret(s1,successor,randomUUID())).status,'revealed');
 await lifecycle.deleteGame(master,{gameId:successor,operationId:randomUUID()});assert.equal((await sql`select * from card_secret_reveals where game_id=${successor}`).length,0);
 await roundAction(b.game,'start');await new Promise(resolve=>setTimeout(resolve,1200));assert.equal((await secrets.revealSecret(s3,b.game,randomUUID())).status,'closed','expired lazy round cannot authorize new secret access');
 for(const role of ['anon','authenticated'])assert.equal((await sql`select has_table_privilege(${role},'public.card_secret_reveals','SELECT,INSERT,UPDATE,DELETE') as allowed`)[0].allowed,false);
 assert.equal((await sql`select relrowsecurity from pg_class where oid='public.card_secret_reveals'::regclass`)[0].relrowsecurity,true);
 console.log('PASS Reset discards consumption and preserves settings; completed history; successor fresh quota; Delete no orphans; paused/expired-lazy closure; RLS');
}
main().then(()=>sql.end()).catch(async e=>{console.error(e);await sql.end();process.exitCode=1;});
