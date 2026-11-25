import { notFound } from "next/navigation";
import { DetailShell } from "@/components/shared/DetailShell";
import { getCampaignDetail } from "@/features/campaigns/application/get-campaign-detail";
import { CardEditor, loadCardEditor } from "./CardEditor";

// #78: a campaign base card (new or existing) in its own screen: "Panel › <Empresa> › <Campaña> › Fichas › <Ficha>".
export async function CampaignCardScreen({ campaignId, cardId }: { campaignId: string; cardId: string | null }) {
  const campaign = await getCampaignDetail(campaignId);
  if (campaign.status !== "found") notFound();
  const scope = { kind: "campaign", id: campaign.campaign.id } as const;
  const editor = await loadCardEditor(scope, cardId);
  const base = `/master/campanas/${campaign.campaign.id}`;
  const title = editor.card ? `${editor.card.visualIdentity} ${editor.card.name}`.trim() : "Nueva ficha";
  return <DetailShell title={title} subtitle={editor.card ? "Ficha base de la campaña. Los cambios se usan al copiarla a una partida." : "Ficha base de la campaña."} crumbs={[
    { label: "Panel", href: "/master" },
    { label: campaign.campaign.companyName, href: campaign.canReturnToCompany ? `/master/empresas/${campaign.campaign.companyId}` : undefined },
    { label: campaign.campaign.name, href: base },
    { label: "Fichas", href: `${base}/fichas` },
    { label: editor.card ? editor.card.name : "Nueva ficha" },
  ]}><CardEditor scope={scope} {...editor} doneHref={`${base}/fichas`} /></DetailShell>;
}
