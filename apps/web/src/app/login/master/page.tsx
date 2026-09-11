import Link from "next/link";

import {
  MasterLoginForm,
} from "@/components/auth/MasterLoginForm";

export default function MasterLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-white">

      <div className="w-full max-w-md">

        <Link
          href="/"
          className="mb-8 inline-block text-xs font-bold uppercase tracking-widest text-slate-500 transition hover:text-white"
        >
          ← Volver
        </Link>

        <header className="mb-7">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-sky-400">
            NEXUS
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-tight">
            Acceso Master
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Iniciá sesión para administrar
            tus simulaciones empresariales.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-2xl">
          <MasterLoginForm />
        </section>

      </div>

    </main>
  );
}