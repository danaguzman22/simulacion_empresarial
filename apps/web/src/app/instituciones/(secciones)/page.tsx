import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { getMyInstitutions } from "@/features/institutions/application/get-institutions";

export const dynamic = "force-dynamic";

// The institutions the person belongs to. Only admins open the institution detail (#72).
export default async function MyInstitutionsPage() {
  const data = await getMyInstitutions("");
  if (!data.memberships.length) return <EmptyState title="Todavía no pertenecés a ninguna institución." hint="Buscá la tuya y pedí acceso en" action={{ href: "/instituciones/unirme", label: "Unirme" }} />;
  return <ul className="space-y-3">{data.memberships.map(m => <li key={m.id} className="rounded-xl border border-white/10 p-4">
    {m.status === "active" ? (m.role === "admin" ? <Link href={`/instituciones/${m.id}`} className="font-semibold text-sky-300 hover:underline">{m.name}</Link> : <span className="font-semibold">{m.name}</span>) : <span>{m.name} · Membresía revocada</span>}
  </li>)}</ul>;
}
