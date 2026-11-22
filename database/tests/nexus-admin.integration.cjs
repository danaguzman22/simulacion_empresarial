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
// complete data in 4 steps (CUIT, unique legal name + place, contacts), NEXUS admins create institutions and add
// (never remove) institution admins, every action is recorded, history is append-only and anon/authenticated get nothing.
async function main() {
 await sql.unsafe('CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);');
 const migrate=async file=>sql.begin(async tx=>{for(const statement of fs.readFileSync(root+'/database/migrations/'+file,'utf8').replace(/^﻿/,'').split('--> statement-breakpoint'))if(statement.trim())await tx.unsafe(statement);});
 const files=fs.readdirSync(root+'/database/migrations').filter(f=>f.endsWith('.sql')).sort();
 for(const file of files.filter(f=>f<'0034'))await migrate(file);
 // Data before 0034: an institution with its admin stays exactly as it was.
 const [a,b,c,d,e]=[randomUUID(),randomUUID(),randomUUID(),randomUUID(),randomUUID()];
 for(const [id,email] of [[a,'a@test.test'],[b,'b@test.test'],[c,'c@test.test'],[d,'d@test.test'],[e,'e@test.test']])await sql`INSERT INTO auth.users VALUES(${id},${email},'{}')`;
 const fixture=require('./institution-fixture.cjs');
 const old=await fixture(sql,[d],d);
 for(const file of files.filter(f=>f>='0034'))await migrate(file);
 assert.deepEqual([...await sql`select name,type,locality,legal_name,tax_id from institutions where id=${old}`].map(r=>({...r})),[{name:'Test institution',type:'educational',locality:null,legal_name:null,tax_id:null}]);
 const fails=async(promise,pattern)=>{await assert.rejects(promise,pattern);};
 console.log('PASS 0034 applies over existing data; existing institutions untouched (new columns null)');

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
 await fails(sql`truncate nexus_admins`,/append-only/);
 console.log('PASS NEXUS admins: first only by script, then only an active admin grants; revoke others or oneself, never the last; never deleted');

 // Registrations: complete data; pending outside "institutions"; at most 3 pending; formats and rules by type/country.
 const data=fixture.registrationData;
 const register=(actor,overrides={},email='person@test.test')=>sql`select register_institution(${actor},${email},${JSON.stringify(data(overrides))}::jsonb) as id`.then(r=>r[0].id);
 const institutions=async()=>(await sql`select count(*)::int as n from institutions`)[0].n;
 const before=await institutions();
 const r1=await register(c,{legalName:'  Universidad Uno  ',displayName:'UNO',taxId:'20123456786',website:'https://uno.edu.ar',address:'Calle 1',
  alternate:{name:'Ana Pérez',position:'Secretaria',email:'ANA@uno.edu.ar',phone:null}},'C@Test.Test');
 const r2=await register(c,{legalName:'Universidad Dos'}),r3=await register(c,{legalName:'Universidad Tres'});
 await fails(register(c,{legalName:'Universidad Cuatro'}),/At most 3 pending/);
 assert.equal(await institutions(),before,'pending registrations never become institutions');
 assert.deepEqual({...(await sql`select name,display_name,tax_id,country,province,authorized_at is not null as authorized,created_by,created_by_nexus from institution_registrations where id=${r1}`)[0]},
  {name:'Universidad Uno',display_name:'UNO',tax_id:'20123456786',country:'AR',province:'Córdoba',authorized:true,created_by:c,created_by_nexus:false});
 assert.deepEqual((await sql`select kind,profile_id,name,position,area,email,phone from institution_contacts where registration_id=${r1} order by kind`).map(r=>({...r})),[
  {kind:'alternate',profile_id:null,name:'Ana Pérez',position:'Secretaria',area:null,email:'ana@uno.edu.ar',phone:null},
  {kind:'institutional',profile_id:null,name:null,position:null,area:null,email:'institution@test.test',phone:'351 000 0000'},
  {kind:'responsible',profile_id:c,name:null,position:'Director',area:'Rectorado',email:'c@test.test',phone:null}]);
 // Uniqueness: legal name + country + province + locality (case, accents, spaces ignored); another place is allowed.
 await fails(register(d,{legalName:'UNIVERSIDAD   uno',locality:'CORDOBA'}),/already exists in that locality/);
 await register(d,{legalName:'Universidad Uno',locality:'Río Cuarto'});
 await register(e,{legalName:'Universidad Uno',province:'Santa Fe',locality:'Córdoba'});
 // CUIT: check digit, only for Argentina; unique when present (pending or institution). Other countries: free text.
 await fails(register(e,{legalName:'Otra A',taxId:'20123456780'}),/Invalid CUIT/);
 await fails(register(e,{legalName:'Otra B',taxId:'20123456786'}),/tax id already exists/);
 await register(e,{legalName:'Otra C',country:'UY',province:'Montevideo',locality:'Montevideo',taxId:'RUT 21 0000000012'.replace(/\s/g,'').toUpperCase()});
 // Rules by type and country; no HTML; lengths; the authorization declaration and the contacts cannot be skipped.
 await fails(register(d,{legalName:'Escuela',kind:'ngo'}),/Education level only for educational/);
 await fails(register(d,{legalName:'Empresa',kind:'company',educationLevel:null,sector:'technology'}),/sector and size only/);
 await fails(register(d,{legalName:'Empresa',kind:'company',educationLevel:null,sector:'technology',companySize:'huge'}),/company_size_valid/);
 await fails(register(d,{legalName:'Lugar',province:'Atlántida'}),/Unknown Argentine province/);
 await fails(register(d,{legalName:'<b>Uni</b>'}),/name_valid/);await fails(register(d,{legalName:'Uni',locality:'<script>'}),/locality_valid/);
 await fails(register(d,{legalName:'Uni',message:'<a href=x>'}),/message_valid/);await fails(register(d,{legalName:'U'}),/name_valid/);
 await fails(register(d,{legalName:'x'.repeat(161)}),/name_valid/);await fails(register(d,{legalName:'Uni',website:'http://inseguro.com'}),/website_valid/);
 await fails(register(d,{legalName:'Uni',institutionalEmail:'no-es-correo'}),/email_valid/);await fails(register(d,{legalName:'Uni',institutionalPhone:'12'}),/phone_valid/);
 await fails(register(d,{legalName:'Uni',alternate:{name:'Sin datos',position:null,email:null,phone:null}}),/shape_valid/);
 await fails(sql.begin(async tx=>{await tx`insert into institution_registrations(profile_id,created_by,name,type,locality,education_level,organization_kind,country,province,postal_code)
  values(${d},${d},'Sin declaración','educational','Córdoba','university','direct','AR','Córdoba','5000')`;}),/declare being authorized/);
 await fails(sql.begin(async tx=>{await tx`insert into institution_registrations(profile_id,created_by,name,type,locality,education_level,organization_kind,country,province,postal_code,authorized_at)
  values(${d},${d},'Sin contactos','educational','Córdoba','university','direct','AR','Córdoba','5000',now())`;}),/institutional contact and its responsible/);
 await fails(sql.begin(async tx=>{await tx`insert into institution_registrations(profile_id,created_by,name,type,locality,education_level,organization_kind,country,province,postal_code,authorized_at)
  values(${d},${c},'Ajena','educational','Córdoba','university','direct','AR','Córdoba','5000',now())`;}),/sent by its registrant/);
 console.log('PASS registrations: complete data, outside institutions while pending, max 3 pending, unique legal name + place and CUIT, CUIT check digit, rules by type and country, contacts and declaration required');

 // Approving: only an active NEXUS admin; creates the institution with all its data and makes the registrant its admin.
 await fails(sql`select approve_institution_registration(${c},${r1})`,/Only an active NEXUS admin/);
 const created=(await sql`select approve_institution_registration(${b},${r1}) as id`)[0].id;
 assert.deepEqual({...(await sql`select name,legal_name,display_name,type,locality,tax_id,website,country,province,postal_code,address from institutions where id=${created}`)[0]},
  {name:'UNO',legal_name:'Universidad Uno',display_name:'UNO',type:'educational',locality:'Córdoba',tax_id:'20123456786',website:'https://uno.edu.ar',country:'AR',province:'Córdoba',postal_code:'5000',address:'Calle 1'});
 assert.deepEqual({...(await sql`select profile_id,role,status,granted_by from institution_members where institution_id=${created}`)[0]},{profile_id:c,role:'admin',status:'active',granted_by:b});
 assert.equal((await sql`select count(*)::int n from institution_contacts where registration_id=${r1} and institution_id=${created}`)[0].n,3,'contacts linked to the institution');
 await fails(sql`select approve_institution_registration(${b},${r1})`,/no longer pending/);
 await fails(register(d,{legalName:' universidad uno ',locality:'CÓRDOBA'}),/already exists in that locality/);
 // Rejecting: reason required, never filled in; the registrant can present it again.
 await fails(sql`select reject_institution_registration(${b},${r2},${null})`,/resolution_valid/);
 await fails(sql`select reject_institution_registration(${b},${r2},'  ')`,/reason_valid/);
 await fails(sql`select reject_institution_registration(${b},${r2},'')`,/reason_valid/);
 await sql`select reject_institution_registration(${b},${r2},'Falta la localidad exacta')`;
 await register(c,{legalName:'Universidad Dos'});
 // Direct changes are blocked: content is immutable, contacts too, approval needs a real new institution.
 await fails(sql`update institution_registrations set name='Otra' where id=${r3}`,/immutable/);
 await fails(sql`update institution_registrations set status='approved',resolved_at=now(),resolved_by=${b},institution_id=${old} where id=${r3}`,/Approval must create the institution/);
 await fails(sql`update institution_registrations set status='rejected',resolved_at=now(),resolved_by=${c},rejection_reason='no' where id=${r3}`,/Only an active NEXUS admin/);
 await fails(sql`delete from institution_registrations where id=${r3}`,/never deleted/);
 await fails(sql`update institution_contacts set email='otro@test.test' where registration_id=${r1}`,/only change by being linked/);
 await fails(sql`delete from institution_contacts where registration_id=${r1}`,/never deleted/);
 await fails(sql`insert into institution_contacts(registration_id,kind,name,email) values(${r1},'alternate','Tarde','x@test.test')`,/pending registration/);
 // A new institution only comes from an approved registration: a direct INSERT fails at commit.
 await fails(sql.begin(tx=>tx`insert into institutions(name,type,locality) values('Directa','other','Córdoba')`),/require an approved institution registration/);
 console.log('PASS approve/reject: only an active NEXUS admin, institution with all its data, registrant becomes admin, contacts linked, reason required, immutable, no institution without an approved registration');

 // NEXUS creates an institution for someone (phone or e-mail request): registration + approval, recorded as created by NEXUS.
 const newData=JSON.stringify(data({legalName:'Escuela Técnica',locality:'Villa María'}));
 await fails(sql`select nexus_create_institution(${c},${e},'e@test.test',${newData}::jsonb)`,/Only an active NEXUS admin/);
 await register(e,{legalName:'Pendiente P1'});assert.equal((await sql`select count(*)::int n from institution_registrations where profile_id=${e} and status='pending'`)[0].n,3);
 const school=(await sql`select nexus_create_institution(${b},${e},'e@test.test',${newData}::jsonb) as id`)[0].id;
 assert.deepEqual({...(await sql`select status,created_by,created_by_nexus,profile_id from institution_registrations where institution_id=${school}`)[0]},{status:'approved',created_by:b,created_by_nexus:true,profile_id:e},'not limited by the person\'s 3 pending');
 assert.deepEqual({...(await sql`select profile_id,role from institution_members where institution_id=${school}`)[0]},{profile_id:e,role:'admin'});
 // NEXUS adds an admin (reason required, recorded); it never removes admins.
 await fails(sql`select nexus_add_institution_admin(${c},${school},${d},'Pedido por correo')`,/Only an active NEXUS admin/);
 await fails(sql`select nexus_add_institution_admin(${b},${school},${d},'  ')`,/reason between 3 and 1000/);
 await sql`select nexus_add_institution_admin(${b},${school},${d},'Pedido por correo del rector')`;
 assert.deepEqual((await sql`select profile_id,role,status,granted_by from institution_members where institution_id=${school} order by created_at`).map(r=>({...r})),[
  {profile_id:e,role:'admin',status:'active',granted_by:b},{profile_id:d,role:'admin',status:'active',granted_by:b}]);
 await fails(sql`select nexus_add_institution_admin(${b},${school},${d},'Otra vez')`,/already an admin/);
 const [{removers}]=await sql`select count(*)::int removers from pg_proc where proname ~ 'remove_institution_admin|nexus_revoke_institution'`;
 assert.equal(removers,0,'there is no function for a NEXUS admin to remove institution admins');
 console.log('PASS NEXUS creates institutions for someone and adds admins with a reason; it cannot remove them');

 // Every action recorded, who to whom; the record is append-only.
 const log=(await sql`select actor_id,action,target_profile_id,details from nexus_admin_actions order by created_at,action`).map(r=>({...r,details:{...r.details}}));
 assert.deepEqual(log.map(r=>[r.action,r.actor_id,r.target_profile_id]),[
  ['grant_admin',null,a],['grant_admin',a,b],['revoke_admin',b,a],['grant_admin',b,a],['revoke_admin',a,a],['approve_institution',b,c],['reject_institution',b,c],
  ['create_institution',b,e],['add_institution_admin',b,d]]);
 assert.deepEqual(log[0].details,{first:true});assert.deepEqual(log[6].details,{reason:'Falta la localidad exacta'});assert.deepEqual(log.at(-1).details,{reason:'Pedido por correo del rector'});
 await fails(sql`update nexus_admin_actions set action='grant_admin'`,/append-only/);
 await fails(sql`delete from nexus_admin_actions`,/append-only/);
 await fails(sql`truncate nexus_admin_actions`,/append-only/);
 await fails(sql`truncate institution_registrations cascade`,/append-only/);
 console.log('PASS audit: grants, revokes, approvals, rejections, creations and added admins recorded with actor and target; append-only');

 // Privileges: anon and authenticated get nothing (contacts included); the server only reads and calls the functions.
 for(const role of ['anon','authenticated']){
  for(const table of ['nexus_admins','institution_contacts','institution_registrations'])
   await fails(sql.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx.unsafe(`select 1 from ${table} limit 1`);}),/permission denied/);
  await fails(sql.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx`select is_nexus_admin(${b})`;}),/permission denied/);
  await fails(sql.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx`select register_institution(${d},'d@test.test','{}'::jsonb)`;}),/permission denied/);
 }
 await sql.begin(async tx=>{await tx.unsafe('set local role service_role');assert.equal((await tx`select is_nexus_admin(${b}) as ok`)[0].ok,true);await tx`select count(*) from institution_contacts`;});
 await fails(sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`insert into nexus_admins(profile_id,granted_by) values(${d},${b})`;}),/permission denied/);
 await fails(sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`update institution_contacts set phone='1234567'`;}),/permission denied/);
 await fails(sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`select insert_institution_registration(${d},${d},false,'d@test.test','{}'::jsonb)`;}),/permission denied/);
 await sql.begin(async tx=>{await tx.unsafe('set local role service_role');await tx`select grant_nexus_admin(${b},${d})`;});
 assert.equal((await sql`select is_nexus_admin(${d}) as ok`)[0].ok,true);
 console.log('PASS privileges: anon/authenticated get nothing (contacts included); service_role reads and writes only through the functions');
 await appRepository({sql,a,b,c,d,e,fails,school,created,r3,data,register});
}
async function appRepository(){}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>sql.end());
