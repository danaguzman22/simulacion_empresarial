import Link from "next/link";
import { getCompanyLinkOptions } from "../application/get-company-link-options";
import { CompanyInstitutionForm } from "./CompanyInstitutionForm";
export async function CompanyInstitutionLink({ companyId }: { companyId: string }) {
  const institutions = await getCompanyLinkOptions(companyId);
  return <section className="mt-6 rounded-2xl border border-white/10 p-5"><h2 className="text-xl font-bold">Vincular empresa a una institución</h2>
    <p className="mt-2 text-sm text-slate-300">Debés ser propietaria/o de esta empresa y administrador/a del destino. Los docentes y participantes existentes deben tener membresía aprobada allí.</p>
    {institutions.length ? <CompanyInstitutionForm companyId={companyId} institutions={institutions} /> : <p className="mt-3">No tenés una institución habilitada para vincular esta empresa. <Link className="text-sky-300" href="/instituciones">Ver mis instituciones</Link></p>}
  </section>;
}
