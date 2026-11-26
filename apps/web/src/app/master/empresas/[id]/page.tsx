import { notFound, redirect } from "next/navigation";
import { listCompanyCampaigns } from "@/features/campaigns/application/list-company-campaigns";
import { CompanyCampaigns } from "@/features/campaigns/components/CompanyCampaigns";

export const dynamic = "force-dynamic";

type CompanyPageProps = {
  params: Promise<{ id: string }>;
};

// #100: Campañas tab of the company (create a campaign and the list). The header and tabs come from the layout.
export default async function CompanyPage({ params }: CompanyPageProps) {
  const { id } = await params;
  const result = await listCompanyCampaigns(id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  return <CompanyCampaigns companyId={result.company.id} canCreate={Boolean(result.company.institutionId)} campaigns={result.campaigns} />;
}
