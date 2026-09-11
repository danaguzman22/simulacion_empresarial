import { notFound, redirect } from "next/navigation";
import { getCampaignDetail } from "@/features/campaigns/application/get-campaign-detail";
import { CampaignDetail } from "@/features/campaigns/components/CampaignDetail";

export const dynamic = "force-dynamic";

type CampaignPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  const result = await getCampaignDetail(id);

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
    />
  );
}
