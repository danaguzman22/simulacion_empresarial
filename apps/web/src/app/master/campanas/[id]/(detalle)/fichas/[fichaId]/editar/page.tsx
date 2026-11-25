import { CampaignCardScreen } from "@/features/cards/components/CampaignCardScreen";

export const dynamic = "force-dynamic";

export default async function CampaignCardPage({ params }: { params: Promise<{ id: string; fichaId: string }> }) {
  const { id, fichaId } = await params;
  return <CampaignCardScreen campaignId={id} cardId={fichaId} />;
}
