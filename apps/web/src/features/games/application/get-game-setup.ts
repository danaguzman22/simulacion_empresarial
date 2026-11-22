import "server-only";
import { cache } from "react";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { readGameSetup } from "../repositories/game-setup.repository";

// Cached per request: the layout (tab marks, start button) and the Metas/Reglas switches share one read.
export const getGameSetup = cache(async (gameId: string) => {
  const actorId = await getAuthenticatedUserId();
  if (!actorId || !UUID_PATTERN.test(gameId)) return null;
  try { return await readGameSetup(gameId, actorId); }
  catch (error) { if (error instanceof PreparationError) return null; throw error; }
});
