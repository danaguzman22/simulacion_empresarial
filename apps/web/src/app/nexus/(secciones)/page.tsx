import { notFound, redirect } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { readPendingRegistrations } from "@/features/nexus/repositories/nexus.repository";
import { ContactList, ProfileData } from "@/features/nexus/components/InstitutionDetails";
import { PanelForm } from "@/features/nexus/components/PanelForm";

export const dynamic = "force-dynamic";

// Pending registrations with all their data and contacts: approve, or reject with a required reason (D-43).
export default async function PendingPage() {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const pending = await readPendingRegistrations(actor);
  if (!pending) notFound();
  if (!pending.length) return <EmptyState title="No hay instituciones pendientes de aprobación." hint="Cuando alguien registre una institución, va a aparecer acá." />;
  return <div className="space-y-4">{pending.map(r => <article key={r.id} className="rounded-xl border border-white/10 p-4">
    <h2 className="font-bold">{r.displayName ?? r.name} · {r.locality}, {r.province}</h2>
    <p className="text-sm text-slate-400">Registrada por {r.registrant} · {dateTime(r.requestedAt)} · declaró estar autorizado/a el {dateTime(r.authorizedAt)}</p>
    <details className="mt-3"><summary className="cursor-pointer text-sm text-sky-300">Ver todos los datos y contactos</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2"><ProfileData data={r} /><ContactList contacts={r.contacts} /></div>
    </details>
    {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">Mensaje: {r.message}</p>}
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <PanelForm kind="approve" registrationId={r.id} />
      <PanelForm kind="reject" registrationId={r.id} />
    </div>
  </article>)}</div>;
}
