import { DetailShell } from "@/components/shared/DetailShell";
import { RegistrationWizard } from "@/features/nexus/components/RegistrationWizard";

export const dynamic = "force-dynamic";

// D-43: a NEXUS admin creates an institution asked for by phone or e-mail: the same 4 steps plus the e-mail of the
// registered person who becomes its main admin. Registration + approval at once, recorded as created by NEXUS.
export default function CreateInstitutionPage() {
  return <DetailShell title="Crear institución" subtitle="Para pedidos que llegan por teléfono o correo. Queda aprobada y registrada como creada por el admin de NEXUS."
    crumbs={[{ label: "Administración de NEXUS", href: "/nexus" }, { label: "Instituciones", href: "/nexus/instituciones" }, { label: "Crear institución" }]}>
    <RegistrationWizard mode="nexus" />
  </DetailShell>;
}
