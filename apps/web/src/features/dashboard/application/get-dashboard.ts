import "server-only";
import { cache } from "react";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { readDashboard } from "../repositories/dashboard.repository";

// Cached per request: a layout and its tab read the dashboard once. Null when the session cannot read this game.
export const loadDashboard = cache(async (gameId: string) => {
  if (typeof gameId !== "string" || !UUID_PATTERN.test(gameId)) return null;
  const actorId = await getAuthenticatedUserId();
  if (!actorId) return null;
  return readDashboard(gameId, actorId);
});
