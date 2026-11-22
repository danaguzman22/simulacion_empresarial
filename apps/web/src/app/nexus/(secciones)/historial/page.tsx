import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { registrationStatusLabels } from "@/features/nexus/domain/registration";
import { isHistoryFilter, readNexusHistory, type HistoryFilter } from "@/features/nexus/repositories/nexus.repository";
import { ActionList } from "@/features/nexus/components/InstitutionDetails";

export const dynamic = "force-dynamic";
const filters: Record<HistoryFilter, string> = { all: "Todas", approved: "Aprobadas", rejected: "Rechazadas", nexus: "Creadas por NEXUS" };

// Resolved registrations (search, filter, pages; each one opens with all its data) and the general record of actions.
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string; pagina?: string; acciones?: string }> }) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const params = await searchParams, search = (params.q ?? "").trim().slice(0, 160), filter = isHistoryFilter(params.filtro) ? params.filtro : "all";
  const history = await readNexusHistory(actor, { search, filter, page: Number(params.pagina ?? 1), actionsPage: Number(params.acciones ?? 1) });
  if (!history) notFound();
  const link = (changes: Record<string, string | number>) => {
    const query = new URLSearchParams({ ...(search ? { q: search } : {}), ...(filter !== "all" ? { filtro: filter } : {}), pagina: String(history.page), acciones: String(history.actionsPage) });
    for (const [k, v] of Object.entries(changes)) query.set(k, String(v));
    return `/nexus/historial?${query.toString()}`;
  };
  return <div className="space-y-10">
    <section><h2 className="text-lg font-bold">Solicitudes resueltas</h2>
      <form className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">Buscar por nombre o localidad<input name="q" maxLength={160} defaultValue={search} className="mt-1 block rounded bg-slate-900 p-2" /></label>
        <label className="text-sm">Mostrar<select name="filtro" defaultValue={filter} className="mt-1 block rounded bg-slate-900 p-2">{Object.entries(filters).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button className="rounded border border-sky-500 px-3 py-2 text-sm">Buscar</button>
      </form>
      <div className="mt-4">
        {!history.resolved.length ? (search.length >= 2 || filter !== "all"
          ? <EmptyState title={`No encontramos solicitudes que coincidan${search ? ` con «${search}»` : ""}.`} hint="Revisá cómo lo escribiste o mirá" action={{ href: "/nexus/historial", label: "todas las resueltas" }} />
          : <EmptyState title="Todavía no hay solicitudes resueltas." hint="Aparecen acá las que apruebes o rechaces en" action={{ href: "/nexus", label: "Pendientes" }} />)
          : <ul className="space-y-2 text-sm">{history.resolved.map(r => <li key={r.id} className="rounded-xl border border-white/10 p-3">
            <Link href={`/nexus/historial/${r.id}`} className="font-semibold text-sky-300 hover:underline">{r.displayName ?? r.name} · {r.locality}</Link>
            {" "}· {r.createdByNexus ? "Creada por el admin de NEXUS" : registrationStatusLabels[r.status]} por {r.resolver} · {dateTime(r.resolvedAt)}
            {r.rejectionReason && <span className="block text-slate-400">Motivo: {r.rejectionReason}</span>}
          </li>)}</ul>}
        <Pages page={history.page} pages={history.pages} href={n => link({ pagina: n })} label={`${history.total} resueltas`} />
      </div>
    </section>
    <section><h2 className="text-lg font-bold">Registro de acciones</h2>
      <div className="mt-3">{!history.actions.length ? <EmptyState title="Todavía no hay acciones registradas." /> : <ActionList actions={history.actions.map(a => ({ ...a, target: a.target ?? a.institution ?? a.registration }))} />}</div>
      <Pages page={history.actionsPage} pages={history.actionsPages} href={n => link({ acciones: n })} />
    </section>
  </div>;
}

function Pages({ page, pages, href, label }: { page: number; pages: number; href: (n: number) => string; label?: string }) {
  return <nav aria-label="Páginas" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
    {label && <span>{label}</span>}
    {page > 1 && <Link href={href(page - 1)} className="text-sky-300 hover:underline">← Anterior</Link>}
    <span>Página {page} de {pages}</span>
    {page < pages && <Link href={href(page + 1)} className="text-sky-300 hover:underline">Siguiente →</Link>}
  </nav>;
}
