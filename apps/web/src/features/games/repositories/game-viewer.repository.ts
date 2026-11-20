import "server-only";
import { and, eq } from "drizzle-orm";
import type { db } from "@/db";
import { games, campaigns, campaignMembers, companies, gameCardAssignments } from "@/db/schema";
import { institutionAccessSql } from "@/features/institutions/repositories/institution-access";
import type { Transaction } from "@/features/preparation/repositories/preparation.repository";
import { canReadAssignedCard } from "@/features/students/domain/assignment";
import { canReadGames } from "../domain/game-access";

type CampaignRole = typeof campaignMembers.$inferSelect.role;
export type GameViewer = { kind: "staff"; role: CampaignRole } | { kind: "participant" };

// The single rule for who can see a game (#80), used by the Master pages and tabs, the dashboard, the projection
// and the participant's page:
// - staff: Master, Co-Master or Observer of the campaign (canReadGames);
// - participant: a person with a card in this game, once it started (canReadAssignedCard);
// - anyone else, or anyone without access to the institution of the company, gets null.
export async function readGameViewer(executor: typeof db | Transaction, gameId: string, actorId: string) {
  const [game] = await executor.select({
    id: games.id, sequence: games.sequence, name: games.name, description: games.description, type: games.type, status: games.status,
    createdAt: games.createdAt, periodLabel: games.periodLabel, campaignId: campaigns.id, campaignName: campaigns.name,
  }).from(games).innerJoin(campaigns, eq(campaigns.id, games.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
    .where(and(eq(games.id, gameId), institutionAccessSql(companies.id, actorId))).limit(1);
  if (!game) return null;
  const [member] = await executor.select({ role: campaignMembers.role }).from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, game.campaignId), eq(campaignMembers.profileId, actorId)));
  if (member && canReadGames(member.role)) return { game, viewer: { kind: "staff", role: member.role } as GameViewer };
  if (!canReadAssignedCard(game.status)) return null;
  const [assignment] = await executor.select({ id: gameCardAssignments.id }).from(gameCardAssignments)
    .where(and(eq(gameCardAssignments.gameId, game.id), eq(gameCardAssignments.profileId, actorId)));
  return assignment ? { game, viewer: { kind: "participant" } as GameViewer } : null;
}
