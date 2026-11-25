import { CampaignCardView } from "@/features/cards/components/CampaignCardScreen";

export const dynamic = "force-dynamic";

// #106: a campaign base card as a card (view mode). Editing is at ./editar.
export default async function CampaignCardPage({ params }: { params: Promise<{ id: string; fichaId: string }> }) {
  const { id, fichaId } = await params;
  return <CampaignCardView campaignId={id} cardId={fichaId} />;
}
