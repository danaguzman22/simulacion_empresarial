"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { deleteGame, finishGame, GameLifecycleError, resetGame, restartCompletedGame } from "../repositories/game-lifecycle.repository";

export type GameLifecycleActionState = { error?: string; success?: string; gameId?: string };

export async function finishGameAction(_previous: GameLifecycleActionState, form: FormData): Promise<GameLifecycleActionState> {
  try {
    const actorId = await getAuthenticatedUserId();
    const gameId = String(form.get("gameId"));
    const operationId = String(form.get("operationId"));
    if (!actorId || !UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(operationId)) throw new GameLifecycleError("Los datos de finalización no son válidos.");
    await finishGame(actorId, { gameId, operationId });
    revalidatePath(`/master/partidas/${gameId}`);
    revalidatePath("/master/campanas/[id]", "page");
    return { success: "Partida finalizada." };
  } catch (error) {
    if (error instanceof GameLifecycleError || error instanceof PreparationError) return { error: error.message };
    console.error("Error finalizando partida", error);
    return { error: "No se pudo finalizar la partida. Actualizá los datos antes de reintentar." };
  }
}

export async function resetGameAction(_previous: GameLifecycleActionState, form: FormData): Promise<GameLifecycleActionState> {
  try {
    const actorId = await getAuthenticatedUserId();
    const gameId = String(form.get("gameId"));
    const operationId = String(form.get("operationId"));
    if (!actorId || !UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(operationId)) throw new GameLifecycleError("Los datos de reinicio no son válidos.");
    const result = await resetGame(actorId, { gameId, operationId });
    revalidatePath(`/master/partidas/${gameId}`);
    return { success: result.inherited ? "Ejecución descartada. Se restauraron los valores del final de origen; permanecen protegidos." : "Ejecución descartada. Podés editar los valores de preparación y reconfigurar los períodos." };
  } catch (error) {
    if (error instanceof GameLifecycleError || error instanceof PreparationError) return { error: error.message };
    console.error("Error reiniciando partida", error);
    return { error: "No se pudo reiniciar la partida. Actualizá los datos antes de reintentar." };
  }
}

export async function restartCompletedGameAction(_previous: GameLifecycleActionState, form: FormData): Promise<GameLifecycleActionState> {
  try {
    const actorId = await getAuthenticatedUserId();
    const gameId = String(form.get("gameId"));
    const operationId = String(form.get("operationId"));
    if (!actorId || !UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(operationId)) throw new GameLifecycleError("Los datos de reinicio no son válidos.");
    const result = await restartCompletedGame(actorId, { gameId, operationId });
    revalidatePath("/master/campanas/[id]", "page");
    return { success: "Nueva partida creada desde el snapshot final.", gameId: result.gameId };
  } catch (error) {
    if (error instanceof GameLifecycleError || error instanceof PreparationError) return { error: error.message };
    console.error("Error creando partida desde final", error);
    return { error: "No se pudo crear la nueva partida. Actualizá los datos antes de reintentar." };
  }
}

export async function deleteGameAction(_previous: GameLifecycleActionState, form: FormData): Promise<GameLifecycleActionState> {
  let campaignId: string;
  try {
    const actorId = await getAuthenticatedUserId();
    const gameId = String(form.get("gameId"));
    const operationId = String(form.get("operationId"));
    if (!actorId || !UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(operationId)) throw new GameLifecycleError("Los datos de eliminación no son válidos.");
    const result = await deleteGame(actorId, { gameId, operationId });
    campaignId = result.campaignId;
    revalidatePath("/master/campanas/[id]", "page");

  } catch (error) {
    if (error instanceof GameLifecycleError || error instanceof PreparationError) return { error: error.message };
    console.error("Error eliminando partida", error);
    return { error: "No se pudo eliminar la partida porque existen datos protegidos o cambió su estado. Actualizá los datos antes de reintentar." };
  }
  redirect(`/master/campanas/${campaignId}`);
}
