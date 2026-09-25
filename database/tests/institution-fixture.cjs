// Only called by disposable local PostgreSQL suites after 0030.
const {randomUUID}=require('node:crypto');
module.exports=async function institutionFixture(sql,people,admin){
 const id=randomUUID();await sql`insert into institutions(id,name,type) values(${id},'Test institution','educational')`;
 for(const person of people)await sql`insert into institution_members(institution_id,profile_id,role,granted_by) values(${id},${person},${person===admin?'admin':'member'},${admin})`;
 return id;
};
