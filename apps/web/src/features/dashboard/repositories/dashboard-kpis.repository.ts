import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { gameStateSets, gameStateValues, gameKpiChanges, gameGoals, gameResults } from "@/db/schema";
import { selectionContext, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { buildKpiSeries, type KpiDefinition, type SeriesPeriod, type StoredValue } from "../domain/kpi-series";
import { buildGoalBoard } from "../domain/goal-board";

// #33 and #34: KPIs (with their series) and goals of the game, read once inside the dashboard's read-only
// transaction (access is already checked there). Only the current state set counts, so values discarded by a
// Reset never show. Goals carry only public data (no observations, no evaluator).
export async function readDashboardIndicators(tx: Transaction, game: { id: string; campaignId: string; status: string }, periodLabel: string, periods: SeriesPeriod[]) {
  const context = await selectionContext(tx, game.campaignId, game.id);
  const definitions: KpiDefinition[] = context.definitions.map(d => ({ id: d.id, name: d.name, unit: d.unit ?? "", precision: d.precision ?? 0,
    valueType: d.valueType, ordinalOptions: (d.ordinalOptions ?? []).map(o => ({ key: o.key, label: o.label, position: o.position })) }));
  const states = await tx.select({ id: gameStateSets.id, phase: gameStateSets.phase }).from(gameStateSets)
    .where(and(eq(gameStateSets.gameId, game.id), inArray(gameStateSets.phase, ["initial", "current"])));
  const initialSet = states.find(s => s.phase === "initial"), currentSet = states.find(s => s.phase === "current");
  const values = initialSet && currentSet ? await tx.select({ stateSetId: gameStateValues.stateSetId, kpiDefinitionId: gameStateValues.kpiDefinitionId, value: gameStateValues.value, ordinalKey: gameStateValues.ordinalKey })
    .from(gameStateValues).where(inArray(gameStateValues.stateSetId, [initialSet.id, currentSet.id])) : [];
  const byPhase = (setId: string | undefined) => new Map<string, StoredValue>(values.filter(v => v.stateSetId === setId).map(v => [v.kpiDefinitionId, { value: v.value, ordinalKey: v.ordinalKey }]));
  const current = byPhase(currentSet?.id);

  let kpis: ReturnType<typeof buildKpiSeries> = [];
  if (initialSet && currentSet) {
    const changes = await tx.select({ kpiDefinitionId: gameKpiChanges.kpiDefinitionId, roundId: gameKpiChanges.roundId, revision: gameKpiChanges.revision, after: gameKpiChanges.after })
      .from(gameKpiChanges).where(and(eq(gameKpiChanges.gameId, game.id), eq(gameKpiChanges.stateSetId, currentSet.id)));
    kpis = buildKpiSeries({
      definitions, periodLabel, periods, initial: byPhase(initialSet.id), current,
      changes: changes.map(c => {
        const after = (c.after ?? {}) as { value?: unknown; ordinalKey?: unknown };
        return { kpiDefinitionId: c.kpiDefinitionId, roundId: c.roundId, revision: c.revision,
          after: { value: typeof after.value === "string" ? after.value : null, ordinalKey: typeof after.ordinalKey === "string" ? after.ordinalKey : null } };
      }),
    });
  }

  const goals = await tx.select({ id: gameGoals.id, title: gameGoals.title, goalType: gameGoals.goalType, kpiDefinitionId: gameGoals.kpiDefinitionId, operator: gameGoals.operator,
    numericTarget: gameGoals.numericTarget, ordinalTargetKey: gameGoals.ordinalTargetKey, fulfilled: gameGoals.fulfilled })
    .from(gameGoals).where(eq(gameGoals.gameId, game.id)).orderBy(asc(gameGoals.createdAt), asc(gameGoals.id));
  const [storedResult] = await tx.select({ fulfilledCount: gameResults.fulfilledCount, evaluatedCount: gameResults.evaluatedCount, category: gameResults.category })
    .from(gameResults).where(eq(gameResults.gameId, game.id));
  return { kpis, goals: buildGoalBoard({ status: game.status, goals, definitions, current, storedResult: storedResult ?? null }) };
}
