import { CampaignList, type CampaignListItem } from "./CampaignList";
import { CreateCampaignForm } from "./CreateCampaignForm";

type CompanyCampaignsProps = {
  companyId: string;
  canCreate: boolean;
  campaigns: CampaignListItem[];
};

export function CompanyCampaigns({ companyId, campaigns, canCreate }: CompanyCampaignsProps) {
  return (
    <section aria-label="Campañas de la empresa" className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
        <h2 className="text-2xl font-black">Crear campaña</h2>
        <div className="mt-6">
          {canCreate ? <CreateCampaignForm companyId={companyId} /> : <p className="text-amber-300">Vinculá la empresa a una institución para crear nuevas campañas.</p>}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-black">Campañas</h2>
          <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400">
            {campaigns.length}
          </span>
        </div>
        <CampaignList campaigns={campaigns} />
      </div>
    </section>
  );
}
