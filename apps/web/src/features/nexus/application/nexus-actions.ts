"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/features/session/application/get-session";
import { draftFields, NexusError, type RegistrationDraft } from "../domain/registration";
import { addInstitutionAdmin, approveRegistration, grantNexusAdmin, nexusCreateInstitution, registerInstitution, rejectRegistration, revokeNexusAdmin } from "../repositories/nexus.repository";

export type RegisterState = { message: string; done?: boolean; institutionId?: string };

// The 4-step form sends its whole draft as JSON in one field; only the known fields are read (each one validated
// again in the server and in the database).
function readDraft(form: FormData): Partial<Record<keyof RegistrationDraft, unknown>> {
  const raw = form.get("draft");
  if (typeof raw !== "string" || raw.length > 20000) throw new NexusError("Datos inválidos. Recargá e intentá nuevamente.");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new NexusError("Datos inválidos. Recargá e intentá nuevamente."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new NexusError("Datos inválidos. Recargá e intentá nuevamente.");
  const source = parsed as Record<string, unknown>;
  return Object.fromEntries(draftFields.map(k => [k, source[k]]));
}

// #6 (D-41): any signed-in person registers an institution; it waits for a NEXUS admin.
export async function registerInstitutionAction(_: RegisterState, form: FormData): Promise<RegisterState> {
  const session = await getSession();
  if (!session) return { message: "Iniciá sesión nuevamente." };
  if (!session.email) return { message: "Tu cuenta no tiene un correo verificado. No se puede registrar la institución." };
  try {
    await registerInstitution(session.userId, session.email, readDraft(form));
    revalidatePath("/instituciones", "layout"); revalidatePath("/nexus", "layout");
    return { message: "Solicitud enviada. Un admin de NEXUS la va a revisar; vas a ver el resultado en Mis solicitudes.", done: true };
  } catch (e) { return { message: e instanceof NexusError ? e.message : "No se pudo enviar la solicitud. Recargá e intentá nuevamente." }; }
}

// #6 (D-43): a NEXUS admin creates an institution for a registered person (phone or e-mail requests).
export async function nexusCreateInstitutionAction(_: RegisterState, form: FormData): Promise<RegisterState> {
  const session = await getSession();
  if (!session) return { message: "Iniciá sesión nuevamente." };
  try {
    const institutionId = await nexusCreateInstitution(session.userId, readDraft(form), form.get("adminEmail"));
    revalidatePath("/nexus", "layout"); revalidatePath("/instituciones", "layout");
    return { message: "Institución creada. La persona indicada ya es su admin principal.", done: true, institutionId };
  } catch (e) { return { message: e instanceof NexusError ? e.message : "No se pudo crear la institución. Recargá e intentá nuevamente." }; }
}

// #6 (D-42, D-43): the NEXUS administration panel. Each operation is re-checked in the server and in the database.
export async function nexusPanelAction(_: { message: string }, form: FormData): Promise<{ message: string }> {
  const session = await getSession();
  if (!session) return { message: "Iniciá sesión nuevamente." };
  const actor = session.userId, operation = form.get("operation");
  try {
    if (operation === "approve") await approveRegistration(actor, form.get("registrationId"));
    else if (operation === "reject") await rejectRegistration(actor, form.get("registrationId"), form.get("reason"));
    else if (operation === "grant") await grantNexusAdmin(actor, form.get("email"));
    else if (operation === "revoke") await revokeNexusAdmin(actor, form.get("profileId"));
    else if (operation === "add-admin") await addInstitutionAdmin(actor, form.get("institutionId"), form.get("email"), form.get("reason"));
    else throw new NexusError("Operación inválida.");
    revalidatePath("/", "layout");
    return { message: "Operación registrada correctamente." };
  } catch (e) { return { message: e instanceof NexusError ? e.message : "No se pudo completar la operación. Recargá e intentá nuevamente." }; }
}
