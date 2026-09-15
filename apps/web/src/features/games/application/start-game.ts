"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { RoundError } from "@/features/rounds/domain/round";
import { startGame } from "../repositories/start-game.repository";
export type StartGameState = { error?: string; success?: string };
export async function startGameAction(_previous: StartGameState, form: FormData): Promise<StartGameState> {
  try {
    const actorId = await getAuthenticatedUserId();
    if (!actorId) throw new PreparationError("Tu sesión venció. Volvé a iniciar sesión.");
    const gameId = form.get("gameId"), operationId = form.get("operationId"), revision = form.get("revision"), catalogToken = form.get("catalogToken");
    if (typeof gameId !== "string" || !UUID_PATTERN.test(gameId) || typeof operationId !== "string" || !UUID_PATTERN.test(operationId) || typeof revision !== "string" || !/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision)) || Number(revision) >= 2147483647 || typeof catalogToken !== "string" || !/^[0-9a-f]{64}$/.test(catalogToken)) {
      throw new PreparationError("Los datos de inicio no son válidos. Recargá la página.");
    }
    const periodRevision = String(form.get("periodRevision"));
    if (!/^\d+$/.test(periodRevision) || !Number.isSafeInteger(Number(periodRevision)) || Number(periodRevision) >= 2147483647) throw new PreparationError("Revisión de períodos inválida.");
    if (form.get("confirmed") !== "on") throw new PreparationError("Confirmá que querés iniciar con los valores guardados.");
    await startGame(actorId, { gameId, operationId, expectedRevision: Number(revision), expectedPeriodRevision: Number(periodRevision), catalogToken });
    revalidatePath("/master/partidas/[id]", "page");
    revalidatePath("/master/campanas/[id]", "page");
    return { success: "Partida activa." };
  } catch (error) {
    if (error instanceof PreparationError || error instanceof RoundError) return { error: error.message };
    console.error("Error iniciando partida:", error);
    return { error: "No se pudo iniciar la partida. Recargá los datos y comprobá su estado antes de reintentar." };
  }
}
