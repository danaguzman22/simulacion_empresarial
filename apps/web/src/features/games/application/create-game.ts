"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { isGameType, validateGameName } from "../domain/game";
import { createGame } from "../repositories/game.repository";

export type CreateGameState = { error?: string; success?: string };

export async function createGameAction(
  _previousState: CreateGameState,
  formData: FormData
): Promise<CreateGameState> {
  try {
    const profileId = await getAuthenticatedUserId();
    if (!profileId) {
      return { error: "Tu sesión no es válida. Volvé a iniciar sesión." };
    }

    const campaignId = formData.get("campaignId");
    const name = formData.get("name");
    const description = formData.get("description");
    const type = formData.get("type");

    if (
      typeof campaignId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campaignId) ||
      typeof name !== "string" ||
      (description !== null && typeof description !== "string") ||
      typeof type !== "string" || !isGameType(type)
    ) {
      return { error: "Los datos enviados no son válidos." };
    }

    const error = validateGameName(name);
    if (error) return { error };

    const result = await createGame({
      campaignId, profileId, name, description, type,
    });

    if (result.status !== "created") {
      return { error: "No tenés permiso para crear partidas en esta campaña." };
    }

    revalidatePath(`/master/campanas/${campaignId}`);
    return { success: "Partida creada correctamente." };
  } catch (error) {
    console.error("Error creando partida:", error);
    return { error: "No se pudo crear la partida. Intentá nuevamente." };
  }
}
