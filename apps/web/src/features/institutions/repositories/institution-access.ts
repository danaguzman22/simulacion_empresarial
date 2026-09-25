import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { campaigns, companies, institutionMembers } from "@/db/schema";
import type { Transaction } from "@/features/preparation/repositories/preparation.repository";
import { InstitutionError } from "../domain/institution";
export const institutionAccessSql = (companyId: typeof companies.id, actorId: string) => sql<boolean>`public.company_institution_access(${companyId}, ${actorId}::uuid)`;
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
