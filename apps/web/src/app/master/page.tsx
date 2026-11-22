import Link from "next/link";
import { teachingInstitutions } from "@/features/institutions/repositories/institution.repository";
import { isTeacherAccount } from "@/features/auth/repositories/teacher-access.repository";
import { getActiveInstitutionId } from "@/features/session/application/get-session";
import { UserBar } from "@/features/session/components/UserBar";
import {
  redirect,
} from "next/navigation";

import {
  MasterHeader,
} from "@/components/master/MasterHeader";

import {
  getAuthenticatedUserId,
} from "@/features/auth/application/get-authenticated-user-id";

import {
  listMasterCompanies,
} from "@/features/companies/application/list-master-companies";

import {
  CompanyList,
} from "@/features/companies/components/CompanyList";

import {
  CreateCompanyForm,
} from "@/features/companies/components/CreateCompanyForm";

export const dynamic =
  "force-dynamic";

export default async function MasterPage() {
  const userId =
    await getAuthenticatedUserId();

  if (!userId) {
    redirect("/login/master");
  }

  // D-31: entering through the administrative door does not grant permissions; without them, a notice.
  if (!await isTeacherAccount(userId)) {
    return <><UserBar area="participant" /><main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-black">Acceso administrativo</h1>
      <p className="text-slate-300">Tu cuenta no tiene permisos administrativos en tu institución activa ni en otra. Los da un administrador de la institución.</p>
      <Link href="/alumno" className="inline-block text-sky-300 hover:underline">Ir a mis partidas</Link>
    </div></main></>;
  }
  // #72: everything in the panel belongs to the active institution (D-32, D-39).
  const activeInstitution = await getActiveInstitutionId();
  const institutions = (await teachingInstitutions(userId)).filter(i => i.id === activeInstitution);
  const companies =
    await listMasterCompanies(
      userId,
      activeInstitution
    );

  return (
    <>
    <UserBar area="panel" />
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">

        <MasterHeader />

        <section className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">

          <div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">

              <p className="text-xs font-black uppercase tracking-widest text-sky-400">
                Nueva simulación
              </p>

              <h2 className="mt-2 text-2xl font-black">
                Crear empresa
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                La empresa será el escenario
                base sobre el que se desarrollará
                una o más campañas.
              </p>

              <div className="mt-6">
                <CreateCompanyForm institutions={institutions} />
              </div>

            </div>
          </div>

          <div>

            <div className="mb-5 flex items-end justify-between">

              <div>
                <p className="text-xs font-black uppercase tracking-widest text-sky-400">
                  Simulaciones
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  Mis empresas
                </h2>
              </div>

              <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-bold text-slate-400">
                {companies.length}
              </span>

            </div>

            <CompanyList
              companies={companies}
            />

          </div>

        </section>

      </div>
    </main>
    </>
  );
}
