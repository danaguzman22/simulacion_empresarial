import { notFound, redirect } from "next/navigation";
import { DetailShell } from "@/components/shared/DetailShell";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { readInstitutionForNexus } from "@/features/nexus/repositories/nexus.repository";
import { ActionList, ContactList, ProfileData } from "@/features/nexus/components/InstitutionDetails";
import { PanelForm } from "@/features/nexus/components/PanelForm";

export const dynamic = "force-dynamic";

// One institution for a NEXUS admin: data, contacts, admins ("Agregar admin" with a reason; never remove) and actions.
export default async function NexusInstitutionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const data = await readInstitutionForNexus(actor, (await params).id);
  if (!data) notFound();
  const { institution, registration, admins, memberCount, contacts, history } = data;
  const section = "mt-6 rounded-2xl border border-white/10 p-5";
  return <DetailShell title={institution.name} subtitle={`${memberCount} ${memberCount === 1 ? "miembro activo" : "miembros activos"} · desde ${dateTime(institution.createdAt)}${registration?.createdByNexus ? " · creada por el admin de NEXUS" : ""}`}
    crumbs={[{ label: "Administración de NEXUS", href: "/nexus" }, { label: "Instituciones", href: "/nexus/instituciones" }, { label: institution.name }]}>
    <section className="rounded-2xl border border-white/10 p-5"><h2 className="mb-3 text-lg font-bold">Datos</h2>
      {institution.legalName ? <ProfileData data={{ ...institution, kind: institution.type }} /> : <p className="text-sm text-slate-400">Institución anterior al registro completo: solo tiene nombre ({institution.name}) y tipo.</p>}
    </section>
    <section className={section}><h2 className="mb-3 text-lg font-bold">Contactos</h2><ContactList contacts={contacts} /></section>
    <section className={section}><h2 className="text-lg font-bold">Admins de la institución</h2>
      <ul className="mt-3 space-y-1 text-sm">{admins.map(a => <li key={a.profileId}>{a.name} · desde {dateTime(a.since)}</li>)}</ul>
      <p className="mt-3 text-xs text-slate-400">El admin de NEXUS puede agregar admins, pero no quitarlos: eso lo hacen los admins de la institución.</p>
      <div className="mt-3 max-w-lg"><PanelForm kind="add-admin" institutionId={institution.id} /></div>
    </section>
    <section className={section}><h2 className="mb-3 text-lg font-bold">Acciones</h2>
      {history.length ? <ActionList actions={history} /> : <p className="text-sm text-slate-400">Sin acciones registradas.</p>}
    </section>
  </DetailShell>;
}
