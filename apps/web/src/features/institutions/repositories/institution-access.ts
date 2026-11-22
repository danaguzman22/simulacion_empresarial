import "server-only";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { campaigns, companies, institutionMembers } from "@/db/schema";
import type { Transaction } from "@/features/preparation/repositories/preparation.repository";
import { InstitutionError } from "../domain/institution";
export const institutionAccessSql = (companyId: typeof companies.id, actorId: string) => sql<boolean>`public.company_institution_access(${companyId}, ${actorId}::uuid)`;
// #72 / D-39: narrows a listing to the active institution (plus companies without institution, which belong to no
// institution and are shown everywhere, as before). undefined = no narrowing. It never grants access: combine it
// with institutionAccessSql, which still requires an active membership.
export const inActiveInstitution = (institutionColumn: typeof companies.institutionId, institutionId: string | null | undefined) =>
  institutionId === undefined ? undefined : institutionId === null ? isNull(institutionColumn) : or(isNull(institutionColumn), eq(institutionColumn, institutionId));
export async function requireInstitutionMember(tx: Transaction, institutionId: string, actor: string, write = false) {
  const query = tx.select().from(institutionMembers).where(and(eq(institutionMembers.institutionId, institutionId), eq(institutionMembers.profileId, actor), eq(institutionMembers.status, "active")));
  const [member] = write ? await query.for("share") : await query;
  if (!member) throw new InstitutionError("Necesitás membresía aprobada y vigente en esta institución.");
  return member;
}
export async function requireCompanyInstitution(tx: Transaction, companyId: string, actor: string, write = false) {
  const query = tx.select().from(companies).where(eq(companies.id, companyId));
  const [company] = write ? await query.for("share") : await query;
  if (!company) throw new InstitutionError("Empresa no disponible.");
  if (company.institutionId) await requireInstitutionMember(tx, company.institutionId, actor, write);
  return company;
}
export async function requireCampaignInstitution(tx: Transaction, campaignId: string, actor: string, write = false) {
  const [campaign] = await tx.select({ companyId: campaigns.companyId }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) throw new InstitutionError("Campaña no disponible.");
  return requireCompanyInstitution(tx, campaign.companyId, actor, write);
}
