import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, campaignMembers, companies } from "@/db/schema";
import type { CreateCampaignInput } from "../domain/campaign";

export async function createCampaign(input: CreateCampaignInput) {
  return db.transaction(async (tx) => {
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

export async function findCampaignsByCompany(companyId: string) {
  return db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      description: campaigns.description,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(eq(campaigns.companyId, companyId))
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
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  return campaign ?? null;
}
