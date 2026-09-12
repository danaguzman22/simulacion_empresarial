import "server-only";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { readGameLifecycle } from "../repositories/start-game.repository";
export async function getGameLifecycle(gameId: string) {
  const actorId = await getAuthenticatedUserId();
  if (!actorId || !UUID_PATTERN.test(gameId)) return null;
  try { return await readGameLifecycle(gameId, actorId); }
  catch (error) { if (error instanceof PreparationError) return null; throw error; }
}
