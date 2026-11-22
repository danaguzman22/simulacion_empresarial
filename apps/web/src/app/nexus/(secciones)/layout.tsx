import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AreaShell } from "@/components/shared/AreaShell";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { readPendingCount } from "@/features/nexus/repositories/nexus.repository";
import { UserBar } from "@/features/session/components/UserBar";

export const dynamic = "force-dynamic";

// #6 / D-44: NEXUS administration as an area with its sections. Only active NEXUS admins; anyone else: "not found".
// Each page checks it again before reading its data.
export default async function NexusLayout({ children }: { children: ReactNode }) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  const pending = await readPendingCount(actor);
  if (pending === null) notFound();
  return <><UserBar area="nexus" /><AreaShell title="Administración de NEXUS" description="Aprobá las instituciones registradas y nombrá a otros admins de NEXUS. Todo queda registrado."
    tabsLabel="Secciones de la administración de NEXUS" tabs={[
      { href: "/nexus", label: "Pendientes", badge: pending },
      { href: "/nexus/instituciones", label: "Instituciones" },
      { href: "/nexus/admins", label: "Admins de NEXUS" },
      { href: "/nexus/historial", label: "Historial" },
    ]}>{children}</AreaShell></>;
}
