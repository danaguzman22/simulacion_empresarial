import { redirect } from "next/navigation";
import { getSession } from "@/features/session/application/get-session";
import { RegistrationWizard } from "@/features/nexus/components/RegistrationWizard";

export const dynamic = "force-dynamic";

// #6 (D-41): any signed-in person registers an institution in 4 steps; a NEXUS admin approves it.
export default async function RegisterPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <>
    <p className="mb-5 text-sm text-slate-400">Si tu institución todavía no está en NEXUS, registrala. Queda pendiente hasta que la apruebe un admin de NEXUS; cuando la aprueben, vas a ser su admin principal. No puede haber dos instituciones con el mismo nombre legal en la misma localidad.</p>
    <RegistrationWizard mode="self" account={{ name: session.name, email: session.email }} />
  </>;
}
