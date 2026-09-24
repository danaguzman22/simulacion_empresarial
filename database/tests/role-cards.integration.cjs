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
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')&&Number(f.slice(0,4))<26).sort())await migrate(file);
 const legacyActor=randomUUID(),legacyCompany=randomUUID(),legacyCampaign=randomUUID(),legacyGame=randomUUID();
 await sql`insert into auth.users values(${legacyActor},'legacy@test.test','{}')`;
 await sql`insert into companies(id,name,created_by) values(${legacyCompany},'Legacy',${legacyActor})`;
 await sql`insert into campaigns(id,company_id,name,created_by) values(${legacyCampaign},${legacyCompany},'Legacy',${legacyActor})`;
 await sql`insert into games(id,campaign_id,name,sequence) values(${legacyGame},${legacyCampaign},'Existing before 0026',0)`;
 const legacyBefore=JSON.stringify(await sql`select * from games where id=${legacyGame}`);
 await migrate('0026_role_cards.sql');
 assert.equal(JSON.stringify(await sql`select * from games where id=${legacyGame}`),legacyBefore);
 assert.equal((await sql`select * from game_role_cards`).length,0,'no automatic backfill or invented roles');
 console.log('PASS upgrade 0025 -> 0026: existing game preserved, no backfill.');
 const legacyBase=randomUUID(),legacyCard=randomUUID();
 const legacyText='An\u00e1lisis de procesos.\nCoordinar producci\u00f3n; conservar el texto original.';
 await sql`insert into campaign_role_cards(id,campaign_id,name,responsibilities,created_by,updated_by) values(${legacyBase},${legacyCampaign},'Legacy base',${legacyText},${legacyActor},${legacyActor})`;
 await sql`insert into game_role_cards(id,game_id,campaign_id,source_card_id,name,responsibilities,created_by,updated_by) values(${legacyCard},${legacyGame},${legacyCampaign},${legacyBase},'Legacy copy',${legacyText},${legacyActor},${legacyActor})`;
 await migrate('0027_card_responsibilities_modifiers.sql');
 for(const table of ['campaign_role_cards','game_role_cards']) {
  const [old]=await sql.unsafe('select * from '+table);assert.equal(old.responsibilities,legacyText);assert.deepEqual(old.selected_responsibilities,[]);assert.equal(old.ana,null);assert.equal(old.revision,0);
 }
 console.log('PASS upgrade 0026 -> 0027: original responsibilities/revisions preserved; no invented modifiers.');
 // Real 0027 values, including zero and an unset attribute, survive unchanged.
 await sql`update campaign_role_cards set ana=3,vis=1,neg=0,ope=-1,ada=null,revision=revision+1 where id=${legacyBase}`;
 await sql`update game_role_cards set ana=3,vis=1,neg=0,ope=-1,ada=null,revision=revision+1 where id=${legacyCard}`;
 const oldRows={};for(const table of ['campaign_role_cards','game_role_cards'])oldRows[table]=await sql.unsafe('select to_jsonb(t) row from '+table+' t order by id');
 await migrate('0028_card_structure.sql');
 for(const table of Object.keys(oldRows)) {
  const after=await sql.unsafe("select to_jsonb(t)-'configured_modifiers'-'abilities'-'weaknesses'-'restrictions'"+(table==='campaign_role_cards'?"-'private_information'-'individual_objective'-'secret_objective'":"")+" row from "+table+" t order by id");
  assert.deepEqual(after,oldRows[table]);
 }
 console.log('PASS upgrade 0027 -> 0028: every original column preserved, including zero modifiers.');


 const master=randomUUID(),co=randomUUID(),observer=randomUUID(),company=randomUUID();
 for(const id of [master,co,observer])await sql`INSERT INTO auth.users VALUES(${id},'goals@test.test','{}')`;
 await sql`INSERT INTO companies(id,name,created_by) VALUES(${company},'Goals',${master})`;
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



 const cards=module('cards/repositories/card.repository'), actions=module('cards/application/card-actions');
 const fields={name:'Direcci?n',department:'Direcci?n general',description:'Empresa industrial',responsibilities:'Coordinar decisiones',publicInformation:'Informaci?n p?blica',visualIdentity:'B?ho',privateInformation:'Informaci?n reservada',individualObjective:'Mejorar coordinaci?n',secretObjective:'SECRETO-PRUEBA'};
 const campaignScope=id=>({kind:'campaign',id}),gameScope=id=>({kind:'game',id});

 // Render existing 0026 text after 0027 through the actual server component/form.
 await sql`insert into campaign_members(campaign_id,profile_id,role) values(${legacyCampaign},${legacyActor},'master')`;
 sessionActor=legacyActor;
 const render=localRequire('react-dom/server').renderToStaticMarkup;
 const {RoleCards}=load(base+'/src/features/cards/components/RoleCards.tsx');
 for(const scope of [campaignScope(legacyCampaign),gameScope(legacyGame)]) {
  const markup=render(await RoleCards({scope}));
  assert(markup.includes(legacyText),'existing accented text must render unchanged');
  assert(markup.includes('value="'+legacyText+'"'),'existing text is a checkbox option');
  assert(/<input(?=[^>]*name="responsibility")(?=[^>]*checked="")[^>]*>/.test(markup),'legacy responsibility stays selected');
 }
 sessionActor=null;
 console.log('PASS legacy UI: accented multiline responsibilities preserved and checked after 0027.');
 const a=await fixture();
 assert.equal((await cards.readCards(gameScope(a.game),master)).cards.length,0);
 await cards.saveCard(campaignScope(a.campaign),master,{fields});
 let catalogue=await cards.readCards(campaignScope(a.campaign),master);const baseId=catalogue.cards[0].id;
 assert.equal(catalogue.cards[0].name,'Direcci?n');
 assert.equal((await cards.readCards(gameScope(a.game),master)).cards.length,0,'new bases do not change existing games');
 await cards.saveCard(campaignScope(a.campaign),master,{id:baseId,revision:0,fields:{...fields,description:'Base corregida'}});
 await assert.rejects(cards.saveCard(campaignScope(a.campaign),master,{id:baseId,revision:0,fields}),/Recarg?/);
 await cards.addCardToGame(a.game,master,baseId);await cards.addCardToGame(a.game,master,baseId);
 let data=await cards.readCards(gameScope(a.game),master);assert.equal(data.cards.length,1);const cardId=data.cards[0].id;
 assert.equal(data.cards[0].description,'Base corregida');assert.equal(data.cards[0].secretObjective,fields.secretObjective);
 await cards.saveCard(gameScope(a.game),master,{id:cardId,revision:0,fields});
 await cards.saveCard(campaignScope(a.campaign),master,{id:baseId,revision:1,fields:{...fields,name:'Direcci?n futura'}});
 data=await cards.readCards(gameScope(a.game),master);assert.equal(data.cards[0].name,'Direcci?n');assert.equal(data.cards[0].secretObjective,fields.secretObjective);
 for(const actor of [co,observer]) {
  const view=await cards.readCards(gameScope(a.game),actor);assert.equal(view.canEdit,false);assert.equal(view.canReadPrivate,false);
  assert.equal('secretObjective' in view.cards[0],false);assert.equal('privateInformation' in view.cards[0],false);
  assert(!JSON.stringify(view).includes('SECRETO-PRUEBA'));assert.equal(view.cards[0].individualObjective,fields.individualObjective);
  await assert.rejects(cards.saveCard(gameScope(a.game),actor,{id:cardId,revision:1,fields}));
  await assert.rejects(cards.saveCard(campaignScope(a.campaign),actor,{fields}));
  await assert.rejects(cards.addCardToGame(a.game,actor,baseId));
 }
 const outsider=randomUUID();await sql`insert into auth.users values(${outsider},'outsider@test.test','{}')`;
 await assert.rejects(cards.readCards(gameScope(a.game),outsider));await assert.rejects(cards.readCards(campaignScope(a.campaign),outsider));
 assert.equal((await actions.getCards(gameScope(a.game))).status,'unauthenticated');sessionActor=outsider;
 assert.equal((await actions.getCards(gameScope(a.game))).status,'not-found');sessionActor=master;
 assert.equal((await actions.getCards(gameScope('invalid'))).status,'not-found');
 // Concurrent updates use the same game/campaign locks as Start and compare revisions.
 const edits=await Promise.allSettled([cards.saveCard(gameScope(a.game),master,{id:cardId,revision:1,fields:{...fields,description:'A'}}),cards.saveCard(gameScope(a.game),master,{id:cardId,revision:1,fields:{...fields,description:'B'}})]);
 assert.equal(edits.filter(x=>x.status==='fulfilled').length,1);assert.equal(edits.filter(x=>x.status==='rejected').length,1);
 const baseline=JSON.stringify((await cards.readCards(gameScope(a.game),master)).cards);
 await startGame(a.game);
 assert.equal((await cards.readCards(gameScope(a.game),master)).canEdit,false);
 await assert.rejects(cards.saveCard(gameScope(a.game),master,{id:cardId,revision:2,fields}));
 await assert.rejects(cards.addCardToGame(a.game,master,baseId));
 await assert.rejects(sql`update game_role_cards set name='Alterado',revision=revision+1 where id=${cardId}`,/ROLE_CARD_FROZEN/);
 await sql`update games set status='paused' where id=${a.game}`;
 assert.equal((await cards.readCards(gameScope(a.game),master)).canEdit,false);
 await assert.rejects(cards.saveCard(gameScope(a.game),master,{id:cardId,revision:2,fields}));
 await lifecycle.resetGame(master,{gameId:a.game,operationId:randomUUID()});
 assert.equal(JSON.stringify((await cards.readCards(gameScope(a.game),master)).cards),baseline,'Reset retains exact pre-Start definitions');
 assert.equal((await cards.readCards(gameScope(a.game),master)).canEdit,true);
 await startGame(a.game);await roundAction(a.game,'start');await roundAction(a.game,'finish');
 assert.equal((await cards.readCards(gameScope(a.game),master)).canEdit,false,'evaluation read only');
 await assert.rejects(cards.saveCard(gameScope(a.game),master,{id:cardId,revision:2,fields}));
 await lifecycle.finishGame(master,{gameId:a.game,operationId:randomUUID()});
 assert.equal(JSON.stringify((await cards.readCards(gameScope(a.game),master)).cards),baseline);
 await assert.rejects(cards.saveCard(gameScope(a.game),master,{id:cardId,revision:2,fields}));
 const successor=(await games.createGame({campaignId:a.campaign,profileId:master,name:'Sucesora',type:'custom'})).game.id;
 const next=await cards.readCards(gameScope(successor),master);assert.equal(next.cards.length,1);assert.notEqual(next.cards[0].id,cardId);assert.equal(next.cards[0].revision,0);
 assert.equal(next.cards[0].secretObjective,fields.secretObjective);assert.equal(next.cards[0].name,'Direcci?n');
 await cards.saveCard(gameScope(successor),master,{id:next.cards[0].id,revision:0,fields:{...fields,secretObjective:'NUEVO SECRETO'}});
 assert.equal(JSON.stringify((await cards.readCards(gameScope(a.game),master)).cards),baseline,'historical game unchanged');
 // Delete integration removes owned copies and retains the campaign base.
 await lifecycle.deleteGame(master,{gameId:successor,operationId:randomUUID()});assert.equal((await sql`select id from game_role_cards where game_id=${successor}`).length,0);
 assert.equal((await cards.readCards(campaignScope(a.campaign),master)).cards.length,1);
 // First game receives copies atomically when campaign bases already exist.
 const c=randomUUID();await sql`insert into campaigns(id,company_id,name,created_by) values(${c},${company},'Nueva',${master})`;
 await sql`insert into campaign_members(campaign_id,profile_id,role) values(${c},${master},'master')`;
 await cards.saveCard(campaignScope(c),master,{fields});const newGame=(await games.createGame({campaignId:c,profileId:master,name:'Primera',type:'custom'})).game.id;
 assert.equal((await cards.readCards(gameScope(newGame),master)).cards.length,1);
 const foreignBase=(await cards.readCards(campaignScope(c),master)).cards[0].id;
 await assert.rejects(cards.addCardToGame(newGame,master,baseId));
 await assert.rejects(sql`insert into game_role_cards(game_id,campaign_id,source_card_id,name,created_by,updated_by) values(${newGame},${c},${baseId},'Cruce',${master},${master})`,/foreign key/);
 assert(foreignBase);
 // No fichas remain optional across Start/Reset; historical copies do not require backfill.
 const empty=await fixture();await startGame(empty.game);await lifecycle.resetGame(master,{gameId:empty.game,operationId:randomUUID()});assert.equal((await cards.readCards(gameScope(empty.game),master)).cards.length,0);
 for(const role of ['anon','authenticated'])for(const table of ['campaign_role_cards','game_role_cards']) {
  const [priv]=await sql`select has_table_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE') as allowed`;assert.equal(priv.allowed,false);
 }
 const rls=await sql`select relrowsecurity from pg_class where oid in ('campaign_role_cards'::regclass,'game_role_cards'::regclass)`;assert(rls.every(r=>r.relrowsecurity));

 const presets=module('cards/domain/card-presets').cardPresets,domain=module('cards/domain/card');
 assert.equal(presets.length,5);assert.deepEqual(JSON.parse(JSON.stringify(presets.find(p=>p.id==='castor').modifiers)),{ana:3,vis:1,neg:0,ope:1,ada:0});
 for(const preset of presets) {assert.equal(preset.responsibilities.length,5);assert(!('secretObjective' in preset.fields));}
 const x=await fixture(),xs=campaignScope(x.campaign);
 const custom=await cards.createResponsibility(xs,master,'  Coordinar   la operacion. ');
 await cards.createResponsibility(xs,master,'COORDINAR LA OPERACION');

 const equivalent=['An\u00e1lisis de procesos','Analisis de procesos','AN\u00c1LISIS DE PROCESOS.','  AN\u00c1LISIS   DE   PROCESOS.;:,  '];
 for(const label of equivalent) {
  const [row]=await sql`select public.card_responsibility_key(${label}) k`;
  assert.equal(row.k,'analisis de procesos');assert.equal(domain.responsibilityKey(label),row.k);
 }
 console.log('PASS requested SQL/JS equivalence: accents, case, repeated spaces and trailing punctuation.');
 const accents=['An\u00e1lisis de riesgos.','ANALISIS DE RIESGOS'];for(const label of accents)await cards.createResponsibility(xs,master,label);
 assert.equal((await sql`select * from card_responsibilities where owner_id=${master}`).length,2);
 for(const sample of [...accents,'  Coordinar   la operacion. ','Responsabilidad,','\u00a0Liderar\u00a0equipo\u00a0']) {const [row]=await sql`select public.card_responsibility_key(${sample}) k`;assert.equal(row.k,domain.responsibilityKey(sample));}
 const preset=presets.find(p=>p.id==='castor'),selection=[...preset.responsibilities,custom];
 await cards.saveCard(xs,master,{fields:{...fields,...preset.fields},selectedResponsibilities:selection,modifiers:preset.modifiers});
 const xb=(await cards.readCards(xs,master)).cards[0];assert.equal(xb.ana,3);assert.equal(xb.responsibilities,'');assert.equal(xb.selectedResponsibilities.length,6);
 // Reuse is actor-wide, not bound to a company or campaign; another actor cannot read it.
 const reusable=await cards.readCards(campaignScope(c),master);assert(reusable.responsibilityCatalogue.some(r=>r.label===custom));
 assert.equal((await cards.readCards(xs,co)).responsibilityCatalogue.length,0);
 await assert.rejects(cards.createResponsibility(xs,co,'Forbidden'));await assert.rejects(cards.createResponsibility(xs,observer,'Forbidden'));
 await cards.addCardToGame(x.game,master,xb.id);let xc=(await cards.readCards(gameScope(x.game),master)).cards[0];assert.equal(xc.ana,3);assert.equal(xc.selectedResponsibilities.length,6);
 await cards.saveCard(xs,master,{id:xb.id,revision:0,fields:{...fields,...preset.fields},selectedResponsibilities:[],modifiers:{...preset.modifiers,ana:9}});
 xc=(await cards.readCards(gameScope(x.game),master)).cards[0];assert.equal(xc.ana,3);assert.equal(xc.selectedResponsibilities.length,6);
 assert((await cards.readCards(xs,master)).responsibilityCatalogue.some(r=>r.label===custom),'removing selections never removes catalogue labels');
 await cards.saveCard(gameScope(x.game),master,{id:xc.id,revision:0,fields:{...fields,...preset.fields},selectedResponsibilities:[custom],modifiers:{ana:-2,vis:1,neg:0,ope:1,ada:4}});
 await assert.rejects(cards.saveCard(gameScope(x.game),master,{id:xc.id,revision:1,fields,modifiers:{ana:1.5,vis:0,neg:0,ope:0,ada:0}}));
 await assert.rejects(cards.saveCard(gameScope(x.game),master,{id:xc.id,revision:0,fields,selectedResponsibilities:['Rollback new label'],modifiers:preset.modifiers}));
 assert(!(await cards.readCards(xs,master)).responsibilityCatalogue.some(r=>r.label==='Rollback new label'));
 await assert.rejects(sql`update game_role_cards set selected_responsibilities=array['Duplicate','duplicate.'],revision=revision+1 where id=${xc.id}`,/CARD_RESPONSIBILITIES_INVALID/);
 const beforeStart=JSON.stringify((await cards.readCards(gameScope(x.game),master)).cards);
 await startGame(x.game);await assert.rejects(sql`update game_role_cards set ana=99,revision=revision+1 where id=${xc.id}`,/ROLE_CARD_FROZEN/);
 await assert.rejects(cards.createResponsibility(gameScope(x.game),master,'Blocked active'));
 await lifecycle.resetGame(master,{gameId:x.game,operationId:randomUUID()});assert.equal(JSON.stringify((await cards.readCards(gameScope(x.game),master)).cards),beforeStart);
 await startGame(x.game);await roundAction(x.game,'start');await roundAction(x.game,'finish');await lifecycle.finishGame(master,{gameId:x.game,operationId:randomUUID()});
 const successorX=(await games.createGame({campaignId:x.campaign,profileId:master,name:'Next with modifiers',type:'custom'})).game.id;
 const nextX=(await cards.readCards(gameScope(successorX),master)).cards[0];assert.notEqual(nextX.id,xc.id);assert.equal(nextX.ana,-2);assert.deepEqual(Array.from(nextX.selectedResponsibilities),[custom]);
 await cards.saveCard(gameScope(successorX),master,{id:nextX.id,revision:0,fields,selectedResponsibilities:[],modifiers:preset.modifiers});
 assert.equal(JSON.stringify((await cards.readCards(gameScope(x.game),master)).cards),beforeStart);
 for(const role of ['anon','authenticated'])assert.equal((await sql`select has_table_privilege(${role},'public.card_responsibilities','SELECT,INSERT,UPDATE,DELETE') allowed`)[0].allowed,false);
 assert.equal((await sql`select relrowsecurity from pg_class where oid='card_responsibilities'::regclass`)[0].relrowsecurity,true);
 console.log('PASS 0027: prototype presets; normalized reusable catalogue; selection/removal; modifier validation; independent snapshots; rollback; frozen game; Reset/successor; RLS.');

 const structureDomain=module('cards/domain/card-structure');
 const legacyView=(await cards.readCards(gameScope(legacyGame),legacyActor)).cards[0];
 const legacyMods=structureDomain.effectiveModifiers(legacyView);
 assert.equal(legacyMods.length,4);assert.equal(legacyMods.find(m=>m.key==='neg').value,0);assert.equal(legacyMods.some(m=>m.key==='ada'),false);
 const v=await fixture(),vs=campaignScope(v.campaign);
 const customModifier=await cards.createModifierDefinition(vs,master,'Innovacion','INN');
 assert.equal((await cards.createModifierDefinition(vs,master,'INNOVACION','inn')).key,customModifier.key);
 await assert.rejects(cards.createModifierDefinition(vs,master,'Otra','INN'));
 await assert.rejects(cards.createModifierDefinition(vs,master,'Builtin conflict','ANA'));
 for(const actor of [co,observer])await assert.rejects(cards.createModifierDefinition(vs,actor,'Forbidden','BAD'));
 assert((await cards.readCards(campaignScope(c),master)).modifierCatalogue.some(m=>m.key===customModifier.key));
 const configured={configuredModifiers:[{...customModifier,value:3},{...structureDomain.builtInModifiers[0],value:0}],
  abilities:[{name:'A3 test',type:'support',description:'Ayuda a otro departamento.',condition:'Con propuesta.',useLimit:1,useScope:'game'},{name:'Pasiva test',type:'passive',description:'Protege mejora.',condition:'CD 11',useLimit:null,useScope:null}],
  weaknesses:[{name:'Perfeccionismo test',description:'Contexto',condition:'Bajo presion',consequence:'-2 en una tirada'},{name:'Otra debilidad',description:'',condition:'',consequence:'Requiere revisar'}],
  restrictions:[{name:'Public restriction',description:'Public text',condition:'Unless approved',visibility:'public'},{name:'PRIVATE_RESTRICTION_SENTINEL',description:'PRIVATE_DETAILS_SENTINEL',condition:'PRIVATE_CONDITION_SENTINEL',visibility:'private'}]};
 await cards.saveCard(vs,master,{fields,structure:configured});const vb=(await cards.readCards(vs,master)).cards[0];
 await cards.addCardToGame(v.game,master,vb.id);const vc=(await cards.readCards(gameScope(v.game),master)).cards[0];
 assert.equal(vc.configuredModifiers[0].value,3);assert.equal(vc.abilities.length,2);assert.equal(vc.weaknesses.length,2);assert.equal(vc.restrictions.length,2);
 for(const actor of [co,observer])for(const scope of [vs,gameScope(v.game)]) {
  const data=await cards.readCards(scope,actor);assert.equal(data.cards[0].restrictions.length,1);
  assert(!JSON.stringify(data).includes('PRIVATE_'));assert(!JSON.stringify(data).includes('SECRETO-PRUEBA'));
  sessionActor=actor;const markup=render(await RoleCards({scope}));assert(!markup.includes('PRIVATE_'));assert(!markup.includes('SECRETO-PRUEBA'));
  await assert.rejects(cards.saveCard(scope,actor,{id:scope.kind==='game'?vc.id:vb.id,revision:0,fields,structure:configured}));
 }
 sessionActor=null;
 for(const bad of [
  {...configured,configuredModifiers:[{...customModifier,value:1.5}]},
  {...configured,configuredModifiers:[{...customModifier,key:'custom:'+randomUUID(),value:1}]},
  {...configured,abilities:[{...configured.abilities[0],useLimit:1,useScope:null}]},
  {...configured,abilities:[{...configured.abilities[0],type:'unknown'}]},
  {...configured,restrictions:[{...configured.restrictions[0],visibility:'unknown'}]}
 ])await assert.rejects(cards.saveCard(gameScope(v.game),master,{id:vc.id,revision:0,fields,structure:bad}));
 await assert.rejects(sql`update game_role_cards set abilities=${JSON.stringify([{name:'Invalid',type:'passive',description:'x',condition:'',useLimit:0,useScope:'game'}])}::jsonb,revision=revision+1 where id=${vc.id}`,/CARD_STRUCTURE_INVALID/);
 const tailored={...configured,configuredModifiers:[{...customModifier,value:1}]};
 await cards.saveCard(gameScope(v.game),master,{id:vc.id,revision:0,fields,structure:tailored});
 assert.equal((await cards.readCards(vs,master)).cards[0].configuredModifiers[0].value,3);
 await cards.saveCard(vs,master,{id:vb.id,revision:0,fields,structure:{configuredModifiers:[],abilities:[],weaknesses:[],restrictions:[]}});
 assert.equal((await cards.readCards(gameScope(v.game),master)).cards[0].configuredModifiers[0].value,1);
 await assert.rejects(cards.saveCard(gameScope(v.game),master,{id:vc.id,revision:0,fields,structure:configured}));
 const beforeV=JSON.stringify((await cards.readCards(gameScope(v.game),master)).cards);
 await startGame(v.game);
 await assert.rejects(cards.saveCard(gameScope(v.game),master,{id:vc.id,revision:1,fields,structure:configured}));
 await assert.rejects(sql`update game_role_cards set restrictions='[]',revision=revision+1 where id=${vc.id}`,/ROLE_CARD_FROZEN/);
 await lifecycle.resetGame(master,{gameId:v.game,operationId:randomUUID()});assert.equal(JSON.stringify((await cards.readCards(gameScope(v.game),master)).cards),beforeV);
 await startGame(v.game);await roundAction(v.game,'start');await roundAction(v.game,'finish');await lifecycle.finishGame(master,{gameId:v.game,operationId:randomUUID()});
 const nextV=(await games.createGame({campaignId:v.campaign,profileId:master,name:'V2 successor',type:'custom'})).game.id;
 const nv=(await cards.readCards(gameScope(nextV),master)).cards[0];assert.notEqual(nv.id,vc.id);assert.equal(nv.abilities.length,2);assert.equal(nv.configuredModifiers[0].value,1);assert.equal(nv.restrictions.length,2);
 await cards.saveCard(gameScope(nextV),master,{id:nv.id,revision:0,fields,structure:{...configured,configuredModifiers:[]}});
 assert.equal(structureDomain.effectiveModifiers((await cards.readCards(gameScope(nextV),master)).cards[0]).length,0);
 assert.equal(JSON.stringify((await cards.readCards(gameScope(v.game),master)).cards),beforeV);
 assert.equal(presets.find(p=>p.id==='castor').configuredModifiers.length,3);
 assert(presets.find(p=>p.id==='castor').abilities.find(a=>a.name.startsWith('Filtro')).description.includes('CD 11'));
 assert(presets.every(p=>p.abilities.length===3&&p.weaknesses.length===0&&p.restrictions.length===0));
 for(const role of ['anon','authenticated'])assert.equal((await sql`select has_table_privilege(${role},'public.card_modifier_definitions','SELECT,INSERT,UPDATE,DELETE') allowed`)[0].allowed,false);
 console.log('PASS 0028: zero compatibility; selectable/custom modifiers; own catalogue; limited/passive abilities; weaknesses; private restrictions and SSR; presets; DB validation; stale revision; historical independence; Reset/successor.');
 console.log('PASS Fichas: base create/edit; independent copies; secret projection; membership/roles; revision concurrency; preparation/Start/evaluation/completed guards; Reset; successor; Delete; empty game; composite FK; RLS.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
