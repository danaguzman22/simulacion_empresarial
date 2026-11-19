import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { gameStateSets, gameStateValues, gameGoals, gameRules, gameRoleCards, gameCardAssignments } from "@/db/schema";
import { access, selectionContext } from "@/features/preparation/repositories/preparation.repository";
import { PreparationError } from "@/features/preparation/domain/preparation";
import { validateGameRules } from "@/features/rules/repositories/rule.repository";
import { validateStartValues } from "../domain/start-game";
import { startBlockers } from "./start-game.repository";
import { canWritePreparation } from "@/features/preparation/domain/preparation";

const message = (error: unknown) => {
  if (error instanceof PreparationError) return error.message;
  throw error;
};

// Read-only summary for the preparation tabs: which tabs are complete and what is still missing to start.
// It applies the same checks the server runs when starting a game; starting still re-validates everything.
export async function readGameSetup(gameId: string, actorId: string) {
  return db.transaction(async tx => {
    const { game, role } = await access(tx, gameId, actorId, false);
    const count = async (table: typeof gameGoals | typeof gameRules | typeof gameRoleCards) =>
      (await tx.select({ n: sql<number>`count(*)::integer` }).from(table).where(eq(table.gameId, gameId)))[0].n;
    const [prep] = await tx.select().from(gameStateSets).where(and(eq(gameStateSets.gameId, gameId), eq(gameStateSets.phase, "preparation")));
    const context = await selectionContext(tx, game.campaignId, game.id);
    const values = prep ? await tx.select().from(gameStateValues).where(eq(gameStateValues.stateSetId, prep.id)) : [];
    let kpiError: string | null = prep ? null : "Guardá la preparación de KPIs.";
    if (!kpiError) try { validateStartValues(context.definitions, values); } catch (error) { kpiError = message(error); }
    let ruleError: string | null = null;
    try { await validateGameRules(tx, game.id, game.campaignId); } catch (error) { ruleError = message(error); }
    const periodsReady = !!game.periodCount && !!game.periodDurationSeconds && !!game.periodLabel;
    const [goals, rules, cards] = [await count(gameGoals), await count(gameRules), await count(gameRoleCards)];
    const [{ enabledRules }] = await tx.select({ enabledRules: sql<number>`count(*)::integer` }).from(gameRules).where(and(eq(gameRules.gameId, gameId), eq(gameRules.enabled, true)));
    // Equipos is complete only when every card has at least one member.
    const unstaffed = (await tx.select({ name: sql<string>`coalesce(nullif(btrim(${gameRoleCards.department}), ''), ${gameRoleCards.name})` }).from(gameRoleCards)
      .where(and(eq(gameRoleCards.gameId, gameId), sql`not exists (select 1 from ${gameCardAssignments} a where a.card_id = ${gameRoleCards.id} and a.game_id = ${gameRoleCards.gameId})`))
      .orderBy(gameRoleCards.name)).map(row => row.name);
    // Exactly the conditions the start checks (shared function), so the button state never disagrees with it.
    const states = await tx.select().from(gameStateSets).where(eq(gameStateSets.gameId, gameId));
    const missing = await startBlockers(tx, game, role, states);
    return {
      complete: {
        kpis: !kpiError && context.definitions.length > 0,
        tiempos: periodsReady,
        metas: goals > 0,
        reglas: !ruleError && (game.rulesRequired ? enabledRules > 0 : rules > 0),
        fichas: cards > 0,
        equipos: cards > 0 && unstaffed.length === 0,
      },
      missing,
      // Not blocking: a participant can join late. Shown next to the start button.
      warnings: unstaffed.length ? [`Estos departamentos no tienen integrantes: ${unstaffed.join(", ")}.`] : [],
      // D-33 switches for the Metas and Reglas tabs.
      requirements: { goals: game.goalsRequired, rules: game.rulesRequired },
      counts: { goals, enabledRules },
      preparationRevision: prep?.revision ?? 0,
      preparing: game.status === "draft" || game.status === "ready",
      canEditRequirements: canWritePreparation(role) && (game.status === "draft" || game.status === "ready"),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
