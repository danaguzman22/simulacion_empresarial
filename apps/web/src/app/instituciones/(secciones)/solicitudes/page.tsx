import { EmptyState } from "@/components/shared/EmptyState";
import { getMyInstitutions } from "@/features/institutions/application/get-institutions";
import { registrationStatusLabels } from "@/features/nexus/domain/registration";

export const dynamic = "force-dynamic";
const day = (value: Date) => value.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

// Requests to join an institution and registrations of new institutions, with their state and rejection reason (D-43).
export default async function MyRequestsPage() {
  const data = await getMyInstitutions("");
  if (!data.requests.length && !data.registrations.length) return <EmptyState title="Todavía no hiciste solicitudes." hint="Pedí acceso a una institución en Unirme o" action={{ href: "/instituciones/registrar", label: "registrá la tuya" }} />;
  return <div className="space-y-8">
    {data.requests.length > 0 && <section><h2 className="text-lg font-bold">Acceso a instituciones</h2><ul className="mt-3 space-y-2">
      {data.requests.map(r => <li key={r.id} className="rounded-xl border border-white/10 p-3">{r.name} · {registrationStatusLabels[r.status]} · {day(r.requestedAt)}</li>)}</ul></section>}
    {data.registrations.length > 0 && <section><h2 className="text-lg font-bold">Registro de instituciones</h2><ul className="mt-3 space-y-2">
      {data.registrations.map(r => <li key={r.id} className="rounded-xl border border-white/10 p-3">
        <p>{r.displayName ?? r.name} · {r.locality}{r.province && `, ${r.province}`} · {registrationStatusLabels[r.status]}{r.createdByNexus && " (creada por el admin de NEXUS)"} · {day(r.requestedAt)}</p>
        {r.rejectionReason && <p className="mt-1 text-sm text-slate-400">Motivo: {r.rejectionReason}. Podés presentarla de nuevo como una solicitud nueva.</p>}
      </li>)}</ul></section>}
  </div>;
}
