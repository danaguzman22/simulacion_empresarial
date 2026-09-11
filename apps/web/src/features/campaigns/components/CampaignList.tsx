import type { findCampaignsByCompany } from "../repositories/campaign.repository";

export type CampaignListItem =
  Awaited<ReturnType<typeof findCampaignsByCompany>>[number];

const statusLabels: Record<CampaignListItem["status"], string> = {
  draft: "Borrador",
  active: "Activa",
  completed: "Completada",
  archived: "Archivada",
};

export function CampaignList({ campaigns }: { campaigns: CampaignListItem[] }) {
  if (campaigns.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-400">
        Esta empresa todavía no tiene campañas.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {campaigns.map((campaign) => (
        <li key={campaign.id} className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
          <p className="text-xs font-black uppercase tracking-widest text-sky-400">
            {statusLabels[campaign.status]}
          </p>
          <h3 className="mt-2 break-words text-xl font-black text-white">
            {campaign.name}
          </h3>
          {campaign.description && (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">
              {campaign.description}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
