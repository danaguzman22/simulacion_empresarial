import type { ReactNode } from "react";
import { UserBar } from "@/features/session/components/UserBar";

// #72: institution screens ("Unirme / Mis solicitudes" and, for admins, the institution detail) with the user bar.
export default function InstitutionsLayout({ children }: { children: ReactNode }) {
  return <><UserBar area="admin" />{children}</>;
}
