import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds } from "@/db/schema";
import { readGameViewer } from "@/features/games/repositories/game-viewer.repository";
import type { DashboardViewer } from "../domain/dashboard";
import { readDashboardIndicators } from "./dashboard-kpis.repository";

// Read-only dashboard data. Access is checked on every read (also on the auto-refresh) with readGameViewer:
// campaign staff, or a participant with a card in this game once it started. Anyone else gets null.
// Only public game data is selected; private card data, secrets and draft configuration never travel.
export async function readDashboard(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    // Same rule as the Master pages and the participant's page (#80).
    const access = await readGameViewer(tx, gameId, actorId);
    if (!access) return null;
    const { game } = access;
    const viewer: DashboardViewer = access.viewer.kind;
    const periods = await tx.select({ id: rounds.id, sequence: rounds.sequence, name: rounds.name, status: rounds.status, endsAt: rounds.endsAt, remainingMs: rounds.remainingMs })
      .from(rounds).where(eq(rounds.gameId, game.id)).orderBy(asc(rounds.sequence));
    const periodLabel = game.periodLabel ?? "Ronda";
    const { kpis, goals, wall } = await readDashboardIndicators(tx, { id: game.id, campaignId: game.campaignId, status: game.status }, periodLabel, periods);
    const [time] = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    return {
      viewer,
      serverNow: new Date(time.now).toISOString(),
      game: { id: game.id, name: game.name, status: game.status, sequence: game.sequence, campaignName: game.campaignName },
      periodLabel,
      kpis,
      goals,
      wall,
      periods: periods.map(p => ({ ...p, endsAt: p.endsAt?.toISOString() ?? null })),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export type DashboardData = NonNullable<Awaited<ReturnType<typeof readDashboard>>>;
