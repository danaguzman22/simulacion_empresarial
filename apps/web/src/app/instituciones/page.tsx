import Link from "next/link";
import { getMyInstitutions } from "@/features/institutions/application/get-institutions";
import { InstitutionForm } from "@/features/institutions/components/InstitutionForm";
export const dynamic = "force-dynamic";
const statusNames = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };
export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams, data = await getMyInstitutions(q);
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-4xl"><Link href="/acceso" className="text-sky-300">Mis accesos</Link><h1 className="mt-5 text-3xl font-black">Mis instituciones</h1>
    <section className="mt-5 space-y-3">{!data.memberships.length && <p>Todavía no pertenecés a ninguna institución.</p>}{data.memberships.map(m => <p key={m.id}>{m.status === "active" ? <Link href={`/instituciones/${m.id}`} className="text-sky-300">{m.name}</Link> : `${m.name} · Membresía revocada`}</p>)}</section>
    <form className="mt-8 flex gap-3"><label>Buscar institución<input name="q" minLength={2} maxLength={160} defaultValue={q} className="ml-3 rounded bg-slate-900 p-2" /></label><button className="rounded border border-sky-500 px-3">Buscar</button></form>
    {q.length >= 2 && !data.results.length && <p className="mt-3">No se encontraron instituciones.</p>}
    {data.results.map(i => <article key={i.id} className="mt-4 rounded-xl border border-white/10 p-4"><h2 className="font-bold">{i.name}</h2>{data.memberships.some(m => m.id === i.id && m.status === "active") ? <p>Ya sos miembro.</p> : data.requests.some(r => r.institutionId === i.id && r.status === "pending") ? <p>Solicitud pendiente.</p> : <InstitutionForm institutionId={i.id} kind="request" />}</article>)}
    <section className="mt-8"><h2 className="text-xl font-bold">Mis solicitudes</h2>{data.requests.map(r => <p key={r.id} className="mt-3">{r.name} · {statusNames[r.status]} · {r.requestedAt.toLocaleDateString("es-AR")}</p>)}</section>
  </div></main>;
}
