"use server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { configureReveals, revealSecret } from "../repositories/reveal.repository";
import type { RevealResult } from "../domain/reveal";
export async function saveRevealConfiguration(_: { message: string }, form: FormData) {
  const actor = await getAuthenticatedUserId(); if (!actor) return { message: "Iniciá sesión nuevamente." };
  const gameId = String(form.get("gameId") ?? "");
  try {
    await configureReveals(actor, { gameId, cardId: String(form.get("cardId") ?? ""), revision: Number(form.get("revision")), limit: Number(form.get("limit")), seconds: Number(form.get("seconds")) });
    revalidatePath(`/master/partidas/${gameId}`); return { message: "Configuración guardada." };
  } catch (e) { return { message: e instanceof PreparationError ? e.message : "No se pudo guardar la configuración." }; }
}
export async function requestSecret(gameId: string, operationId: string | null): Promise<RevealResult | { status: "error"; message: string }> {
  const actor = await getAuthenticatedUserId(); if (!actor) return { status: "error", message: "Iniciá sesión nuevamente." };
  if (operationId !== null && !operationId) return { status: "error", message: "Operación inválida." };
  try {
    const result = await revealSecret(actor, gameId, operationId ?? undefined);
    if (operationId) revalidatePath(`/alumno/partidas/${gameId}`);
    return result;
  } catch (e) { return { status: "error", message: e instanceof PreparationError ? e.message : "No se pudo consultar el objetivo." }; }
}
