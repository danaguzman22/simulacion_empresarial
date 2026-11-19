import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, campaigns, campaignMembers, companies, rounds, gameCardAssignments } from "@/db/schema";
import { institutionAccessSql } from "@/features/institutions/repositories/institution-access";
import { canReadAssignedCard } from "@/features/students/domain/assignment";
import { isStaffRole, type DashboardViewer } from "../domain/dashboard";

// Read-only dashboard data. Access is checked here on every read (also on the auto-refresh): campaign staff with
// institution access, or a participant with a card in this game once it started. Anyone else gets null.
// Only public game data is selected; private card data, secrets and draft configuration never travel.
export async function readDashboard(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const [game] = await tx.select({ id: games.id, name: games.name, status: games.status, sequence: games.sequence, campaignId: games.campaignId,
      campaignName: campaigns.name, periodLabel: games.periodLabel, companyId: companies.id })
      .from(games).innerJoin(campaigns, eq(campaigns.id, games.campaignId)).innerJoin(companies, eq(companies.id, campaigns.companyId))
      .where(and(eq(games.id, gameId), institutionAccessSql(companies.id, actorId)));
    if (!game) return null;
    const [member] = await tx.select({ role: campaignMembers.role }).from(campaignMembers)
      .where(and(eq(campaignMembers.campaignId, game.campaignId), eq(campaignMembers.profileId, actorId)));
    let viewer: DashboardViewer | null = member && isStaffRole(member.role) ? "staff" : null;
    if (!viewer && canReadAssignedCard(game.status)) {
      const [assignment] = await tx.select({ id: gameCardAssignments.id }).from(gameCardAssignments)
        .where(and(eq(gameCardAssignments.gameId, game.id), eq(gameCardAssignments.profileId, actorId)));
      if (assignment) viewer = "participant";
    }
    if (!viewer) return null;
    const periods = await tx.select({ id: rounds.id, sequence: rounds.sequence, name: rounds.name, status: rounds.status, endsAt: rounds.endsAt, remainingMs: rounds.remainingMs })
      .from(rounds).where(eq(rounds.gameId, game.id)).orderBy(asc(rounds.sequence));
    const [time] = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    return {
      viewer,
      serverNow: new Date(time.now).toISOString(),
      game: { id: game.id, name: game.name, status: game.status, sequence: game.sequence, campaignName: game.campaignName },
      periodLabel: game.periodLabel ?? "Ronda",
      periods: periods.map(p => ({ ...p, endsAt: p.endsAt?.toISOString() ?? null })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export type DashboardData = NonNullable<Awaited<ReturnType<typeof readDashboard>>>;
