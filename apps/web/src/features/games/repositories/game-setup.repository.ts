import "server-only";
import { and, eq, inArray, lt, desc, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, gameStateSets, gameStateValues, gameGoals, gameRules, gameRoleCards, gameCardAssignments } from "@/db/schema";
import { access, selectionContext } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { validateGameRules } from "@/features/rules/repositories/rule.repository";
import { canStartGame, validateStartValues } from "../domain/start-game";

const message = (error: unknown) => {
  if (error instanceof PreparationError) return error.message;
  throw error;
};

// Read-only summary for the preparation tabs: which tabs are complete and what is still missing to start.
// It applies the same checks the server runs when starting a game; starting still re-validates everything.
export async function readGameSetup(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const { game, role } = await access(tx, gameId, actorId, false);
    const count = async (table: typeof gameGoals | typeof gameRules | typeof gameRoleCards | typeof gameCardAssignments) =>
      (await tx.select({ n: sql<number>`count(*)::integer` }).from(table).where(eq(table.gameId, gameId)))[0].n;
    const [prep] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, gameId), eq(gameStateSets.phase, "preparation")));
    const context = await selectionContext(tx, game.campaignId, game.id);
    const values = prep ? await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, prep.id)) : [];
    let kpiError: string | null = prep ? null : "Guardá la preparación de KPIs.";
    if (!kpiError) try { validateStartValues(context.definitions, values); } catch (error) { kpiError = message(error); }
    let ruleError: string | null = null;
    try { await validateGameRules(tx, game.id, game.campaignId); } catch (error) { ruleError = message(error); }
    const periodsReady = !!game.periodCount && !!game.periodDurationSeconds && !!game.periodLabel;
    const [goals, rules, cards, assignments] = [await count(gameGoals), await count(gameRules), await count(gameRoleCards), await count(gameCardAssignments)];
    const [otherActive] = await tx.select({ id: games.id }).from(games).where(and(eq(games.campaignId, game.campaignId), ne(games.id, game.id), inArray(games.status, ["active", "paused"])));
    const [previous] = game.sequence > 0
      ? await tx.select({ status: games.status }).from(games).where(and(eq(games.campaignId, game.campaignId), lt(games.sequence, game.sequence))).orderBy(desc(games.sequence)).limit(1)
      : [];
    const missing = [
      !canStartGame(role, game.status) && "Solo Master o Co-Master pueden iniciar la partida.",
      kpiError && `KPIs: ${kpiError}`,
      !periodsReady && "Tiempos: configurá los períodos.",
      ruleError && `Reglas: ${ruleError}`,
      otherActive && "Ya hay otra partida activa o pausada en esta campaña.",
      previous && previous.status !== "completed" && "La partida anterior de la campaña tiene que estar finalizada.",
    ].filter((item): item is string => typeof item === "string");
    return {
      complete: {
        kpis: !kpiError && context.definitions.length > 0,
        tiempos: periodsReady,
        metas: goals > 0,
        reglas: rules > 0 && !ruleError,
        fichas: cards > 0,
        equipos: assignments > 0,
      },
      missing,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
