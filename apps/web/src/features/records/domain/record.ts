export type RecordKind = "manual" | "situation" | "rule" | "rule_change" | "round" | "game";
export type RecordEffect = {
  name: string;
  before: string;
  after: string;
  variation: string | null;
};
export type RecordEvent = {
  id: string;
  kind: RecordKind;
  occurredAt: string;
  periodId: string | null;
  title: string;
  description: string;
  actor: string | null;
  automatic: boolean;
  source: string;
  effects: RecordEffect[];
  reason?: string;
  note?: string;
  discardedByResetId: string | null;
};
export type RecordsData = {
  periods: Array<{ id: string; label: string }>;
  events: RecordEvent[];
  hasResets: boolean;
};
type Stamp = Date | string;
type Audit = { id: string; actorId: string | null; createdAt: Stamp };
export type RecordsSource = {
  periodLabel: string;
  status: string;
  periods: Array<{ id: string; sequence: number; status: string }>;
  actors: Array<{ id: string; displayName: string }>;
  definitions: Array<{ id: string; name: string; unit: string }>;
  rules: Array<{ id: string; name: string }>;
  changes: Array<Audit & { source: string; roundId: string; kpiDefinitionId: string; situationId: string | null; ruleExecutionId: string | null; before: unknown; after: unknown; amount: string | null }>;
  situations: Array<{ id: string; actorId: string; roundId: string; title: string; description: string; publishedAt: Stamp }>;
  executions: Array<{ id: string; ruleId: string; roundId: string; reason: string; executedAt: Stamp }>;
  ruleChanges: Array<Audit & { ruleId: string; kpiDefinitionId: string; revision: number; beforeAmount: string; afterAmount: string; reason: string; discardedByResetId: string | null }>;
  roundChanges: Array<Audit & { roundId: string; operation: string; details: unknown }>;
  starts: Array<Audit & { details: unknown }>;
  lifecycle: Array<Audit & { operationId: string; operation: string; details: unknown }>;
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value : null;
const iso = (value: Stamp) => new Date(value).toISOString();
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Format audited decimal strings without losing precision through Number. */
export function formatRecordNumber(raw: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return "Valor no disponible";
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction ? `,${fraction}` : ""}`;
}
export function recordDifference(before: string, after: string): string | null {
  if (![before, after].every(value => /^-?\d+(?:\.\d+)?$/.test(value))) return null;
  const scale = Math.max(before.split(".")[1]?.length ?? 0, after.split(".")[1]?.length ?? 0);
  const scaled = (value: string) => {
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    return BigInt(whole + fraction.padEnd(scale, "0")) * BigInt(value.startsWith("-") ? -1 : 1);
  };
  const delta = scaled(after) - scaled(before);
  const digits = (delta < BigInt(0) ? -delta : delta).toString().padStart(scale + 1, "0");
  const magnitude = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return `${delta < BigInt(0) ? "-" : delta > BigInt(0) ? "+" : ""}${formatRecordNumber(magnitude)}`;
}
function group<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) { const id = key(row); const items = result.get(id) ?? []; items.push(row); result.set(id, items); }
  return result;
}

export function composeRecords(data: RecordsSource): RecordsData {
  const actors = new Map(data.actors.map(a => [a.id, a.displayName]));
  const definitions = new Map(data.definitions.map(d => [d.id, d]));
  const rules = new Map(data.rules.map(r => [r.id, r.name]));
  const periods = [...data.periods].sort((a, b) => a.sequence - b.sequence).map(r => ({ id: r.id, label: `${data.periodLabel} ${r.sequence}` }));
  const labels = new Map(periods.map(p => [p.id, p.label]));
  const period = (id: string) => labels.has(id) ? id : null;
  const actor = (id: string | null) => id ? actors.get(id) || "Usuario registrado" : null;
  const withUnit = (value: string, unit?: string) => [value, unit].filter(Boolean).join(" ");
  const effect = (change: RecordsSource["changes"][number]): RecordEffect => {
    const definition = definitions.get(change.kpiDefinitionId);
    const before = object(change.before), after = object(change.after);
    const ordinal = string(before.ordinalKey) !== null || string(after.ordinalKey) !== null;
    const format = (value: Record<string, unknown>) => ordinal
      ? string(value.label) ?? "Nivel no disponible"
      : typeof value.value === "string" ? withUnit(formatRecordNumber(value.value), definition?.unit) : "Sin valor registrado";
    const variation = !ordinal && typeof before.value === "string" && typeof after.value === "string" ? recordDifference(before.value, after.value) : null;
    return { name: definition?.name ?? "Indicador no disponible", before: format(before), after: format(after), variation: variation === null ? null : withUnit(variation, definition?.unit) };
  };
  const changes = [...data.changes].sort((a, b) => compare(a.kpiDefinitionId, b.kpiDefinitionId) || compare(a.id, b.id));
  const situationEffects = group(changes.filter(c => c.source === "situation" && c.situationId), c => c.situationId!);
  const ruleEffects = group(changes.filter(c => c.source === "rule" && c.ruleExecutionId), c => c.ruleExecutionId!);
  const events: RecordEvent[] = [];
  const tiePriorities = new Map<string, number>();
  const base = (id: string, kind: RecordKind, at: Stamp, source: string): RecordEvent => ({ id, kind, occurredAt: iso(at), periodId: null, title: "", description: "", actor: null, automatic: false, source, effects: [], discardedByResetId: null });

  for (const c of changes.filter(c => c.source === "manual")) events.push({
    ...base(`manual:${c.id}`, "manual", c.createdAt, "Cambio manual de KPI"), periodId: period(c.roundId), actor: actor(c.actorId),
    title: `Modificación de ${definitions.get(c.kpiDefinitionId)?.name ?? "un indicador"}`, description: "Valor actualizado manualmente.", effects: [effect(c)],
  });
  for (const s of data.situations) {
    const effects = (situationEffects.get(s.id) ?? []).map(effect);
    events.push({ ...base(`situation:${s.id}`, "situation", s.publishedAt, "Situación publicada"), periodId: period(s.roundId), actor: actor(s.actorId), title: s.title,
      description: s.description || (effects.length ? "Situación con efectos sobre los indicadores." : "Sin modificación directa de KPIs."), effects,
      note: effects.length ? undefined : "Sin modificación directa de KPIs.",
    });
  }
  for (const e of data.executions) events.push({
    ...base(`rule:${e.id}`, "rule", e.executedAt, "Ejecución de regla"), periodId: period(e.roundId), automatic: true,
    title: rules.get(e.ruleId) ?? "Regla automática", description: `Aplicada al cierre ${e.reason === "timer" ? "por timer" : "manual"} de ${labels.get(e.roundId) ?? "un período"}.`,
    effects: (ruleEffects.get(e.id) ?? []).map(effect),
  });
  // Several changed effects at the same rule revision are one confirmed edit.
  for (const [id, rows] of group(data.ruleChanges, c => `${c.ruleId}:${c.revision}`)) {
    rows.sort((a, b) => compare(iso(a.createdAt), iso(b.createdAt)) || compare(a.id, b.id));
    const first = rows[0];
    events.push({ ...base(`rule-change:${id}`, "rule_change", first.createdAt, "Edición de importes de regla"), actor: actor(first.actorId),
      title: "Importes de regla modificados", description: rules.get(first.ruleId) ?? "Regla ya no disponible en la configuración", reason: first.reason,
      discardedByResetId: first.discardedByResetId,
      note: first.discardedByResetId ? "Ejecución descartada por Reset. Las referencias de nombre y unidad corresponden al catálogo disponible hoy; no se guardaron sus versiones históricas." : "Este cambio no registra un período. Los nuevos importes afectan únicamente cierres posteriores.",
      effects: rows.map(c => {
        const d = definitions.get(c.kpiDefinitionId);
        const amount = (value: string) => `${value.startsWith("-") ? "Disminuir" : "Aumentar"} ${withUnit(formatRecordNumber(value.replace(/^-/, "")), d?.unit)}`;
        return { name: d?.name ?? "Indicador ya no disponible", before: amount(c.beforeAmount), after: amount(c.afterAmount), variation: null };
      }),
    });
  }
  const operations: Record<string, string> = { start: "Inicio", pause: "Pausa", resume: "Reanudación", finish: "Cierre" };
  const roundRanks: Record<string, number> = { start: 10, pause: 20, resume: 30, finish: 70 };
  for (const r of data.roundChanges) {
    if (!operations[r.operation]) continue;
    tiePriorities.set(`round:${r.id}`, roundRanks[r.operation]);
    const reason = string(object(r.details).reason);
    const automatic = r.operation === "finish" && reason === "timer";
    events.push({ ...base(`round:${r.id}`, "round", r.createdAt, "Auditoría de período"), periodId: period(r.roundId), actor: automatic ? null : actor(r.actorId), automatic,
      title: `${operations[r.operation]} de ${labels.get(r.roundId) ?? "período"}`,
      description: r.operation === "finish" ? automatic ? "Cierre automático por vencimiento del timer." : reason === "manual" ? "Cierre solicitado manualmente." : "Cierre registrado; mecanismo no especificado." : "Operación registrada sobre el período.",
    });
  }
  const resetByInitial = new Map<string, string>();
  for (const row of data.lifecycle.filter(l => l.operation === "reset")) {
    const states = object(row.details).discardedStates;
    if (Array.isArray(states)) for (const state of states) { const id = string(object(state).id); if (id) resetByInitial.set(id, row.operationId); }
  }
  for (const row of data.starts) events.push({ ...base(`start:${row.id}`, "game", row.createdAt, "Inicio registrado en preparación"), title: "Partida iniciada", actor: actor(row.actorId),
    description: "Se confirmó el inicio de la simulación.", discardedByResetId: resetByInitial.get(string(object(row.details).initialStateSetId) ?? "") ?? null,
  });
  const lifecycleTitles: Record<string, string> = { finish: "Partida finalizada", reset: "Preparación restaurada (Reset)", create_from_previous: "Preparación heredada de la partida anterior" };
  for (const row of data.lifecycle) {
    if (!lifecycleTitles[row.operation]) continue;
    tiePriorities.set(`game:${row.id}`, row.operation === "create_from_previous" ? -10 : 90);
    events.push({ ...base(`game:${row.id}`, "game", row.createdAt, "Ciclo de vida de partida"), title: lifecycleTitles[row.operation], actor: actor(row.actorId),
      description: row.operation === "reset" ? "Se descartó la ejecución y se restauró la preparación. Su detalle operativo ya no está disponible." : row.operation === "finish" ? "Se confirmó la finalización y se congeló el estado final." : "Se registró la preparación de esta partida a partir de la anterior.",
    });
  }
  // No separate evaluation-transition audit exists. Only show this milestone when
  // both the game state and the surviving close audits substantiate it.
  if (["evaluation", "completed"].includes(data.status) && data.periods.length && data.periods.every(p => p.status === "completed")) {
    const closes = data.roundChanges.filter(r => r.operation === "finish").sort((a, b) => compare(iso(a.createdAt), iso(b.createdAt)) || compare(a.id, b.id));
    const closedIds = new Set(closes.map(c => c.roundId));
    if (data.periods.every(p => closedIds.has(p.id))) {
      const last = closes[closes.length - 1];
      events.push({ ...base(`evaluation:${last.id}`, "game", last.createdAt, "Cierre de todos los períodos"), title: "Períodos completados · Evaluación", automatic: true,
        description: "Finalizaron todos los períodos. La partida quedó disponible para evaluación.", note: "Hito derivado de los cierres registrados; no existe una auditoría independiente de esta transición.",
      });
    }
  }
  // Stable IDs break any remaining ties. A derived evaluation milestone follows
  // its close event even though both intentionally have the same timestamp.
  const ranks: Record<RecordKind, number> = { manual: 40, situation: 40, rule_change: 50, rule: 60, round: 70, game: 90 };
  const rank = (e: RecordEvent) => e.id.startsWith("start:") ? 0 : e.id.startsWith("evaluation:") ? 80 : tiePriorities.get(e.id) ?? ranks[e.kind];
  events.sort((a, b) => compare(a.occurredAt, b.occurredAt) || rank(a) - rank(b) || compare(a.id, b.id));
  return { periods, events, hasResets: data.lifecycle.some(l => l.operation === "reset") };
}

export function filterRecords(data: RecordsData, periodId: string, execution: string) {
  return data.events.filter(event => (periodId === "all" || (periodId === "none" ? event.periodId === null : event.periodId === periodId))
    && (execution === "all" || (execution === "discarded" ? event.discardedByResetId !== null : event.discardedByResetId === null)));
}
