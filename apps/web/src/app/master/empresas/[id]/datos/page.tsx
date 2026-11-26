import { notFound, redirect } from "next/navigation";
import { loadMasterCompany } from "@/features/companies/application/get-master-company";
import { CompanyInstitutionLink } from "@/features/institutions/components/CompanyInstitutionLink";

export const dynamic = "force-dynamic";

// #100: Datos tab of the company: description, creation date and its link to an institution (the form to link
// it, while it is pending). Same access as the Campañas tab.
export default async function CompanyDataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadMasterCompany(id);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const { company } = result;
  return <section aria-label="Datos de la empresa" className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
    <dl className="grid gap-6 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <dt className="mb-2 text-sm text-slate-400">Descripción</dt>
        <dd className="whitespace-pre-wrap break-words text-sm leading-6">{company.description || "Sin descripción."}</dd>
      </div>
      <div>
        <dt className="mb-2 text-sm text-slate-400">Creada</dt>
        <dd><time dateTime={company.createdAt.toISOString()}>{company.createdAt.toLocaleDateString("es-AR")}</time></dd>
      </div>
      <div>
        <dt className="mb-2 text-sm text-slate-400">Institución</dt>
        <dd className={company.institutionId ? "font-bold" : "font-bold text-amber-300"}>{company.institutionId ? "Vinculada" : "Pendiente de vinculación"}</dd>
      </div>
    </dl>
    {!company.institutionId && <CompanyInstitutionLink companyId={company.id} />}
  </section>;
}
