"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { AssignmentError, type AssignmentCommand } from "../domain/assignment";
import { changeAssignment } from "../repositories/assignment.repository";
export async function saveAssignment(_: { message: string }, form: FormData) {
  const actor = await getAuthenticatedUserId();
  if (!actor) return { message: "Iniciá sesión nuevamente." };
  const command = { gameId: String(form.get("gameId") ?? ""), cardId: String(form.get("cardId") ?? ""), assignmentId: String(form.get("assignmentId") ?? ""), email: String(form.get("email") ?? ""), operation: String(form.get("operation") ?? ""), expectedRevision: Number(form.get("revision")) } as AssignmentCommand;
  try {
    await changeAssignment(actor, command);
    revalidatePath(`/master/partidas/${command.gameId}`);
    revalidatePath("/alumno", "layout");
    return { message: "Integrantes actualizados." };
  } catch (e) { return { message: e instanceof AssignmentError || e instanceof PreparationError ? e.message : "No se pudo actualizar la asignación." }; }
}
