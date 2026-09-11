import "server-only";

import { getCampaignDetail } from "@/features/campaigns/application/get-campaign-detail";
import { canCreateGame, canReadGames } from "../domain/game-access";
import { findGamesByCampaign } from "../repositories/game.repository";

export async function listCampaignGames(campaignId: string) {
  const result = await getCampaignDetail(campaignId);
  if (result.status !== "found") return result;
  if (!canReadGames(result.memberRole)) {
    return { status: "not-found" } as const;
  }

  const games = await findGamesByCampaign(result.campaign.id);
  return {
    ...result,
    games,
    canCreateGame: canCreateGame(result.memberRole),
  };
}
