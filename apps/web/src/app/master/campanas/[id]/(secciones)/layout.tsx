import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { SectionTabs } from "@/components/shared/SectionTabs";
import { getCampaignDetail } from "@/features/campaigns/application/get-campaign-detail";
import { CampaignDetail } from "@/features/campaigns/components/CampaignDetail";
import { UserBar } from "@/features/session/components/UserBar";

export const dynamic = "force-dynamic";

// #78 / D-44: the campaign as an area with its sections, like the game (#69) and "Mis instituciones".
// Miembros and Sala stay hidden until they exist. Each tab checks its own permissions again on the server.
export default async function CampaignSectionsLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCampaignDetail(id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const base = `/master/campanas/${result.campaign.id}`;
  return <>
    <UserBar area="panel" campaignRole={result.memberRole} />
    <CampaignDetail campaign={result.campaign} canReturnToCompany={result.canReturnToCompany}
      nav={<SectionTabs label="Secciones de la campaña" tabs={[{ href: base, label: "Partidas" }, { href: `${base}/fichas`, label: "Fichas" }]} />}>
      <div className="mt-6">{children}</div>
    </CampaignDetail>
  </>;
}
