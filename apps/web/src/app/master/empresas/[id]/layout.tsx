import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { SectionTabs } from "@/components/shared/SectionTabs";
import { loadMasterCompany } from "@/features/companies/application/get-master-company";
import { CompanyDetail } from "@/features/companies/components/CompanyDetail";
import { UserBar } from "@/features/session/components/UserBar";

export const dynamic = "force-dynamic";

// #100 / D-44: the company as a detail with its sections, like the campaign: Campañas · Datos. One section per
// screen. Each tab checks access again on the server (only the owner reads the company).
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadMasterCompany(id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const base = `/master/empresas/${result.company.id}`;
  return <>
    <UserBar area="panel" />
    <CompanyDetail company={result.company}
      nav={<SectionTabs label="Secciones de la empresa" tabs={[{ href: base, label: "Campañas" }, { href: `${base}/datos`, label: "Datos" }]} />}>
      <div className="mt-6">{children}</div>
    </CompanyDetail>
  </>;
}
