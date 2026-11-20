import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { gameStateSets, gameStateValues, gameKpiChanges, gameGoals, gameResults, gameSituations, gameRules, gameRuleExecutions } from "@/db/schema";
import { selectionContext, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { buildKpiSeries, type KpiDefinition, type SeriesPeriod, type StoredValue } from "../domain/kpi-series";
import { buildGoalBoard } from "../domain/goal-board";
import { buildWall, type WallItem } from "../domain/wall";

// #33 and #34: KPIs (with their series) and goals of the game, read once inside the dashboard's read-only
// transaction (access is already checked there). Only the current state set counts, so values discarded by a
// Reset never show. Goals carry only public data (no observations, no evaluator). The wall (#35) carries only
// visible situations and rules and the Master's manual KPI changes; Master-only items are filtered in the queries.
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
  let wall: WallItem[] = [];
  if (currentSet) {
    const situations = await tx.select({ id: gameSituations.id, roundId: gameSituations.roundId, title: gameSituations.title, description: gameSituations.description,
      effectCount: gameSituations.effectCount, publishedAt: gameSituations.publishedAt }).from(gameSituations)
      .where(and(eq(gameSituations.gameId, game.id), eq(gameSituations.stateSetId, currentSet.id), eq(gameSituations.visibility, "display")));
    const ruleExecutions = await tx.select({ id: gameRuleExecutions.id, roundId: gameRuleExecutions.roundId, name: gameRules.name, displayMessage: gameRules.displayMessage,
      executedAt: gameRuleExecutions.executedAt }).from(gameRuleExecutions).innerJoin(gameRules, eq(gameRules.id, gameRuleExecutions.ruleId))
      .where(and(eq(gameRuleExecutions.gameId, game.id), eq(gameRuleExecutions.stateSetId, currentSet.id), eq(gameRules.visibility, "display")));
    const wallChanges = await tx.select({ id: gameKpiChanges.id, source: gameKpiChanges.source, roundId: gameKpiChanges.roundId, kpiDefinitionId: gameKpiChanges.kpiDefinitionId,
      situationId: gameKpiChanges.situationId, ruleExecutionId: gameKpiChanges.ruleExecutionId, before: gameKpiChanges.before, after: gameKpiChanges.after, createdAt: gameKpiChanges.createdAt })
      .from(gameKpiChanges).where(and(eq(gameKpiChanges.gameId, game.id), eq(gameKpiChanges.stateSetId, currentSet.id)));
    const stored = (raw: unknown): StoredValue => { const v = (raw ?? {}) as { value?: unknown; ordinalKey?: unknown };
      return { value: typeof v.value === "string" ? v.value : null, ordinalKey: typeof v.ordinalKey === "string" ? v.ordinalKey : null }; };
    wall = buildWall({ definitions, periods, periodLabel,
      situations: situations.map(x => ({ ...x, publishedAt: x.publishedAt.toISOString() })),
      ruleExecutions: ruleExecutions.map(x => ({ ...x, executedAt: x.executedAt.toISOString() })),
      changes: wallChanges.map(c => ({ ...c, before: stored(c.before), after: stored(c.after), createdAt: c.createdAt.toISOString() })) });
  }
  return { kpis, goals: buildGoalBoard({ status: game.status, goals, definitions, current, storedResult: storedResult ?? null }), wall };
}
