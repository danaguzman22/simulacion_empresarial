import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { isNexusAdmin } from "@/features/nexus/repositories/nexus.repository";
import { UserBar } from "@/features/session/components/UserBar";

export const dynamic = "force-dynamic";

// D-44: detail screens of the NEXUS administration show the route, not the section tabs. Only NEXUS admins.
export default async function NexusDetailLayout({ children }: { children: ReactNode }) {
  const actor = await getAuthenticatedUserId();
  if (!actor) redirect("/login/master");
  if (!await isNexusAdmin(actor)) notFound();
  return <><UserBar area="nexus" />{children}</>;
}
