import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getCampaignDetail } from "@/features/campaigns/application/get-campaign-detail";
import { UserBar } from "@/features/session/components/UserBar";

export const dynamic = "force-dynamic";

// #78 / D-44: detail screens of a campaign (a card) show the route on top instead of the campaign tabs.
export default async function CampaignDetailLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const result = await getCampaignDetail((await params).id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  return <><UserBar area="panel" campaignRole={result.memberRole} />{children}</>;
}
