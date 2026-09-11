import type { findCampaignsByCompany } from "../repositories/campaign.repository";
import Link from "next/link";
import { CampaignStatus } from "./CampaignStatus";

export type CampaignListItem =
  Awaited<ReturnType<typeof findCampaignsByCompany>>[number];

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
        <li key={campaign.id}>
          <Link
            href={`/master/campanas/${campaign.id}`}
            className="block rounded-3xl border border-white/10 bg-white/[0.05] p-5 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400"
          >
          <CampaignStatus status={campaign.status} />
          <h3 className="mt-2 break-words text-xl font-black text-white">
            {campaign.name}
          </h3>
          {campaign.description && (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">
              {campaign.description}
            </p>
          )}
          <span className="mt-4 block text-xs font-black uppercase tracking-widest text-sky-300">
            Abrir campaña →
          </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
