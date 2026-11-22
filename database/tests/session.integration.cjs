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
// #72 (D-39): the active institution cookie only CHOOSES among active memberships. A cookie with a foreign or
// revoked institution never shows anything of that institution, in the participant portal or in the panel.
async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 const migrate=async file=>sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^﻿/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 for(const file of fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort())await migrate(file);
 const person=randomUUID(),masterA=randomUUID(),masterB=randomUUID(),masterC=randomUUID();
 for(const [id,email] of [[person,'person@test.test'],[masterA,'a@test.test'],[masterB,'b@test.test'],[masterC,'c@test.test']])await sql`INSERT INTO auth.users VALUES(${id},${email},'{}')`;
 const module=name=>load(base+'/src/features/'+name+'.ts');
 const session=module('session/repositories/session.repository'),students=module('students/repositories/student.repository'),companies=module('companies/repositories/company.repository');
 const games=module('games/repositories/game.repository'),cards=module('cards/repositories/card.repository'),assignments=module('students/repositories/assignment.repository');
 // Three institutions: the person teaches in A, never belonged to B, and is revoked from C (where it also taught).
 // Since 0034 (#6) a new institution comes from a registration approved by a NEXUS admin.
 const nexus=randomUUID();await sql`INSERT INTO auth.users VALUES(${nexus},'nexus@test.test','{}')`;await sql`insert into nexus_admins(profile_id) values(${nexus})`;
 const institution=async(name,admin,people)=>{const data=require('./institution-fixture.cjs').registrationData({legalName:name});
  const [{registration}]=await sql`select register_institution(${admin},'admin@test.test',${JSON.stringify(data)}::text::jsonb) as registration`;
  const [{id}]=await sql`select approve_institution_registration(${nexus},${registration}) as id`;people=people.filter(([profile])=>profile!==admin);
  for(const [profile,role] of people)await sql`insert into institution_members(institution_id,profile_id,role,granted_by) values(${id},${profile},${role},${admin})`;return id;};
 const A=await institution('ALFA-INST',masterA,[[masterA,'admin'],[person,'teacher']]);
 const B=await institution('BETA-INST',masterB,[[masterB,'admin']]);
 const C=await institution('GAMA-INST',masterC,[[masterC,'admin'],[person,'teacher']]);
 // In each institution: a company and campaign of its admin with a game where the person (if member) has a card.
 const world=async(inst,master,tag,assign)=>{
  const company=randomUUID(),campaign=randomUUID();
  await sql`INSERT INTO companies(id,name,created_by,institution_id) VALUES(${company},${'COMPANY-'+tag},${master},${inst})`;
  await sql`INSERT INTO campaigns(id,company_id,name,created_by) VALUES(${campaign},${company},${'CAMPAIGN-'+tag},${master})`;
  await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${campaign},${master},'master')`;
  const game=(await games.createGame({campaignId:campaign,profileId:master,name:'GAME-'+tag,type:'custom'})).game.id;
  const scope={kind:'campaign',id:campaign};
  await cards.saveCard(scope,master,{fields:{name:'Finanzas',department:'Finanzas',description:'',responsibilities:'',publicInformation:'',visualIdentity:'',privateInformation:'',individualObjective:'',secretObjective:''},structure:{configuredModifiers:[],abilities:[],weaknesses:[],restrictions:[]}});
  await cards.addCardToGame(game,master,(await cards.readCards(scope,master)).cards[0].id);
  if(assign)await assignments.changeAssignment(master,{gameId:game,cardId:(await cards.readCards({kind:'game',id:game},master)).cards[0].id,email:'person@test.test',operation:'add',assignmentId:'',expectedRevision:0});
  return {company,campaign,game};
 };
 const a=await world(A,masterA,'A',true),b=await world(B,masterB,'B',false),c=await world(C,masterC,'C',true);
 // The person is also Observador in A and Master in C, and created companies in A and C.
 await sql`INSERT INTO campaign_members(campaign_id,profile_id,role) VALUES(${a.campaign},${person},'observer'),(${c.campaign},${person},'master')`;
 await sql`INSERT INTO companies(id,name,created_by,institution_id) VALUES(${randomUUID()},'OWN-A',${person},${A}),(${randomUUID()},'OWN-C',${person},${C})`;
 // Revoked from C after everything was set up.
 const [membership]=await sql`select id,revision from institution_members where institution_id=${C} and profile_id=${person}`;
 await module('institutions/repositories/institution.repository').changeInstitutionMember(masterC,C,membership.id,membership.revision,'revoke');

 // Only active memberships count.
 assert.deepEqual((await session.readActiveMemberships(person)).map(m=>[m.id,m.name,m.role]),[[A,'ALFA-INST','teacher']]);
 // Any cookie (foreign, revoked, malformed) falls back to an active membership; it never selects B or C.
 for(const cookie of [B,C,'not-a-uuid',null,A]){const {active}=await session.readSessionInstitutions(person,cookie);assert.equal(active.id,A,'cookie '+cookie);}
 assert.equal(await session.resolveInstitutionChoice(person,B),null,'foreign institution cannot be chosen');
 assert.equal(await session.resolveInstitutionChoice(person,C),null,'revoked institution cannot be chosen');
 assert.equal(await session.resolveInstitutionChoice(person,"' or 1=1 --"),null);
 assert.equal(await session.resolveInstitutionChoice(person,A),A);
 console.log('PASS active institution: only active memberships; foreign, revoked or malformed cookies are ignored and cannot be chosen');

 // Participant portal: only games of the active institution. Even passing B or C directly shows nothing of them.
 const names=rows=>JSON.parse(JSON.stringify(rows)).map(r=>r.name).sort();
 assert.deepEqual(names(await students.listAssignedGames(person,A)),['GAME-A']);
 assert.deepEqual(names(await students.listAssignedGames(person,B)),[]);
 assert.deepEqual(names(await students.listAssignedGames(person,C)),[],'revoked: the C game is not listed even with its id');
 assert.deepEqual(names(await students.listAssignedGames(person,null)),[]);
 // Panel: companies of the active institution; never B or C.
 assert.deepEqual(names(await companies.findCompaniesCreatedBy(person,A)),['OWN-A']);
 assert.deepEqual(names(await companies.findCompaniesCreatedBy(person,C)),[],'revoked: OWN-C is not listed even with its id');
 assert.deepEqual(names(await companies.findCompaniesCreatedBy(person,B)),[]);
 assert.deepEqual(names(await companies.findCompaniesCreatedBy(person,null)),[],'without an active membership nothing is listed');
 // Role label source: the campaign role counts only in the active institution (Master in C no longer counts).
 assert.equal(await session.readBestCampaignRole(person,A),'observer');
 assert.equal(await session.readBestCampaignRole(person,C),null);
 const payload=JSON.stringify([await students.listAssignedGames(person,B),await students.listAssignedGames(person,C),await companies.findCompaniesCreatedBy(person,B),await companies.findCompaniesCreatedBy(person,C)]);
 for(const hidden of ['BETA','GAMA','GAME-B','GAME-C','COMPANY-B','COMPANY-C','OWN-C'])assert(!payload.includes(hidden),'nothing of B or C: '+hidden);
 console.log('PASS listings: participant games and panel companies of the active institution only; nothing of a foreign or revoked institution');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
