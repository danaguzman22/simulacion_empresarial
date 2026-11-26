import Link from "next/link";
import { getSession } from "@/features/session/application/get-session";
import { availableAreas } from "@/features/session/domain/session";
import { readAreaAccess } from "@/features/session/repositories/session.repository";

// #100: NEXUS's own 404, for unknown URLs and for every notFound() of the app. It is the same page for
// "does not exist" and "no access", so it never reveals whether something exists. With a session it offers
// the areas the person can use (same rule as "Ir a", decided on the server); without one, the home page.
export default async function NotFound() {
  const session = await getSession();
  const areas = session ? availableAreas({ ...(await readAreaAccess(session.userId)), nexus: session.nexusAdmin }) : [];
  return <main className="flex min-h-screen flex-1 items-center justify-center bg-slate-950 px-5 py-12 text-white">
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.4em] text-sky-400">NEXUS</p>
      <h1 className="mt-4 text-2xl font-black">Esta página no existe o no tenés acceso</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">Revisá la dirección o volvé a un lugar conocido.</p>
      <div className="mt-6 flex flex-col items-center gap-3">
        {areas.map((a, i) => <Link key={a.area} href={a.href} className={i === 0
          ? "rounded-xl bg-sky-600 px-5 py-2 font-bold text-white hover:bg-sky-500"
          : "text-sm text-sky-300 hover:underline"}>Ir a {a.label}</Link>)}
        <Link href="/" className={areas.length ? "text-sm text-slate-400 hover:underline" : "rounded-xl bg-sky-600 px-5 py-2 font-bold text-white hover:bg-sky-500"}>Ir a la portada</Link>
      </div>
    </section>
  </main>;
}
