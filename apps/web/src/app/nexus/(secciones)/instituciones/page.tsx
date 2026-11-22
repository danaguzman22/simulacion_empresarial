import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { institutionKindLabels, type InstitutionKind } from "@/features/nexus/domain/registration";
import { readInstitutions } from "@/features/nexus/repositories/nexus.repository";

export const dynamic = "force-dynamic";

// Every institution, with a search by name or locality, and "Crear institución" for phone or e-mail requests (D-43).
export default async function InstitutionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const { q = "" } = await searchParams, search = q.trim().slice(0, 160);
  const rows = await readInstitutions(actor, search);
  if (!rows) notFound();
  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <form className="flex flex-wrap items-end gap-3"><label className="text-sm">Buscar por nombre o localidad<input name="q" maxLength={160} defaultValue={search} className="mt-1 block rounded bg-slate-900 p-2" /></label><button className="rounded border border-sky-500 px-3 py-2 text-sm">Buscar</button></form>
      <Link href="/nexus/instituciones/crear" className="rounded bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500">Crear institución</Link>
    </div>
    <div className="mt-4">
      {!rows.length && (search.length >= 2
        ? <EmptyState title={`No encontramos instituciones que coincidan con «${search}».`} hint="Revisá cómo lo escribiste o mirá las pendientes en" action={{ href: "/nexus", label: "Pendientes" }} />
        : <EmptyState title="Todavía no hay instituciones aprobadas." hint="Aparecen acá las que apruebes en" action={{ href: "/nexus", label: "Pendientes" }} />)}
      <ul className="space-y-2">{rows.map(i => <li key={i.id} className="rounded-xl border border-white/10 p-3">
        <Link href={`/nexus/instituciones/${i.id}`} className="font-semibold text-sky-300 hover:underline">{i.name}</Link>{i.locality && <span> · {i.locality}{i.province && `, ${i.province}`}</span>}
        <p className="text-sm text-slate-400">{institutionKindLabels[i.kind as InstitutionKind]} · {i.members} {i.members === 1 ? "miembro" : "miembros"}, {i.admins} {i.admins === 1 ? "admin" : "admins"} · desde {dateTime(i.createdAt)}</p>
      </li>)}</ul>
    </div>
  </>;
}
