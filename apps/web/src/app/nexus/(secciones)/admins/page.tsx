import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { dateTime } from "@/features/nexus/domain/format";
import { readNexusAdmins } from "@/features/nexus/repositories/nexus.repository";
import { PanelForm } from "@/features/nexus/components/PanelForm";

export const dynamic = "force-dynamic";

// NEXUS admins (D-42): name one by e-mail, remove the role from another one or oneself, never from the last one.
export default async function AdminsPage() {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const data = await readNexusAdmins(actor);
  if (!data) notFound();
  const { admins, self } = data;
  return <>
    <ul className="space-y-3">{admins.map(a => <li key={a.profileId} className="rounded-xl border border-white/10 p-3">
      <p className="font-semibold">{a.name}{a.profileId === self && " (vos)"}</p>
      <p className="text-sm text-slate-400">Desde {dateTime(a.grantedAt)} · {a.grantedBy ? `nombrado por ${a.grantedBy}` : "primer admin"}</p>
      {admins.length > 1 && <PanelForm kind="revoke" profileId={a.profileId} self={a.profileId === self} />}
    </li>)}</ul>
    {admins.length === 1 && <p className="mt-2 text-sm text-slate-400">Sos el único admin de NEXUS: no se puede quitar el rol al último.</p>}
    <section className="mt-6 rounded-xl border border-white/10 p-4"><h2 className="font-bold">Nombrar otro admin de NEXUS</h2><PanelForm kind="grant" /></section>
  </>;
}
