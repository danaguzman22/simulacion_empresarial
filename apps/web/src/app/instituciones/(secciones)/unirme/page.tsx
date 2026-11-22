import { EmptyState } from "@/components/shared/EmptyState";
import { getMyInstitutions } from "@/features/institutions/application/get-institutions";
import { InstitutionForm } from "@/features/institutions/components/InstitutionForm";

export const dynamic = "force-dynamic";

// Search an institution and ask to join. Pending or rejected registrations are not institutions: never listed (D-41).
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams, search = q.trim().slice(0, 160), data = await getMyInstitutions(search);
  return <>
    <form className="flex flex-wrap items-end gap-3"><label className="text-sm">Buscar institución<input name="q" minLength={2} maxLength={160} defaultValue={search} className="mt-1 block rounded bg-slate-900 p-2" /></label><button className="rounded border border-sky-500 px-3 py-2 text-sm">Buscar</button></form>
    {search.length >= 2 && !data.results.length && <div className="mt-4"><EmptyState title={`No encontramos instituciones que coincidan con «${search}».`} hint="Revisá cómo lo escribiste o" action={{ href: "/instituciones/registrar", label: "registrá tu institución" }} /></div>}
    {data.results.map(i => <article key={i.id} className="mt-4 rounded-xl border border-white/10 p-4"><h2 className="font-bold">{i.name}{i.locality && ` · ${i.locality}`}</h2>
      {data.memberships.some(m => m.id === i.id && m.status === "active") ? <p className="text-sm text-slate-400">Ya sos miembro.</p> : data.requests.some(r => r.institutionId === i.id && r.status === "pending") ? <p className="text-sm text-slate-400">Solicitud pendiente.</p> : <InstitutionForm institutionId={i.id} kind="request" />}
    </article>)}
  </>;
}
