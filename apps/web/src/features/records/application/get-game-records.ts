import "server-only";
import { getAuthenticatedUserId } from "@/features/auth/application/get-authenticated-user-id";
import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
import { composeRecords } from "../domain/record";
import { readRecordsSource } from "../repositories/records.repository";

export async function getGameRecords(gameId: string) {
  const actorId = await getAuthenticatedUserId();
  if (!actorId) return { status: "unauthenticated" } as const;
  if (!UUID_PATTERN.test(gameId)) return { status: "not-found" } as const;
  try {
    return { status: "found", records: composeRecords(await readRecordsSource(gameId, actorId)) } as const;
  } catch (error) {
    if (error instanceof PreparationError) return { status: "not-found" } as const;
    throw error;
  }
}
