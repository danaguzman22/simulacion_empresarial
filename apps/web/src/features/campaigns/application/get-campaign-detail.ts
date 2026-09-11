import "server-only";

import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { canViewCampaignDetail } from "../domain/campaign-access";
import { findCampaignByIdForMember } from "../repositories/campaign.repository";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCampaignDetail(campaignId: string) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return { status: "unauthenticated" } as const;
  }

  if (!uuidPattern.test(campaignId)) {
    return { status: "not-found" } as const;
  }

  const campaign = await findCampaignByIdForMember(campaignId, userId);

  if (!campaign || !canViewCampaignDetail(campaign.memberRole)) {
    return { status: "not-found" } as const;
  }

  return {
    status: "found",
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      createdAt: campaign.createdAt,
      companyId: campaign.companyId,
      companyName: campaign.companyName,
    },
    canReturnToCompany: campaign.companyOwnerId === userId,
  } as const;
}
