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

  const companies =
    await listMasterCompanies(
      userId
    );

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-8 text-white">
      <div className="mx-auto max-w-6xl">

        <MasterHeader />

        <section className="mt-10 grid gap-8 lg:grid-cols-[380px_1fr]">

          {/* CREAR EMPRESA */}

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
                <CreateCompanyForm />
              </div>

            </div>
          </div>

          {/* MIS EMPRESAS */}

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
  );
}