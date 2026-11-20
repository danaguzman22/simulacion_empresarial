// #35: notice wall of the dashboard. Pure functions (no database), covered by unit tests.
// Only public data reaches it: notices and situations published as visible ("display"), rules marked visible, and
// the Master's manual KPI changes. Never Master-only items, secret reveals, remaining uses, or who made a change.
// New kinds (ability use M-3, group decisions, dice rolls, transcriptions X.6) are added to WallKind and to
// buildWall; the panel already renders any kind with its own label.
import { pointFor, type KpiDefinition, type StoredValue } from "./kpi-series";

export type WallKind = "notice" | "situation" | "rule" | "master_change";
export const wallKindLabels: Record<WallKind, string> = {
  notice: "Aviso del Master",
  situation: "Situación",
  rule: "Regla automática",
  master_change: "Cambio del Master",
};
export type WallEffect = { kpi: string; before: string; after: string };
export type WallItem = { id: string; kind: WallKind; periodId: string; periodLabel: string; at: string; title: string; body: string | null; effects: WallEffect[] };

export type WallSituation = { id: string; roundId: string; title: string; description: string; effectCount: number; publishedAt: string };
export type WallRuleExecution = { id: string; roundId: string; name: string; displayMessage: string; executedAt: string };
export type WallChange = { id: string; source: string; roundId: string; kpiDefinitionId: string; situationId: string | null; ruleExecutionId: string | null; before: StoredValue; after: StoredValue; createdAt: string };

export function buildWall(input: {
  definitions: KpiDefinition[]; periods: Array<{ id: string; sequence: number }>; periodLabel: string;
  situations: WallSituation[]; ruleExecutions: WallRuleExecution[]; changes: WallChange[];
}): WallItem[] {
  const periodName = (id: string) => { const p = input.periods.find(x => x.id === id); return p ? `${input.periodLabel} ${p.sequence}` : input.periodLabel; };
  const effect = (c: WallChange): WallEffect | null => {
    const definition = input.definitions.find(d => d.id === c.kpiDefinitionId);
    if (!definition) return null;
    return { kpi: definition.name, before: pointFor(definition, c.before, "").display, after: pointFor(definition, c.after, "").display };
  };
  const effectsOf = (match: (c: WallChange) => boolean) => input.changes.filter(match).map(effect).filter((e): e is WallEffect => e !== null);
  const items: WallItem[] = [
    ...input.situations.map(s => ({ id: `situation:${s.id}`, kind: (s.effectCount > 0 ? "situation" : "notice") as WallKind, periodId: s.roundId, periodLabel: periodName(s.roundId),
      at: s.publishedAt, title: s.title, body: s.description || null, effects: effectsOf(c => c.situationId === s.id) })),
    ...input.ruleExecutions.map(r => ({ id: `rule:${r.id}`, kind: "rule" as WallKind, periodId: r.roundId, periodLabel: periodName(r.roundId),
      at: r.executedAt, title: r.displayMessage.trim() || r.name, body: null, effects: effectsOf(c => c.ruleExecutionId === r.id) })),
    ...input.changes.filter(c => c.source === "manual").flatMap(c => {
      const e = effect(c);
      return e ? [{ id: `manual:${c.id}`, kind: "master_change" as WallKind, periodId: c.roundId, periodLabel: periodName(c.roundId), at: c.createdAt,
        title: `El Master ajustó ${e.kpi}`, body: null, effects: [e] }] : [];
    }),
  ];
  // Newest first; ties keep a stable order.
  return items.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
