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

// D-33 / 0033 (#71): "Obligatorio" switches for goals and rules. Games here keep the real defaults (goals required).
async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 const migrate=async file=>sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^﻿/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 const files=fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>Number(f.slice(0,4))<33))await migrate(file);
 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),participant=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer,participant])await sql`INSERT INTO auth.users VALUES(${id},'requirements@test.test','{}')`;
 const institution=await require('./institution-fixture.cjs')(sql,[master,co,observer,participant],master);
 await sql`INSERT INTO companies(id,name,created_by,institution_id) VALUES(${company},'Requirements',${master},${institution})`;

 // Option (b): legacy rows written before 0033 (triggers off only to seed these statuses directly).
 const legacyCampaign=randomUUID();await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${legacyCampaign},${company},'Legacy',${master})`;
 const legacy={};
 await sql.begin(async tx=>{await tx`SET LOCAL session_replication_role = replica`;let n=0;for(const status of ['draft','ready','active','evaluation','completed']){legacy[status]=randomUUID();await tx`INSERT INTO games(id,campaign_id,sequence,name,status) VALUES(${legacy[status]},${legacyCampaign},${n++},${'Legacy '+status},${status})`;}});
 await migrate('0033_section_requirements.sql');await migrate('0035_card_archetype.sql');
 for(const [status,id] of Object.entries(legacy)){const [g]=await sql`SELECT goals_required,rules_required FROM games WHERE id=${id}`;assert.equal(g.goals_required,!['draft','ready'].includes(status),status);assert.equal(g.rules_required,false,status);}
 console.log('PASS option (b): only draft/ready games end with goals optional; rules stay optional; others keep defaults');

 const module=name=>load(base+'/src/features/'+name+'.ts');
 const games=module('games/repositories/game.repository'),start=module('games/repositories/start-game.repository'),lifecycle=module('games/repositories/game-lifecycle.repository');
 const prep=module('preparation/repositories/preparation.repository'),manage=module('preparation/repositories/kpi-management.repository'),periods=module('rounds/repositories/period-configuration.repository');
 const rounds=module('rounds/repositories/round.repository'),goals=module('goals/repositories/goal.repository'),rules=module('rules/repositories/rule.repository'),section=module('games/repositories/section-requirement.repository');
 const generic={title:'Meta',description:null,goalType:'generic',kpiDefinitionId:null,operator:null,numericTarget:null,ordinalTargetKey:null};
 async function fixture(){
  const campaign=randomUUID();await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${campaign},${company},'Campaign',${master})`;
  for(const [id,role]of [[master,'master'],[co,'co_master'],[observer,'observer']])await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${campaign},${id},${role})`;
  const game=(await games.createGame({campaignId:campaign,profileId:master,name:'Game',type:'custom'})).game.id;
  let d=await prep.readPreparation(game,master);
  await manage.mutateKpi(master,{gameId:game,operationId:randomUUID(),operation:'create_kpi',definition:{key:'cash',name:'Fondos',unit:'ARS',precision:2,required:true,allowsNegative:true,valueType:'numeric',ordinalOptions:[]},expectedRevision:d.revision,catalogToken:d.catalogToken});
  d=await prep.readPreparation(game,master);const cash=d.definitions[0].id;
  await prep.writePreparation(master,{gameId:game,operationId:randomUUID(),operation:'save_values',expectedRevision:d.revision,catalogToken:d.catalogToken,sourceId:null,values:{[cash]:'1000'}});
  await periods.savePeriodConfiguration(master,{gameId:game,operationId:randomUUID(),expectedRevision:0,count:1,label:'Semana',durationSeconds:600});
  return {game,campaign,cash};
 }
 const flags=async game=>{const [g]=await sql`SELECT goals_required,rules_required FROM games WHERE id=${game}`;return [g.goals_required,g.rules_required];};
 const set=async(actor,game,which,required)=>section.setSectionRequired(actor,{gameId:game,operationId:randomUUID(),section:which,required,expectedRevision:(await prep.readPreparation(game,master)).revision});
 const startGame=async game=>{const d=await prep.readPreparation(game,master);return start.startGame(master,{gameId:game,operationId:randomUUID(),expectedRevision:d.revision,catalogToken:d.catalogToken,expectedPeriodRevision:1});};
 const rule=(cash,enabled,position=0)=>({name:'Costo '+position,description:'Costo semanal',triggerType:'round_end',enabled,position,visibility:'display',displayMessage:'Costo',effects:[{kpiId:cash,amount:'-5'}]});

 const a=await fixture();
 assert.deepEqual(await flags(a.game),[true,false],'new games: goals required, rules optional');
 // Master and Co-Master change the switches in preparation; each change is audited with the new values.
 await set(master,a.game,'rules',true);assert.deepEqual(await flags(a.game),[true,true]);
 await set(co,a.game,'goals',false);assert.deepEqual(await flags(a.game),[false,true]);
 const audits=await sql`SELECT c.actor_id,c.details FROM game_preparation_changes c JOIN game_state_sets s ON s.id=c.state_set_id WHERE s.game_id=${a.game} AND c.operation='set_section_required' ORDER BY c.revision`;
 assert.equal(audits.length,2);assert.equal(audits[1].actor_id,co);assert.equal(audits[1].details.goalsRequired,false);assert.equal(audits[1].details.rulesRequired,true);
 // Observer and a participant who is not a campaign member cannot.
 await assert.rejects(set(observer,a.game,'goals',true),/permiso/);
 await assert.rejects(set(participant,a.game,'goals',true));
 assert.deepEqual(await flags(a.game),[false,true]);
 // A stale revision is rejected.
 await assert.rejects(section.setSectionRequired(master,{gameId:a.game,operationId:randomUUID(),section:'goals',required:true,expectedRevision:0}),/Recargá/);
 // A change without its audit row is rejected by the database, also when the audit is written by an Observer.
 await assert.rejects(sql`UPDATE games SET goals_required=true WHERE id=${a.game}`,/audit/);
 const [prepState]=await sql`SELECT id,revision,campaign_id FROM game_state_sets WHERE game_id=${a.game} AND phase='preparation'`;
 await assert.rejects(sql.begin(async tx=>{await tx`UPDATE game_state_sets SET revision=revision+1,updated_by=${observer} WHERE id=${prepState.id}`;await tx`INSERT INTO game_preparation_changes(operation_id,campaign_id,state_set_id,actor_id,operation,request_hash,previous_revision,revision,details) VALUES(${randomUUID()},${prepState.campaign_id},${prepState.id},${observer},'set_section_required','x',${prepState.revision},${prepState.revision+1},${JSON.stringify({goalsRequired:true,rulesRequired:true})}::jsonb)`;await tx`UPDATE games SET goals_required=true WHERE id=${a.game}`;}),/audit/);
 assert.deepEqual(await flags(a.game),[false,true]);
 console.log('PASS switches: Master and Co-Master change them with audit; Observer, participant, stale revision and unaudited writes rejected');

 // Required rules with only disabled rules block the start; one enabled rule unblocks it.
 await rules.mutateRule(master,{gameId:a.game,ruleId:randomUUID(),operation:'create',definition:rule(a.cash,false,0)});
 assert.equal((await module('games/repositories/game-setup.repository').readGameSetup(a.game,master)).complete.reglas,false,'required rules with only disabled rules are not complete');
 await assert.rejects(startGame(a.game),/Reglas: activá al menos una regla/);
 await rules.mutateRule(master,{gameId:a.game,ruleId:randomUUID(),operation:'create',definition:rule(a.cash,true,1)});
 await startGame(a.game);
 // After the start the switches are locked, in the server and in the database.
 await assert.rejects(set(master,a.game,'goals',true),/preparación/);
 await assert.rejects(sql`UPDATE games SET goals_required=true WHERE id=${a.game}`,/editable only in preparation/);
 // After a Reset they can change again.
 await lifecycle.resetGame(master,{gameId:a.game,operationId:randomUUID()});
 await set(master,a.game,'goals',true);assert.deepEqual(await flags(a.game),[true,true]);
 console.log('PASS start: disabled-only rules block; locked after start; editable again after Reset');

 // Required goals with no goals block the start, in the server.
 const b=await fixture();
 // New game with required goals and no goals: the setup summary (button) and the start report the same blocker.
 const setupRepo=module('games/repositories/game-setup.repository');
 let setup=await setupRepo.readGameSetup(b.game,master);
 assert.deepEqual([...setup.missing],['Metas: cargá al menos una meta o marcá Metas como opcional.']);assert.equal(setup.complete.metas,false);
 await assert.rejects(startGame(b.game),error=>error.message===setup.missing.join(' '),'start rejects with exactly the listed reason');
 await goals.mutateGoal(master,{gameId:b.game,operation:'create',operationId:randomUUID(),definition:generic});
 // The successor copies both switches: B gets a non-default rules switch first.
 await set(master,b.game,'rules',true);
 await rules.mutateRule(master,{gameId:b.game,ruleId:randomUUID(),operation:'create',definition:rule(b.cash,true)});
 await startGame(b.game);
 const r=(await rounds.readRounds(b.game,master)).rounds[0];await rounds.mutateRound(master,{gameId:b.game,roundId:r.id,operation:'start',operationId:randomUUID(),expectedRevision:r.revision});
 const r2=(await rounds.readRounds(b.game,master)).rounds[0];await rounds.mutateRound(master,{gameId:b.game,roundId:r2.id,operation:'finish',operationId:randomUUID(),expectedRevision:r2.revision});
 for(const goal of (await goals.readGoals(b.game,master)).goals)await goals.mutateGoal(master,{gameId:b.game,goalId:goal.id,operation:'evaluate',operationId:randomUUID(),expectedRevision:goal.revision,fulfilled:true});
 await lifecycle.finishGame(master,{gameId:b.game,operationId:randomUUID()});
 const next=(await games.createGame({campaignId:b.campaign,profileId:master,name:'Next',type:'custom'})).game.id;
 assert.deepEqual(await flags(next),[true,true],'successor copies goals_required and rules_required');
 console.log('PASS goals: empty required goals block the start; successor copies both switches in its INSERT');

 for(const fn of ['guard_game_section_requirements','check_game_section_requirements_audited','check_start_section_requirements'])for(const role of ['anon','authenticated'])
  assert.equal((await sql`SELECT has_function_privilege(${role},${'public.'+fn+'()'},'EXECUTE') allowed`)[0].allowed,false);
 console.log('PASS 0033 functions not executable by anon/authenticated');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
