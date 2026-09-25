import { getInstitution } from "@/features/institutions/application/get-institutions";
import { InstitutionDetail } from "@/features/institutions/components/InstitutionDetail";
export const dynamic = "force-dynamic";
export default async function InstitutionPage({ params }: { params: Promise<{ id: string }> }) {
  return <InstitutionDetail data={await getInstitution((await params).id)} />;
}
