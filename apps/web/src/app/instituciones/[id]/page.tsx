import { redirect } from "next/navigation";
import { getInstitution } from "@/features/institutions/application/get-institutions";
import { InstitutionDetail } from "@/features/institutions/components/InstitutionDetail";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { readInstitutionContacts } from "@/features/nexus/repositories/nexus.repository";
export const dynamic = "force-dynamic";
export default async function InstitutionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, data = await getInstitution(id);
  // #72: only administrators see the institution detail; members and participants go back to their list.
  if (!data.canManage) redirect("/instituciones");
  const actor = await getAuthenticatedUserId();
  return <InstitutionDetail data={data} contacts={actor ? await readInstitutionContacts(actor, id) : null} />;
}
