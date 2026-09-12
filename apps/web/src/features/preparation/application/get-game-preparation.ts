import "server-only";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { getGameDetail } from "@/features/games/application/get-game-detail";
import { readPreparation } from "../repositories/preparation.repository";
import { PreparationError } from "../domain/preparation";

export async function getGamePreparation(gameId: string) {
  const result = await getGameDetail(gameId);
  if (result.status !== "found") return result;
  const userId = await getAuthenticatedUserId();
  if (!userId) return { status: "unauthenticated" } as const;
  try {
    const preparation = await readPreparation(gameId, userId);
    return { ...result, preparation };
  } catch (error) {
    if (error instanceof PreparationError) return { status: "not-found" } as const;
    throw error;
  }
}
