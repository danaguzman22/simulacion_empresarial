"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { isRequirementSection } from "../domain/section-requirement";
import { setSectionRequired } from "../repositories/section-requirement.repository";

export type SectionRequirementState = { error?: string; success?: string };

export async function sectionRequirementAction(_previous: SectionRequirementState, form: FormData): Promise<SectionRequirementState> {
  const gameId = String(form.get("gameId") ?? ""), operationId = String(form.get("operationId") ?? ""), section = form.get("section");
  const required = String(form.get("required") ?? ""), revision = String(form.get("revision") ?? "");
  if (!UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(operationId) || !isRequirementSection(section) || !["true", "false"].includes(required)
    || !/^\d{1,9}$/.test(revision)) return { error: "Datos inválidos. Recargá la página." };
  const actorId = await getAuthenticatedUserId();
  if (!actorId) return { error: "Volvé a iniciar sesión." };
  try {
    await setSectionRequired(actorId, { gameId, operationId, section, required: required === "true", expectedRevision: Number(revision) });
  } catch (error) {
    if (error instanceof PreparationError) return { error: error.message };
    console.error("Error al cambiar la obligatoriedad", error);
    return { error: "No se pudo guardar. Recargá los datos antes de reintentar." };
  }
  revalidatePath(`/master/partidas/${gameId}`, "layout");
  return { success: "Guardado." };
}
