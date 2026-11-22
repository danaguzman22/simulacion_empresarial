import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DetailShell } from "@/components/shared/DetailShell";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { registrationStatusLabels } from "@/features/nexus/domain/registration";
import { readRegistrationForNexus } from "@/features/nexus/repositories/nexus.repository";
import { ActionList, ContactList, ProfileData } from "@/features/nexus/components/InstitutionDetails";

export const dynamic = "force-dynamic";

// One registration with all its data and all its actions (registration, approval or rejection, admins added later).
export default async function RegistrationHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const data = await readRegistrationForNexus(actor, (await params).id);
  if (!data) notFound();
  const { registration: r, contacts, history } = data;
  const title = r.displayName ?? r.name, section = "mt-6 rounded-2xl border border-white/10 p-5";
  const status = r.createdByNexus ? `Creada por el admin de NEXUS (${r.creator})` : registrationStatusLabels[r.status];
  return <DetailShell title={title} subtitle={`${status}${r.resolver ? ` · resuelta por ${r.resolver} el ${dateTime(r.resolvedAt)}` : ""}`}
    crumbs={[{ label: "Administración de NEXUS", href: "/nexus" }, { label: "Historial", href: "/nexus/historial" }, { label: title }]}>
    <section className="rounded-2xl border border-white/10 p-5"><h2 className="mb-3 text-lg font-bold">Solicitud</h2>
      <p className="mb-3 text-sm text-slate-400">Registrada por {r.registrant} el {dateTime(r.requestedAt)} · declaró estar autorizado/a el {dateTime(r.authorizedAt)}</p>
      <ProfileData data={r} />
      {r.message && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">Mensaje: {r.message}</p>}
      {r.rejectionReason && <p className="mt-3 text-sm text-amber-200">Motivo del rechazo: {r.rejectionReason}</p>}
      {r.institutionId && <Link href={`/nexus/instituciones/${r.institutionId}`} className="mt-3 inline-block text-sm text-sky-300 hover:underline">Ver la institución</Link>}
    </section>
    <section className={section}><h2 className="mb-3 text-lg font-bold">Contactos</h2><ContactList contacts={contacts} /></section>
    <section className={section}><h2 className="mb-3 text-lg font-bold">Acciones</h2>
      {history.length ? <ActionList actions={history} /> : <p className="text-sm text-slate-400">Todavía sin acciones: la solicitud sigue pendiente.</p>}
    </section>
  </DetailShell>;
}
