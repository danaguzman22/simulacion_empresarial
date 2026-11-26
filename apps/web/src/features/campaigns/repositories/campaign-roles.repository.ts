import "server-only";
import { and, eq } from "drizzle-orm";
import { gameCardAssignments } from "@/db/schema";
import { PreparationError } from "@/features/preparation/domain/preparation";
import type { Transaction } from "@/features/preparation/repositories/preparation.repository";

export class CampaignRoleError extends PreparationError {}

// D-48: someone who is a member of any game of the campaign cannot get a role in it (Master, Co-Master,
// Observer). Every place that gives a campaign role calls this inside its transaction; the database refuses it
// too (GAME_MEMBER_CANNOT_BE_CAMPAIGN_STAFF, 0036).
export async function requireNotGameMember(tx: Transaction, campaignId: string, profileId: string) {
  const [member] = await tx.select({ id: gameCardAssignments.id }).from(gameCardAssignments)
    .where(and(eq(gameCardAssignments.campaignId, campaignId), eq(gameCardAssignments.profileId, profileId))).limit(1);
  if (member) throw new CampaignRoleError("Primero quitala de los equipos de las partidas de esta campaña.");
}
