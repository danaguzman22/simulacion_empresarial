import type { findCampaignsByCompany } from "../repositories/campaign.repository";

type Status = Awaited<ReturnType<typeof findCampaignsByCompany>>[number]["status"];

const statusLabels: Record<Status, string> = {
  draft: "Borrador",
  active: "Activa",
  completed: "Completada",
  archived: "Archivada",
};

export function CampaignStatus({ status }: { status: Status }) {
  return (
    <span className="text-xs font-black uppercase tracking-widest text-sky-400">
      {statusLabels[status]}
    </span>
  );
}
