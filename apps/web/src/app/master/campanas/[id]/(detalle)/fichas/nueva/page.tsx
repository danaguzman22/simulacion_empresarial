import { CampaignCardScreen } from "@/features/cards/components/CampaignCardScreen";

export const dynamic = "force-dynamic";

export default async function NewCampaignCardPage({ params }: { params: Promise<{ id: string }> }) {
  return <CampaignCardScreen campaignId={(await params).id} cardId={null} />;
}
