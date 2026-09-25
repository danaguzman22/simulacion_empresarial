import { notFound, redirect } from "next/navigation";
import { CompanyInstitutionLink } from "@/features/institutions/components/CompanyInstitutionLink";

import {
  listCompanyCampaigns,
} from "@/features/campaigns/application/list-company-campaigns";
import { CompanyCampaigns } from "@/features/campaigns/components/CompanyCampaigns";
import {
  CompanyDetail,
} from "@/features/companies/components/CompanyDetail";

export const dynamic = "force-dynamic";

type CompanyPageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompanyPage({
  params,
}: CompanyPageProps) {
  const { id } = await params;
  const result = await listCompanyCampaigns(id);

  if (result.status === "unauthenticated") {
    redirect("/login/master");
  }

  if (result.status === "not-found") {
    notFound();
  }

  return (
    <CompanyDetail company={result.company}>
      {!result.company.institutionId && <CompanyInstitutionLink companyId={result.company.id} />}
      <CompanyCampaigns
        companyId={result.company.id}
        canCreate={Boolean(result.company.institutionId)}
        campaigns={result.campaigns}
      />
    </CompanyDetail>
  );
}
