import Link from "next/link";
import { getMyInstitutions } from "@/features/institutions/application/get-institutions";
import { InstitutionForm } from "@/features/institutions/components/InstitutionForm";
import { RegisterInstitutionForm } from "@/features/nexus/components/RegisterInstitutionForm";
export const dynamic = "force-dynamic";
const statusNames = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };
export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams, data = await getMyInstitutions(q);
  return <main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-4xl"><h1 className="text-3xl font-black">Mis instituciones</h1>
    <section className="mt-5 space-y-3">{!data.memberships.length && <p>Todavía no pertenecés a ninguna institución.</p>}{data.memberships.map(m => <p key={m.id}>{m.status === "active" ? (m.role === "admin" ? <Link href={`/instituciones/${m.id}`} className="text-sky-300">{m.name}</Link> : m.name) : `${m.name} · Membresía revocada`}</p>)}</section>
    <form className="mt-8 flex gap-3"><label>Buscar institución<input name="q" minLength={2} maxLength={160} defaultValue={q} className="ml-3 rounded bg-slate-900 p-2" /></label><button className="rounded border border-sky-500 px-3">Buscar</button></form>
    {q.length >= 2 && !data.results.length && <p className="mt-3">No se encontraron instituciones.</p>}
    {data.results.map(i => <article key={i.id} className="mt-4 rounded-xl border border-white/10 p-4"><h2 className="font-bold">{i.name}{i.locality && ` · ${i.locality}`}</h2>{data.memberships.some(m => m.id === i.id && m.status === "active") ? <p>Ya sos miembro.</p> : data.requests.some(r => r.institutionId === i.id && r.status === "pending") ? <p>Solicitud pendiente.</p> : <InstitutionForm institutionId={i.id} kind="request" />}</article>)}
    <section className="mt-8"><h2 className="text-xl font-bold">Mis solicitudes</h2>
      {!data.requests.length && !data.registrations.length && <p className="mt-3 text-slate-400">Todavía no hiciste solicitudes.</p>}
      {data.requests.map(r => <p key={r.id} className="mt-3">Acceso a {r.name} · {statusNames[r.status]} · {r.requestedAt.toLocaleDateString("es-AR")}</p>)}
      {data.registrations.map(r => <div key={r.id} className="mt-3"><p>Registro de {r.name} · {r.locality} · {statusNames[r.status]} · {r.requestedAt.toLocaleDateString("es-AR")}</p>
        {r.rejectionReason && <p className="text-sm text-slate-400">Motivo: {r.rejectionReason}. Podés presentarla de nuevo como una solicitud nueva.</p>}</div>)}
    </section>
    {/* #6 (D-41): any signed-in person can register an institution; a NEXUS admin approves it. */}
    <section className="mt-8 rounded-2xl border border-white/10 p-5"><h2 className="text-xl font-bold">Registrar una institución</h2>
      <p className="mt-1 text-sm text-slate-400">Si tu institución todavía no está en NEXUS, registrala. Queda pendiente hasta que la apruebe un admin de NEXUS; cuando la aprueben, vas a ser su admin.</p>
      <RegisterInstitutionForm />
    </section>
  </div></main>;
}
