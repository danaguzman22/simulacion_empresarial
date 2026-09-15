"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { RoundError } from "../domain/round";
import { parsePeriodConfiguration } from "../domain/period-configuration";
import { readPeriodConfiguration, savePeriodConfiguration } from "../repositories/period-configuration.repository";
async function actor(gameId: string) {
 if (!UUID_PATTERN.test(gameId)) throw new RoundError("Partida inválida.");
 const id = await getAuthenticatedUserId(); if (!id) throw new RoundError("Volvé a iniciar sesión."); return id;
}
export async function getPeriodConfiguration(gameId: string) { return readPeriodConfiguration(gameId, await actor(gameId)); }
export async function savePeriodsAction(_previous: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
 try {
  const gameId = String(form.get("gameId")), actorId = await actor(gameId), operationId = String(form.get("operationId")), revision = String(form.get("revision"));
  if (!UUID_PATTERN.test(operationId) || !/^\d+$/.test(revision) || !Number.isSafeInteger(Number(revision)) || Number(revision) >= 2147483647) throw new RoundError("Datos de revisión inválidos. Recargá la página.");
  const type = String(form.get("type"));
  if (!["Ronda", "Semana", "Mes", "custom"].includes(type)) throw new RoundError("Tipo de período inválido.");
  const label = type === "custom" ? String(form.get("label") ?? "") : type;
  const config = parsePeriodConfiguration(String(form.get("count")), label, String(form.get("minutes")), String(form.get("seconds")));
  await savePeriodConfiguration(actorId, { ...config, gameId, operationId, expectedRevision: Number(revision) });
  revalidatePath(`/master/partidas/${gameId}`); return { success: "Configuración de períodos guardada." };
 } catch (error) {
  if (error instanceof RoundError || error instanceof PreparationError) return { error: error.message };
  console.error("Error guardando períodos", error); return { error: "No se pudo guardar. Recargá los datos antes de reintentar." };
 }
}
