import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
// Administrative authority comes from existing server-managed relationships,
// never from signup metadata or editable profile fields.
export async function isTeacherAccount(profileId: string) {
  const rows = await db.execute(sql`select
    exists(select 1 from public.companies c where c.created_by=${profileId}::uuid and public.company_institution_access(c.id,${profileId}::uuid))
    or exists(select 1 from public.campaign_members m join public.campaigns c on c.id=m.campaign_id where m.profile_id=${profileId}::uuid and public.company_institution_access(c.company_id,${profileId}::uuid))
    or exists(select 1 from public.institution_members where profile_id=${profileId}::uuid and status='active' and role in ('teacher','admin')) as allowed`);
  return rows[0]?.allowed === true;
}
