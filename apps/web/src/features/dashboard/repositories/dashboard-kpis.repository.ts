import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { gameStateSets, gameStateValues, gameKpiChanges } from "@/db/schema";
import { selectionContext, type Transaction } from "@/features/preparation/repositories/preparation.repository";
import { buildKpiSeries, type KpiDefinition, type SeriesPeriod, type StoredValue } from "../domain/kpi-series";

// #33: KPIs selected for the game with their series, inside the dashboard's read-only transaction (access is already
// checked there). Only changes of the current state set count, so values discarded by a Reset never show.
export async function readDashboardKpis(tx: Transaction, game: { id: string; campaignId: string }, periodLabel: string, periods: SeriesPeriod[]) {
  const states = await tx.select({ id: gameStateSets.id, phase: gameStateSets.phase }).from(gameStateSets)
    .where(and(eq(gameStateSets.gameId, game.id), inArray(gameStateSets.phase, ["initial", "current"])));
  const initialSet = states.find(s => s.phase === "initial"), currentSet = states.find(s => s.phase === "current");
  if (!initialSet || !currentSet) return [];
  const context = await selectionContext(tx, game.campaignId, game.id);
  const definitions: KpiDefinition[] = context.definitions.map(d => ({ id: d.id, name: d.name, unit: d.unit ?? "", precision: d.precision ?? 0,
    valueType: d.valueType, ordinalOptions: (d.ordinalOptions ?? []).map(o => ({ key: o.key, label: o.label, position: o.position })) }));
  const values = await tx.select({ stateSetId: gameStateValues.stateSetId, kpiDefinitionId: gameStateValues.kpiDefinitionId, value: gameStateValues.value, ordinalKey: gameStateValues.ordinalKey })
    .from(gameStateValues).where(inArray(gameStateValues.stateSetId, [initialSet.id, currentSet.id]));
  const byPhase = (setId: string) => new Map<string, StoredValue>(values.filter(v => v.stateSetId === setId).map(v => [v.kpiDefinitionId, { value: v.value, ordinalKey: v.ordinalKey }]));
  const changes = await tx.select({ kpiDefinitionId: gameKpiChanges.kpiDefinitionId, roundId: gameKpiChanges.roundId, revision: gameKpiChanges.revision, after: gameKpiChanges.after })
    .from(gameKpiChanges).where(and(eq(gameKpiChanges.gameId, game.id), eq(gameKpiChanges.stateSetId, currentSet.id)));
  return buildKpiSeries({
    definitions, periodLabel, periods, initial: byPhase(initialSet.id), current: byPhase(currentSet.id),
    changes: changes.map(c => {
      const after = (c.after ?? {}) as { value?: unknown; ordinalKey?: unknown };
      return { kpiDefinitionId: c.kpiDefinitionId, roundId: c.roundId, revision: c.revision,
        after: { value: typeof after.value === "string" ? after.value : null, ordinalKey: typeof after.ordinalKey === "string" ? after.ordinalKey : null } };
    }),
  });
}
