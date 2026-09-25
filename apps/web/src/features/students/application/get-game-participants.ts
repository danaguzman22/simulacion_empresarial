import "server-only";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { readParticipants } from "../repositories/assignment.repository";
export async function getGameParticipants(gameId: string) {
  const actor = await getAuthenticatedUserId();
  return actor ? readParticipants(gameId, actor) : null;
}
