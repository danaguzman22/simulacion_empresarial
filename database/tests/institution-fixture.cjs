// Only called by disposable local PostgreSQL suites after 0030.
// After 0034 (#6) a new institution must come from an approved registration: the admin registers it and a NEXUS
// admin approves it (a fixture NEXUS admin is created if there is none). Each one gets its own locality, because
// name + locality are unique (D-41). Before 0034, the institution is inserted.
const {randomUUID}=require('node:crypto');
module.exports=async function institutionFixture(sql,people,admin){
 const [{registrations}]=await sql`select to_regclass('public.institution_registrations') is not null as registrations`;
 let id;
 if(!registrations){
  id=randomUUID();await sql`insert into institutions(id,name,type) values(${id},'Test institution','educational')`;
  await sql`insert into institution_members(institution_id,profile_id,role,granted_by) values(${id},${admin},'admin',${admin})`;
 }else{
  let [nexus]=await sql`select profile_id from nexus_admins where revoked_at is null limit 1`;
  if(!nexus){const person=randomUUID();await sql`insert into auth.users values(${person},${'nexus-fixture-'+person+'@test.test'},'{}')`;
   await sql`insert into nexus_admins(profile_id) values(${person})`;nexus={profile_id:person};}
  const [{registration}]=await sql`select register_institution(${admin},'Test institution','educational',${'Test '+randomUUID().slice(0,8)},'') as registration`;
  [{id}]=await sql`select approve_institution_registration(${nexus.profile_id},${registration}) as id`;
 }
 for(const person of people)if(person!==admin)await sql`insert into institution_members(institution_id,profile_id,role,granted_by) values(${id},${person},'member',${admin})`;
 return id;
};
