import { RoleCards } from "@/features/cards/components/RoleCards";
import { notFound, redirect } from "next/navigation";
import { listCampaignGames } from "@/features/games/application/list-campaign-games";
import { CampaignGames } from "@/features/games/components/CampaignGames";
import { CampaignDetail } from "@/features/campaigns/components/CampaignDetail";

export const dynamic = "force-dynamic";

type CampaignPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  const result = await listCampaignGames(id);

  if (result.status === "unauthenticated") {
    redirect("/login/master");
  }

  if (result.status === "not-found") {
    notFound();
  }

  return (
    <CampaignDetail
      campaign={result.campaign}
      canReturnToCompany={result.canReturnToCompany}
    >
      <RoleCards scope={{ kind: "campaign", id: result.campaign.id }} />
      <CampaignGames
        campaignId={result.campaign.id}
        games={result.games}
        canCreateGame={result.canCreateGame}
      />
    </CampaignDetail>
  );
}
