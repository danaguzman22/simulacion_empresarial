import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { institutionKindLabels, type InstitutionKind } from "@/features/nexus/domain/registration";
import { readPendingRegistrations } from "@/features/nexus/repositories/nexus.repository";
import { PanelForm } from "@/features/nexus/components/PanelForm";

export const dynamic = "force-dynamic";

// Pending registrations: approve, or reject with a required reason (D-43).
export default async function PendingPage() {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const pending = await readPendingRegistrations(actor);
  if (!pending) notFound();
  if (!pending.length) return <EmptyState title="No hay instituciones pendientes de aprobación." hint="Cuando alguien registre una institución, va a aparecer acá." />;
  return <div className="space-y-4">{pending.map(r => <article key={r.id} className="rounded-xl border border-white/10 p-4">
    <h2 className="font-bold">{r.name} · {r.locality}</h2>
    <p className="text-sm text-slate-400">{institutionKindLabels[r.kind as InstitutionKind]} · registrada por {r.registrant} · {dateTime(r.requestedAt)}</p>
    {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.message}</p>}
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <PanelForm kind="approve" registrationId={r.id} />
      <PanelForm kind="reject" registrationId={r.id} />
    </div>
  </article>)}</div>;
}
