import { notFound, redirect } from "next/navigation";
import { listCampaignGames } from "@/features/games/application/list-campaign-games";
import { CampaignGames } from "@/features/games/components/CampaignGames";

export const dynamic = "force-dynamic";

// #78: Partidas, the first tab of the campaign (the header and tabs come from the layout).
export default async function CampaignGamesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await listCampaignGames(id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  return <CampaignGames campaignId={result.campaign.id} games={result.games} canCreateGame={result.canCreateGame} />;
}
