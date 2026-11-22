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
// #6 (0034): NEXUS admins and institution registrations, checked in the database itself: only an active NEXUS
// admin grants or revokes the role (never the last), registrations stay out of "institutions" until approved,
// at most 3 pending per person, every action is recorded, history is append-only and anon/authenticated get nothing.
async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 const migrate=async file=>sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^﻿/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 const files=fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>f<'0034'))await migrate(file);
 // Data before 0034: an institution with its admin stays exactly as it was.
 const [a,b,c,d]=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
 for(const [id,email] of [[a,'a@test.test'],[b,'b@test.test'],[c,'c@test.test'],[d,'d@test.test']])await sql`INSERT INTO auth.users VALUES(${id},${email},'{}')`;
 const old=await require('./institution-fixture.cjs')(sql,[d],d);
 for(const file of files.filter(f=>f>='0034'))await migrate(file);
 assert.deepEqual([...await sql`select name,type,locality from institutions where id=${old}`].map(r=>({...r})),[{name:'Test institution',type:'educational',locality:null}]);
 const fails=async(promise,pattern)=>{await assert.rejects(promise,pattern);};
 console.log('PASS 0034 applies over existing data; existing institutions untouched (locality null)');

 // First admin only while there is none (operator script), then only an active admin grants.
 await sql`insert into nexus_admins(profile_id) values(${a})`;
 await fails(sql`insert into nexus_admins(profile_id) values(${b})`,/Only an active NEXUS admin can grant/);
 await fails(sql`select grant_nexus_admin(${c},${b})`,/Only an active NEXUS admin can grant/);
 await sql`select grant_nexus_admin(${a},${b})`;
 await fails(sql`select grant_nexus_admin(${a},${b})`,/nexus_admins_active_unique/);
 // Revoking: another admin or oneself, never the last one.
 await sql`select revoke_nexus_admin(${b},${a})`;
 await fails(sql`select revoke_nexus_admin(${b},${b})`,/Cannot revoke the last NEXUS admin/);
 await fails(sql`select revoke_nexus_admin(${a},${b})`,/Only an active NEXUS admin can revoke/,'a revoked admin cannot act');
 await sql`select grant_nexus_admin(${b},${a})`;
 await sql`select revoke_nexus_admin(${a},${a})`;
 assert.deepEqual((await sql`select profile_id from nexus_admins where revoked_at is null`).map(r=>r.profile_id),[b]);
 await fails(sql`update nexus_admins set revoked_at=null,revoked_by=null where profile_id=${a}`,/only changes by revoking/);
 await fails(sql`delete from nexus_admins where profile_id=${a}`,/never deleted/);
 await fails(sql`truncate nexus_admins`,/append-only/);await fails(sql`truncate institution_registrations cascade`,/append-only/);
 console.log('PASS NEXUS admins: first only by script, then only an active admin grants; revoke others or oneself, never the last; never deleted');

 // Registrations: pending outside "institutions"; at most 3 pending; no HTML; lengths.
 const register=(actor,name,locality='Córdoba',note='')=>sql`select register_institution(${actor},${name},'educational',${locality},${note}) as id`.then(r=>r[0].id);
 const institutions=async()=>(await sql`select count(*)::int as n from institutions`)[0].n;
 const before=await institutions();
 const r1=await register(c,'  Universidad Uno  '),r2=await register(c,'Universidad Dos'),r3=await register(c,'Universidad Tres');
 await fails(register(c,'Universidad Cuatro'),/At most 3 pending/);
 assert.equal(await institutions(),before,'pending registrations never become institutions');
 assert.equal((await sql`select name from institution_registrations where id=${r1}`)[0].name,'Universidad Uno');
 await fails(register(d,'<b>Uni</b>'),/name_valid/);await fails(register(d,'Uni','<script>'),/locality_valid/);
 await fails(register(d,'Uni','Córdoba','<a href=x>'),/message_valid/);await fails(register(d,'U'),/name_valid/);
 await fails(register(d,'x'.repeat(161)),/name_valid/);await fails(register(d,'Uni','C'),/locality_valid/);
 await fails(register(d,'Uni','Córdoba','x'.repeat(1001)),/message_valid/);
 console.log('PASS registrations: outside institutions while pending, max 3 pending, no HTML, length limits');

 // Approving: only an active NEXUS admin; creates the institution and makes the registrant its admin only now.
 await fails(sql`select approve_institution_registration(${c},${r1})`,/Only an active NEXUS admin/);
 await fails(sql`select approve_institution_registration(${a},${r1})`,/Only an active NEXUS admin/,'a revoked admin cannot approve');
 const created=(await sql`select approve_institution_registration(${b},${r1}) as id`)[0].id;
 assert.deepEqual({...(await sql`select name,type,locality from institutions where id=${created}`)[0]},{name:'Universidad Uno',type:'educational',locality:'Córdoba'});
 assert.deepEqual({...(await sql`select profile_id,role,status,granted_by from institution_members where institution_id=${created}`)[0]},{profile_id:c,role:'admin',status:'active',granted_by:b});
 await fails(sql`select approve_institution_registration(${b},${r1})`,/no longer pending/);
 // Rejecting: reason required; the registrant can present it again as a new registration.
 await fails(sql`select reject_institution_registration(${b},${r2},${null})`,/resolution_valid/);
 await fails(sql`select reject_institution_registration(${b},${r2},'  ')`,/reason_valid/);
 await sql`select reject_institution_registration(${b},${r2},'Falta la localidad exacta')`;
 assert.deepEqual({...(await sql`select status,rejection_reason,institution_id from institution_registrations where id=${r2}`)[0]},{status:'rejected',rejection_reason:'Falta la localidad exacta',institution_id:null});
 await register(c,'Universidad Dos');
 // Direct changes are blocked: content is immutable, resolved ones never change, approval needs a real new institution.
 await fails(sql`update institution_registrations set name='Otra' where id=${r3}`,/immutable/);
 await fails(sql`update institution_registrations set status='approved',resolved_at=now(),resolved_by=${b},institution_id=${old} where id=${r3}`,/Approval must create the institution/);
 await fails(sql`update institution_registrations set status='rejected',resolved_at=now(),resolved_by=${c},rejection_reason='no' where id=${r3}`,/Only an active NEXUS admin/);
 await fails(sql`delete from institution_registrations where id=${r3}`,/never deleted/);
 // A new institution only comes from an approved registration: a direct INSERT fails at commit, also with a
 // pending registration or with one approved for another institution.
 await fails(sql.begin(tx=>tx`insert into institutions(name,type,locality) values('Directa','other','Córdoba')`),/require an approved institution registration/);
 await fails(sql.begin(async tx=>{const [{id}]=await tx`insert into institutions(name,type,locality) values('Universidad Tres','educational','Córdoba') returning id`;
  await tx`insert into institution_members(institution_id,profile_id,role,granted_by) values(${id},${c},'admin',${b})`;}),/require an approved institution registration/);
 assert.equal(await institutions(),before+1,'only the approved one was created');
 console.log('PASS approve/reject: only an active NEXUS admin, registrant becomes admin on approval, reason required, can present again; no institution without an approved registration');

 // Every action recorded, who to whom; the record is append-only.
 const log=(await sql`select actor_id,action,target_profile_id,registration_id,details from nexus_admin_actions order by created_at,action`).map(r=>({...r,details:{...r.details}}));
 assert.deepEqual(log.map(r=>[r.action,r.actor_id,r.target_profile_id]),[
  ['grant_admin',null,a],['grant_admin',a,b],['revoke_admin',b,a],['grant_admin',b,a],['revoke_admin',a,a],['approve_institution',b,c],['reject_institution',b,c]]);
 assert.deepEqual(log[0].details,{first:true});assert.deepEqual(log.at(-1).details,{reason:'Falta la localidad exacta'});
 await fails(sql`update nexus_admin_actions set action='grant_admin'`,/append-only/);
 await fails(sql`delete from nexus_admin_actions`,/append-only/);
 await fails(sql`truncate nexus_admin_actions`,/append-only/);
 console.log('PASS audit: every grant, revoke, approval and rejection recorded with actor and target; append-only');

 // Privileges: anon and authenticated get nothing; the server (service_role) only reads and calls the functions.
 for(const role of ['anon','authenticated']){
  await fails(sql.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx`select 1 from nexus_admins limit 1`;}),/permission denied/);
  await fails(sql.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx`select is_nexus_admin(${b})`;}),/permission denied/);
  await fails(sql.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx`select register_institution(${d},'Uni','educational','Córdoba','')`;}),/permission denied/);
 }
 await sql.begin(async tx=>{await tx.unsafe('set local role service_role');assert.equal((await tx`select is_nexus_admin(${b}) as ok`)[0].ok,true);await tx`select count(*) from institution_registrations`;});
 await fails(sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`insert into nexus_admins(profile_id,granted_by) values(${d},${b})`;}),/permission denied/);
 await fails(sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`update institution_registrations set message='x'`;}),/permission denied/);
 await sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`select grant_nexus_admin(${b},${d})`;});
 assert.equal((await sql`select is_nexus_admin(${d}) as ok`)[0].ok,true);
 console.log('PASS privileges: anon/authenticated get nothing; service_role reads and writes only through the functions');
 // Through the app's repository: server-side checks and Spanish messages; the database re-checks every rule.
 const repo=load(base+'/src/features/nexus/repositories/nexus.repository.ts'),inst=load(base+'/src/features/institutions/repositories/institution.repository.ts');
 const plain=x=>JSON.parse(JSON.stringify(x));
 assert.equal(await repo.readNexusPanel(c),null,'not a NEXUS admin: no panel');
 const [pendingTres]=await sql`select id from institution_registrations where name='Universidad Tres' and status='pending'`;
 await fails(repo.approveRegistration(c,pendingTres.id),/Necesitás ser admin de NEXUS/);
 await fails(repo.grantNexusAdmin(c,'c@test.test'),/Necesitás ser admin de NEXUS/);
 await fails(repo.registerInstitution(d,{name:'<i>Uni</i>',kind:'educational',locality:'Córdoba',message:''},false),/no puede tener/);
 // Duplicate warning (case and accents ignored), then sent anyway when confirmed.
 const dup=plain(await repo.registerInstitution(d,{name:'universidad uno',kind:'educational',locality:'CORDOBA',message:''},false));
 assert.deepEqual(dup,{status:'duplicate',matches:['Universidad Uno · Córdoba']});
 assert.deepEqual(plain(await repo.registerInstitution(d,{name:'universidad tres',kind:'educational',locality:'córdoba',message:''},false)).matches,['Una solicitud pendiente con ese nombre y localidad'],'a pending one is mentioned without saying whose');
 assert.equal((await repo.registerInstitution(d,{name:'Universidad Uno',kind:'educational',locality:'Córdoba',message:'Otra sede'},true)).status,'registered');
 // Max 3 pending, with a clear message.
 await repo.registerInstitution(c,{name:'Instituto Cuatro',kind:'other',locality:'Salta',message:''},false);
 await fails(repo.registerInstitution(c,{name:'Instituto Cinco',kind:'other',locality:'Salta',message:''},false),/Ya tenés 3 solicitudes/);
 // Pending registrations never appear in the institution search; approved ones do.
 const search=async q=>plain((await inst.myInstitutions(d,q)).results).map(r=>r.name);
 assert.deepEqual(await search('Universidad'),['Universidad Uno']);assert.deepEqual(await search('Instituto'),[]);
 // Rejecting needs a reason; the registrant sees it in "Mis solicitudes".
 await fails(repo.rejectRegistration(b,pendingTres.id,''),/Motivo del rechazo/);
 await repo.rejectRegistration(b,pendingTres.id,'No pudimos verificarla');
 assert.equal(plain(await repo.myRegistrations(c)).find(r=>r.id===pendingTres.id).rejectionReason,'No pudimos verificarla');
 await fails(repo.approveRegistration(b,pendingTres.id),/ya fue resuelta/);
 // NEXUS admins by e-mail; never the last one.
 await fails(repo.grantNexusAdmin(b,'nadie@test.test'),/No hay ninguna cuenta/);
 await fails(repo.grantNexusAdmin(b,'d@test.test'),/ya es admin de NEXUS/);
 await repo.revokeNexusAdmin(b,d);await fails(repo.revokeNexusAdmin(b,b),/último admin de NEXUS/);
 const panel=plain(await repo.readNexusPanel(b));
 assert.deepEqual(panel.admins.map(x=>x.profileId),[b]);
 assert(panel.pending.some(r=>r.name==='Instituto Cuatro')&&!panel.pending.some(r=>r.name==='Universidad Tres'));
 assert.equal(panel.history[0].action,'revoke_admin');
 console.log('PASS app repository: only NEXUS admins, duplicate warning, max 3 pending, pending out of the search, reason visible to the registrant, never the last admin');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
