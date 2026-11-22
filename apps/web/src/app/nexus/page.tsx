import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { institutionKindLabels, registrationStatusLabels, type InstitutionKind } from "@/features/nexus/domain/registration";
import { readNexusPanel } from "@/features/nexus/repositories/nexus.repository";
import { PanelForm } from "@/features/nexus/components/PanelForm";
import { UserBar } from "@/features/session/components/UserBar";

export const dynamic = "force-dynamic";

const date = (value: Date | null) => value ? value.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "America/Argentina/Buenos_Aires" }) : "";
const actionLabels: Record<string, string> = { grant_admin: "nombró admin de NEXUS a", revoke_admin: "le quitó el rol de admin de NEXUS a", approve_institution: "aprobó la institución", reject_institution: "rechazó la institución" };

// #6 (D-16 to D-18, D-41 to D-43): NEXUS administration. Only active NEXUS admins; anyone else gets "not found".
export default async function NexusPage() {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const panel = await readNexusPanel(actor);
  if (!panel) notFound();
  const section = "mt-8 rounded-2xl border border-white/10 p-5";
  return <><UserBar area="nexus" /><main className="min-h-screen bg-slate-950 px-5 py-8 text-white"><div className="mx-auto max-w-4xl">
    <h1 className="text-3xl font-black">Administración de NEXUS</h1>
    <p className="mt-2 text-sm text-slate-400">Aprobá las instituciones registradas y nombrá a otros admins de NEXUS. Todo queda registrado.</p>

    <section className={section}>
      <h2 className="text-xl font-bold">Instituciones pendientes ({panel.pending.length})</h2>
      {!panel.pending.length && <p className="mt-3 text-sm text-slate-400">No hay solicitudes pendientes.</p>}
      {panel.pending.map(r => <article key={r.id} className="mt-4 rounded-xl border border-white/10 p-4">
        <h3 className="font-bold">{r.name} · {r.locality}</h3>
        <p className="text-sm text-slate-400">{institutionKindLabels[r.kind as InstitutionKind]} · registrada por {r.registrant} · {date(r.requestedAt)}</p>
        {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">{r.message}</p>}
        <PanelForm kind="resolve" registrationId={r.id} />
      </article>)}
    </section>

    <section className={section}>
      <h2 className="text-xl font-bold">Admins de NEXUS</h2>
      <ul className="mt-3 space-y-3">{panel.admins.map(a => <li key={a.profileId} className="rounded-xl border border-white/10 p-3">
        <p className="font-semibold">{a.name}{a.profileId === panel.self && " (vos)"}</p>
        <p className="text-sm text-slate-400">Desde {date(a.grantedAt)} · {a.grantedBy ? `nombrado por ${a.grantedBy}` : "primer admin"}</p>
        {panel.admins.length > 1 && <PanelForm kind="revoke" profileId={a.profileId} self={a.profileId === panel.self} />}
      </li>)}</ul>
      {panel.admins.length === 1 && <p className="mt-2 text-sm text-slate-400">Sos el único admin de NEXUS: no se puede quitar el rol al último.</p>}
      <div className="mt-4"><PanelForm kind="grant" /></div>
    </section>

    <section className={section}>
      <h2 className="text-xl font-bold">Últimas resueltas</h2>
      {!panel.resolved.length && <p className="mt-3 text-sm text-slate-400">Todavía no hay solicitudes resueltas.</p>}
      <ul className="mt-3 space-y-2 text-sm">{panel.resolved.map(r => <li key={r.id}>
        <span className="font-semibold">{r.name} · {r.locality}</span> · {registrationStatusLabels[r.status]} por {r.resolver} · {date(r.resolvedAt)}
        {r.rejectionReason && <span className="block text-slate-400">Motivo: {r.rejectionReason}</span>}
      </li>)}</ul>
    </section>

    <section className={section}>
      <h2 className="text-xl font-bold">Registro de acciones</h2>
      <ul className="mt-3 space-y-1 text-sm text-slate-300">{panel.history.map(h => <li key={h.id}>
        {date(h.createdAt)} · {h.actor ?? "Script del operador"} {actionLabels[h.action] ?? h.action} {h.action.endsWith("institution") ? h.registration : h.target}
      </li>)}</ul>
    </section>
  </div></main></>;
}
