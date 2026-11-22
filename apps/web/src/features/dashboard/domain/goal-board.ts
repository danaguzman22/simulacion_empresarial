// #34: goals block of the dashboard. Pure functions (no database), covered by unit tests.
// Only public data: title, target, current value and fulfilment. Never the Master's observations or who evaluated.
// D-35: while the game is in evaluation nothing of the Master's evaluation travels (only how many are evaluated);
// each goal's evaluation and the D-10 result appear only after "Finalizar partida" (status completed).
import { classifyResult, resultLabels, suggest } from "@/features/goals/domain/goal";
import type { KpiDefinition, StoredValue } from "./kpi-series";
import { pointFor } from "./kpi-series";

export type ResultCategory = keyof typeof resultLabels;
// D-10 scale, from worst to best, as the dashboard draws it.
export const resultScale: ResultCategory[] = ["epic_failure", "partial_failure", "balanced", "partial_victory", "epic_victory"];
export type BoardGoalInput = { id: string; title: string; goalType: string; kpiDefinitionId: string | null; operator: string | null; numericTarget: string | null; ordinalTargetKey: string | null; fulfilled: boolean | null };
export type BoardGoal = { id: string; title: string; kind: "kpi" | "generic"; kpiName: string | null; target: string | null; current: string | null; meetsNow: boolean | null; evaluation: boolean | null };
export type GoalBoard = {
  phase: "live" | "evaluating" | "final" | "none";
  goals: BoardGoal[];
  liveSummary: { meeting: number; measurable: number };
  evaluated: number;
  result: { fulfilled: number; evaluated: number; percent: number; category: ResultCategory | null; label: string } | null;
};

const symbols: Record<string, string> = { ">=": "≥", "<=": "≤", "=": "=", ">": ">", "<": "<", "!=": "≠" };

function targetText(goal: BoardGoalInput, definition: KpiDefinition | undefined) {
  if (!definition) return null;
  if (goal.ordinalTargetKey !== null) return `${definition.name} = ${definition.ordinalOptions.find(o => o.key === goal.ordinalTargetKey)?.label ?? "nivel no disponible"}`;
  if (goal.numericTarget === null) return null;
  return `${definition.name} ${symbols[goal.operator ?? ""] ?? goal.operator ?? ""} ${pointFor(definition, { value: goal.numericTarget, ordinalKey: null }, "").display}`;
}

export function buildGoalBoard(input: {
  status: string; goals: BoardGoalInput[]; definitions: KpiDefinition[]; current: Map<string, StoredValue>;
  storedResult: { fulfilledCount: number; evaluatedCount: number; category: string | null } | null;
}): GoalBoard {
  const goals: BoardGoal[] = input.goals.map(goal => {
    const definition = input.definitions.find(d => d.id === goal.kpiDefinitionId);
    const value = goal.kpiDefinitionId ? input.current.get(goal.kpiDefinitionId) : undefined;
    const kind = goal.goalType === "kpi" ? "kpi" : "generic";
    return { id: goal.id, title: goal.title, kind, kpiName: definition?.name ?? null, target: kind === "kpi" ? targetText(goal, definition) : null,
      current: kind === "kpi" && definition ? pointFor(definition, value, "").display : null,
      meetsNow: kind === "kpi" && input.status !== "evaluation" && input.status !== "completed" ? suggest(goal, value) : null,
      evaluation: input.status === "completed" ? goal.fulfilled : null };
  });
  const measurable = goals.filter(g => g.meetsNow !== null);
  const evaluated = input.goals.filter(g => g.fulfilled !== null).length;
  const phase = !goals.length ? "none" : input.status === "completed" ? "final" : input.status === "evaluation" ? "evaluating" : "live";
  let result: GoalBoard["result"] = null;
  const stored = input.storedResult;
  if (phase === "final" && stored && stored.evaluatedCount > 0) result = { fulfilled: stored.fulfilledCount, evaluated: stored.evaluatedCount, percent: Math.round(stored.fulfilledCount * 100 / stored.evaluatedCount),
    category: (stored.category as ResultCategory | null) ?? classifyResult(stored.fulfilledCount, stored.evaluatedCount), label: "" };
  if (result) result.label = result.category ? resultLabels[result.category] : "Sin resultado";
  return { phase, goals, liveSummary: { meeting: measurable.filter(g => g.meetsNow).length, measurable: measurable.length }, evaluated, result };
}
