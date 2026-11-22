import { RegisterInstitutionForm } from "@/features/nexus/components/RegisterInstitutionForm";

export const dynamic = "force-dynamic";

// #6 (D-41): any signed-in person registers an institution; a NEXUS admin approves it.
export default function RegisterPage() {
  return <>
    <p className="text-sm text-slate-400">Si tu institución todavía no está en NEXUS, registrala. Queda pendiente hasta que la apruebe un admin de NEXUS; cuando la aprueben, vas a ser su admin. No puede haber dos instituciones con el mismo nombre en la misma localidad.</p>
    <RegisterInstitutionForm />
  </>;
}
