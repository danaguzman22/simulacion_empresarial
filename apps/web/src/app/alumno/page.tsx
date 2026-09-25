import Link from "next/link";
import { getStudentGames } from "@/features/students/application/student-access";
import { canReadAssignedCard } from "@/features/students/domain/assignment";
import { StudentRefresh } from "@/features/students/components/StudentRefresh";
import { signOutStudent } from "@/features/auth/application/student-auth";
export const dynamic = "force-dynamic";
export default async function StudentPage() {
  const games = await getStudentGames();
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-4xl"><div className="flex items-center justify-between"><div><h1 className="text-3xl font-black">Mis partidas</h1><Link href="/acceso" className="text-sky-300">Cambiar experiencia / Mis instituciones</Link></div><form action={signOutStudent}><button className="text-sky-300">Cerrar sesión</button></form></div>
    {!games.length && <p className="mt-6 text-slate-300">Todavía no tenés partidas asignadas. Compartí tu correo registrado con el Master.</p>}
    {games.map(g => <article key={g.id} className="mt-5 rounded-3xl border border-white/10 p-6"><p className="text-slate-400">{g.company} · {g.campaign}</p><h2 className="text-xl font-bold">{g.name}</h2>
      {canReadAssignedCard(g.status) ? <><p className="mt-2">Mi departamento: {g.department}</p><Link className="mt-3 inline-block text-sky-300" href={`/alumno/partidas/${g.id}`}>Entrar a mi ficha</Link></> : <p className="mt-2 text-slate-400">La partida todavía no comenzó. Tu ficha estará disponible al iniciar.</p>}
    </article>)}<StudentRefresh />
  </div></main>;
}
