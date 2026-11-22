import Link from "next/link";
import {
  AccessCard,
} from "@/components/home/AccessCard";
import { isTeacherAccount } from "@/features/auth/repositories/teacher-access.repository";
import { getSession } from "@/features/session/application/get-session";
import { signOut } from "@/features/session/application/session-actions";
import { roleLabel } from "@/features/session/domain/session";
import { readBestCampaignRole } from "@/features/session/repositories/session.repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  // #72: with a session, the home page says who is here instead of showing the doors as if nobody were.
  const panel = session ? await isTeacherAccount(session.userId) : false;
  const label = !session ? "" : panel
    ? roleLabel({ area: "panel", active: session.active, bestRole: session.active?.role === "teacher" ? null : await readBestCampaignRole(session.userId, session.active?.id ?? null) })
    : roleLabel({ area: "participant", active: session.active });
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-12 text-white">
      <div className="mx-auto max-w-5xl">

        <header className="mb-12 text-center">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-sky-400">
            Simulación empresarial
          </p>

          <h1 className="mt-4 text-5xl font-black tracking-tight md:text-7xl">
            NEXUS
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
            Plataforma de simulación empresarial
            para toma de decisiones,
            coordinación entre áreas y
            aprendizaje basado en escenarios.
          </p>
        </header>

        {session ? (
          <section className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center">
            <p className="text-lg">Ya estás como <strong>{session.name}</strong> ({label}).</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <Link href={panel ? "/master" : "/alumno"} className="rounded-xl bg-sky-600 px-5 py-2 font-bold text-white hover:bg-sky-500">Continuar</Link>
              <form action={signOut}><button className="rounded-xl border border-white/20 px-5 py-2 font-bold text-slate-200 hover:bg-white/10">Cerrar sesión</button></form>
            </div>
            {panel && <Link href="/alumno" className="mt-4 inline-block text-sm text-sky-300 hover:underline">Entrar como participante</Link>}
          </section>
        ) : (
          // D-31: two doors. Entering through one does not grant permissions.
          <section className="mx-auto grid max-w-3xl gap-5 md:grid-cols-2">

            <AccessCard
              icon="🎭"
              title="Acceso de usuarios"
              description="Entrá a tus partidas y a la ficha compartida de tu departamento."
              href="/login/alumno"
            />

            <AccessCard
              icon="🧭"
              title="Acceso administrativo"
              description="Administrá instituciones, empresas, campañas y partidas."
              href="/login/master"
            />

          </section>
        )}

        <footer className="mt-16 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-slate-700">
          Plataforma de simulación empresarial
        </footer>

      </div>
    </main>
  );
}
