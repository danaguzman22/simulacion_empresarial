import { notFound, redirect } from "next/navigation";

import {
  getMasterCompany,
} from "@/features/companies/application/get-master-company";
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
  const result = await getMasterCompany(id);

  if (result.status === "unauthenticated") {
    redirect("/login/master");
  }

  if (result.status === "not-found") {
    notFound();
  }

  return <CompanyDetail company={result.company} />;
}
