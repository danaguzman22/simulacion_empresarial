"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { GameKpiError, readGameKpiControls, updateGameKpi } from "../repositories/game-kpi.repository";

export type GameKpiActionState = { error?: string; success?: string; revision?: number; value?: string; ordinalKey?: string | null };

function text(form: FormData, name: string) {
  const value = form.get(name);
  if (typeof value !== "string") throw new GameKpiError("Los datos enviados no son válidos.");
  return value;
}

function revision(form: FormData, name: string) {
  const value = text(form, name);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) >= 2147483647) throw new GameKpiError("Revisión inválida. Recargá los datos.");
  return Number(value);
}

export async function getGameKpiControls(gameId: string) {
  const actorId = await getAuthenticatedUserId();
  if (!actorId || !UUID_PATTERN.test(gameId)) return null;
  return readGameKpiControls(gameId, actorId);
}

export async function updateGameKpiAction(_previous: GameKpiActionState, form: FormData): Promise<GameKpiActionState> {
  try {
    const actorId = await getAuthenticatedUserId();
    if (!actorId) throw new GameKpiError("Tu sesión venció. Volvé a iniciar sesión.");
    const gameId = text(form, "gameId");
    const operationId = text(form, "operationId");
    const kpiDefinitionId = text(form, "kpiDefinitionId");
    const roundId = text(form, "roundId");
    if (!UUID_PATTERN.test(gameId) || !UUID_PATTERN.test(operationId) || !UUID_PATTERN.test(kpiDefinitionId) || !UUID_PATTERN.test(roundId)) throw new GameKpiError("Los datos enviados no son válidos.");
    const rawValue = text(form, "value");
    const result = await updateGameKpi(actorId, { gameId, operationId, kpiDefinitionId, roundId, rawValue, expectedRevision: revision(form, "revision"), expectedRoundRevision: revision(form, "roundRevision") });
    revalidatePath(`/master/partidas/${gameId}`);
    return { success: "Cambio de KPI guardado.", revision: result.revision, value: result.value, ordinalKey: result.ordinalKey };
  } catch (error) {
    if (error instanceof GameKpiError || error instanceof PreparationError) return { error: error.message };
    console.error("Error actualizando KPI operativo", error);
    return { error: "No se pudo guardar el cambio. Recargá los datos antes de reintentar." };
  }
}
