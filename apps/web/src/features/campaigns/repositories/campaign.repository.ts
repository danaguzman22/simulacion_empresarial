import { institutionAccessSql, requireCompanyInstitution } from "@/features/institutions/repositories/institution-access";
import { InstitutionError } from "@/features/institutions/domain/institution";
import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignMembers, companies } from "@/db/schema";
import type { CreateCampaignInput } from "../domain/campaign";

export async function createCampaign(input: CreateCampaignInput) {
  return db.transaction(async (tx) => {
    const company = await requireCompanyInstitution(tx, input.companyId, input.createdBy, true);
    if (company.createdBy !== input.createdBy || !company.institutionId) throw new InstitutionError("Vinculá la empresa a una institución antes de crear nuevas campañas.");
    const [campaign] = await tx
      .insert(campaigns)
      .values({
        companyId: input.companyId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        createdBy: input.createdBy,
      })
      .returning();

    if (!campaign) {
      throw new Error("No se pudo obtener la campaña creada.");
    }

    await tx.insert(campaignMembers).values({
      campaignId: campaign.id,
      profileId: input.createdBy,
      role: "master",
    });

    return campaign;
  });
}

export async function findCampaignsByCompany(companyId: string, actorId: string) {
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      description: campaigns.description,
      status: campaigns.status,
    })
    .from(campaigns)
    .innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(campaigns.companyId, companyId), eq(companies.createdBy, actorId), institutionAccessSql(companies.id, actorId)))
    .orderBy(asc(campaigns.createdAt), asc(campaigns.id));
}

export async function findCampaignByIdForMember(
  campaignId: string,
  profileId: string
) {
  const [campaign] = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      description: campaigns.description,
      status: campaigns.status,
      createdAt: campaigns.createdAt,
      companyId: companies.id,
      companyName: companies.name,
      companyOwnerId: companies.createdBy,
      memberRole: campaignMembers.role,
    })
    .from(campaigns)
    .innerJoin(
      campaignMembers,
      and(
        eq(campaignMembers.campaignId, campaigns.id),
        eq(campaignMembers.profileId, profileId)
      )
    )
    .innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(campaigns.id, campaignId), institutionAccessSql(companies.id, profileId)))
    .limit(1);

  return campaign ?? null;
}
