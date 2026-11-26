import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailShell } from "@/components/shared/DetailShell";
import { getCampaignDetail } from "@/features/campaigns/application/get-campaign-detail";
import { CardEditor, loadCardEditor } from "./CardEditor";
import { CardSheet, loadCardView } from "./CardSheet";

async function campaignCrumbs(campaignId: string) {
  const campaign = await getCampaignDetail(campaignId);
  if (campaign.status !== "found") notFound();
  const base = `/master/campanas/${campaign.campaign.id}`;
  return { scope: { kind: "campaign", id: campaign.campaign.id } as const, base, crumbs: [
    { label: "Panel", href: "/master" },
    { label: campaign.campaign.companyName, href: campaign.canReturnToCompany ? `/master/empresas/${campaign.campaign.companyId}` : undefined },
    { label: campaign.campaign.name, href: base },
    { label: "Fichas", href: `${base}/fichas` },
  ] };
}

// #78: a campaign base card (new or existing) in its own edit screen: "Panel › <Empresa> › <Campaña> › Fichas › <Ficha>".
export async function CampaignCardScreen({ campaignId, cardId }: { campaignId: string; cardId: string | null }) {
  const { scope, base, crumbs } = await campaignCrumbs(campaignId);
  const editor = await loadCardEditor(scope, cardId);
  const title = editor.card ? `${editor.card.name}` : "Nueva ficha";
  return <DetailShell title={editor.card ? `Editar: ${title}` : title} subtitle={editor.card ? "Ficha base de la campaña. Los cambios se usan al copiarla a una partida." : "Ficha base de la campaña."}
    crumbs={[...crumbs, ...(editor.card ? [{ label: editor.card.name, href: `${base}/fichas/${editor.card.id}` }, { label: "Editar" }] : [{ label: "Nueva ficha" }])]}>
    <div className="mb-5"><Link href={`${base}/fichas`} className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400">← Volver a Fichas</Link></div>
    <CardEditor scope={scope} {...editor} doneHref={editor.card ? `${base}/fichas/${editor.card.id}` : `${base}/fichas`} />
  </DetailShell>;
}

// #106: a campaign base card in view mode (the card).
export async function CampaignCardView({ campaignId, cardId }: { campaignId: string; cardId: string }) {
  const { scope, base, crumbs } = await campaignCrumbs(campaignId);
  const view = await loadCardView(scope, cardId);
  return <DetailShell title={view.card.name} subtitle="Ficha base de la campaña." crumbs={[...crumbs, { label: view.card.name }]}>
    <div className="mb-5"><Link href={`${base}/fichas`} className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400">← Volver a Fichas</Link></div>
    <CardSheet scope={scope} {...view} editHref={`${base}/fichas/${view.card.id}/editar`} />
  </DetailShell>;
}
