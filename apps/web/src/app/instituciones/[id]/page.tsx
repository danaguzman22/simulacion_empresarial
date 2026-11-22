import { redirect } from "next/navigation";
import { getInstitution } from "@/features/institutions/application/get-institutions";
import { InstitutionDetail } from "@/features/institutions/components/InstitutionDetail";
export const dynamic = "force-dynamic";
export default async function InstitutionPage({ params }: { params: Promise<{ id: string }> }) {
  const data = await getInstitution((await params).id);
  // #72: only administrators see the institution detail; members and participants go back to their list.
  if (!data.canManage) redirect("/instituciones");
  return <InstitutionDetail data={data} />;
}
