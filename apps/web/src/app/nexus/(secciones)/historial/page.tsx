import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { registrationStatusLabels } from "@/features/nexus/domain/registration";
import { readNexusHistory } from "@/features/nexus/repositories/nexus.repository";

export const dynamic = "force-dynamic";
const actionLabels: Record<string, string> = { grant_admin: "nombró admin de NEXUS a", revoke_admin: "le quitó el rol de admin de NEXUS a", approve_institution: "aprobó la institución", reject_institution: "rechazó la institución" };

// Resolved registrations and the record of every NEXUS administration action (who, to whom, when).
export default async function HistoryPage() {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const history = await readNexusHistory(actor);
  if (!history) notFound();
  return <div className="space-y-8">
    <section><h2 className="text-lg font-bold">Solicitudes resueltas</h2>
      {!history.resolved.length ? <div className="mt-3"><EmptyState title="Todavía no hay solicitudes resueltas." hint="Aparecen acá las que apruebes o rechaces en" action={{ href: "/nexus", label: "Pendientes" }} /></div>
        : <ul className="mt-3 space-y-2 text-sm">{history.resolved.map(r => <li key={r.id} className="rounded-xl border border-white/10 p-3">
          <span className="font-semibold">{r.name} · {r.locality}</span> · {registrationStatusLabels[r.status]} por {r.resolver} · {dateTime(r.resolvedAt)}
          {r.rejectionReason && <span className="block text-slate-400">Motivo: {r.rejectionReason}</span>}
        </li>)}</ul>}
    </section>
    <section><h2 className="text-lg font-bold">Registro de acciones</h2>
      {!history.actions.length ? <div className="mt-3"><EmptyState title="Todavía no hay acciones registradas." /></div>
        : <ul className="mt-3 space-y-1 text-sm text-slate-300">{history.actions.map(h => <li key={h.id}>
          {dateTime(h.createdAt)} · {h.actor ?? "Script del operador"} {actionLabels[h.action] ?? h.action} {h.action.endsWith("institution") ? h.registration : h.target}
        </li>)}</ul>}
    </section>
  </div>;
}
