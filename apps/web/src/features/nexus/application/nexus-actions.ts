"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { NexusError } from "../domain/registration";
import { approveRegistration, grantNexusAdmin, registerInstitution, rejectRegistration, revokeNexusAdmin } from "../repositories/nexus.repository";

type Values = { name: string; kind: string; locality: string; message: string };
export type RegisterState = { message: string; done?: boolean; values?: Values };

// #6 (D-41): any signed-in person registers an institution; it waits for a NEXUS admin.
export async function registerInstitutionAction(_: RegisterState, form: FormData): Promise<RegisterState> {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { message: "Iniciá sesión nuevamente." };
  // Sent back so the form keeps what was typed when it shows an error.
  const values: Values = { name: String(form.get("name") ?? "").slice(0, 200), kind: String(form.get("kind") ?? "").slice(0, 20), locality: String(form.get("locality") ?? "").slice(0, 200), message: String(form.get("message") ?? "").slice(0, 1100) };
  try {
    await registerInstitution(actor, { name: form.get("name"), kind: form.get("kind"), locality: form.get("locality"), message: form.get("message") });
    revalidatePath("/instituciones", "layout"); revalidatePath("/nexus", "layout");
    return { message: "Solicitud enviada. Un admin de NEXUS la va a revisar; vas a ver el resultado en Mis solicitudes.", done: true };
  } catch (e) { return { message: e instanceof NexusError ? e.message : "No se pudo enviar la solicitud. Recargá e intentá nuevamente.", values }; }
}

// #6 (D-42, D-43): the NEXUS administration panel. Each operation is re-checked in the server and in the database.
export async function nexusPanelAction(_: { message: string }, form: FormData): Promise<{ message: string }> {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { message: "Iniciá sesión nuevamente." };
  const operation = form.get("operation");
  try {
    if (operation === "approve") await approveRegistration(actor, form.get("registrationId"));
    else if (operation === "reject") await rejectRegistration(actor, form.get("registrationId"), form.get("reason"));
    else if (operation === "grant") await grantNexusAdmin(actor, form.get("email"));
    else if (operation === "revoke") await revokeNexusAdmin(actor, form.get("profileId"));
    else throw new NexusError("Operación inválida.");
    revalidatePath("/", "layout");
    return { message: "Operación registrada correctamente." };
  } catch (e) { return { message: e instanceof NexusError ? e.message : "No se pudo completar la operación. Recargá e intentá nuevamente." }; }
}
