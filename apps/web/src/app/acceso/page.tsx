import Link from "next/link";
import { getExperiences } from "@/features/auth/application/get-experiences";
import { signOutStudent } from "@/features/auth/application/student-auth";
export const dynamic = "force-dynamic";
export default async function AccessPage() {
  const data = await getExperiences();
  return <main className="min-h-screen bg-slate-950 px-5 py-12 text-white"><div className="mx-auto max-w-xl space-y-5"><h1 className="text-3xl font-black">NEXUS · Mis accesos</h1>
    {data.teacher && <Link className="block rounded-xl border border-white/10 p-5" href="/master">Entrar al Panel Master / Docentes</Link>}
    {data.participant && <Link className="block rounded-xl border border-white/10 p-5" href="/alumno">Mis partidas como participante</Link>}
    {!data.teacher && !data.participant && <p className="text-slate-300">Tu cuenta todavía no tiene permisos docentes ni partidas asignadas. Podés solicitar acceso a una institución.</p>}
    <Link className="block rounded-xl border border-white/10 p-5" href="/instituciones">Mis instituciones / Solicitar acceso</Link>
    <form action={signOutStudent}><button className="text-sky-300">Cerrar sesión</button></form>
  </div></main>;
}
