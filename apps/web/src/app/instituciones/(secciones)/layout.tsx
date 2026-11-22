import type { ReactNode } from "react";
import { AreaShell } from "@/components/shared/AreaShell";

export const dynamic = "force-dynamic";

// D-44: "Mis instituciones" as an area with its sections (one per screen).
export default function MyInstitutionsLayout({ children }: { children: ReactNode }) {
  return <AreaShell title="Mis instituciones" tabsLabel="Secciones de Mis instituciones" tabs={[
    { href: "/instituciones", label: "Mis instituciones" },
    { href: "/instituciones/unirme", label: "Unirme" },
    { href: "/instituciones/solicitudes", label: "Mis solicitudes" },
    { href: "/instituciones/registrar", label: "Registrar institución" },
  ]}>{children}</AreaShell>;
}
