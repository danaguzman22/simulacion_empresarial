import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import type { ReactNode } from "react";
import type { getCampaignDetail } from "../application/get-campaign-detail";
import { CampaignStatus } from "./CampaignStatus";

type DetailResult = Extract<
  Awaited<ReturnType<typeof getCampaignDetail>>,
  { status: "found" }
>;

type CampaignDetailProps = Pick<DetailResult, "campaign" | "canReturnToCompany"> & {
  children?: ReactNode;
  nav?: ReactNode;
};

export function CampaignDetail({
  campaign,
  canReturnToCompany,
  children,
  nav,
}: CampaignDetailProps) {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        {/* D-44: the route on top; the company is a link only for whoever can open its page (its owner). */}
        <Breadcrumbs items={[{ label: "Panel", href: "/master" }, { label: campaign.companyName, href: canReturnToCompany ? `/master/empresas/${campaign.companyId}` : undefined }, { label: campaign.name }]} />

        <article className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
          <header>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-sky-400">
              Campaña
            </p>
            <h1 className="mt-3 break-words text-4xl font-black tracking-tight">
              {campaign.name}
            </h1>
          </header>

          <p className="mt-4 max-w-2xl whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">
            {campaign.description || "Sin descripción."}
          </p>

          <dl className="mt-6 grid gap-6 sm:grid-cols-3">
            <div>
              <dt className="mb-2 text-sm text-slate-400">Estado</dt>
              <dd><CampaignStatus status={campaign.status} /></dd>
            </div>
            <div>
              <dt className="mb-2 text-sm text-slate-400">Empresa</dt>
              <dd className="break-words font-bold">{campaign.companyName}</dd>
            </div>
            <div>
              <dt className="mb-2 text-sm text-slate-400">Fecha de creación</dt>
              <dd>
                <time dateTime={campaign.createdAt.toISOString()}>
                  {campaign.createdAt.toLocaleDateString("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                  })}
                </time>
              </dd>
            </div>
          </dl>
        </article>

        {nav}
        {children}
      </div>
    </main>
  );
}
