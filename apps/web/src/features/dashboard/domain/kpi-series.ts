// #33: KPI cards and evolution for the dashboard. Pure functions (no database), covered by unit tests.
export type KpiOption = { key: string; label: string; position: number };
export type KpiDefinition = { id: string; name: string; unit: string; precision: number; valueType: "numeric" | "ordinal"; ordinalOptions: KpiOption[] };
export type StoredValue = { value: string | null; ordinalKey: string | null };
export type KpiChange = { kpiDefinitionId: string; roundId: string; revision: number; after: StoredValue };
export type SeriesPeriod = { id: string; sequence: number; status: string };
export type KpiPoint = { label: string; number: number | null; display: string; running?: boolean };
export type KpiTrend = { direction: "up" | "down" | "flat"; display: string; against: string } | null;
export type DashboardKpi = { id: string; name: string; unit: string; valueType: "numeric" | "ordinal"; current: KpiPoint; trend: KpiTrend; series: KpiPoint[]; levels: KpiOption[] };

const formatNumber = (raw: string, precision: number) =>
  new Intl.NumberFormat("es-AR", { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(Number(raw));

export function pointFor(definition: KpiDefinition, stored: StoredValue | undefined, label: string): KpiPoint {
  if (definition.valueType === "ordinal") {
    const option = definition.ordinalOptions.find(o => o.key === stored?.ordinalKey);
    return { label, number: option ? option.position : null, display: option ? option.label : "Sin valor" };
  }
  if (stored?.value === null || stored?.value === undefined || !Number.isFinite(Number(stored.value))) return { label, number: null, display: "Sin valor" };
  return { label, number: Number(stored.value), display: `${formatNumber(stored.value, definition.precision)}${definition.unit ? ` ${definition.unit}` : ""}` };
}

// Trend of the current value against the previous point of the series (the close of the previous period, or the
// start). It only states the direction: whether higher is better depends on each KPI and its goals (#34).
export function trendFor(definition: KpiDefinition, series: KpiPoint[], current: KpiPoint): KpiTrend {
  const previous = series.length >= 2 ? series[series.length - 2] : null;
  if (!previous || previous.number === null || current.number === null) return null;
  const difference = current.number - previous.number;
  const direction = difference > 0 ? "up" : difference < 0 ? "down" : "flat";
  if (definition.valueType === "ordinal") return { direction, display: direction === "flat" ? "Sin cambios" : `${previous.display} → ${current.display}`, against: previous.label };
  const amount = formatNumber(String(Math.abs(difference)), definition.precision);
  return { direction, display: direction === "flat" ? "Sin cambios" : `${difference > 0 ? "+" : "−"}${amount}${definition.unit ? ` ${definition.unit}` : ""}`, against: previous.label };
}

// Series per KPI: "Inicio" (initial snapshot), then the value at the close of each started period (the last change
// in that period, or the previous value if nothing changed). The running period ends at the current value.
export function buildKpiSeries(input: {
  definitions: KpiDefinition[]; periodLabel: string; periods: SeriesPeriod[];
  initial: Map<string, StoredValue>; current: Map<string, StoredValue>; changes: KpiChange[];
}): DashboardKpi[] {
  const started = [...input.periods].filter(p => p.status !== "pending").sort((a, b) => a.sequence - b.sequence);
  return input.definitions.map(definition => {
    const changes = input.changes.filter(c => c.kpiDefinitionId === definition.id).sort((a, b) => a.revision - b.revision);
    let value = input.initial.get(definition.id);
    const series: KpiPoint[] = [pointFor(definition, value, "Inicio")];
    for (const period of started) {
      const running = period.status === "active" || period.status === "paused";
      const inPeriod = changes.filter(c => c.roundId === period.id);
      value = running ? input.current.get(definition.id) ?? value : inPeriod.length ? inPeriod[inPeriod.length - 1].after : value;
      series.push({ ...pointFor(definition, value, `${input.periodLabel} ${period.sequence}`), ...(running ? { running: true } : {}) });
    }
    const current = pointFor(definition, input.current.get(definition.id) ?? value, "Actual");
    return { id: definition.id, name: definition.name, unit: definition.unit, valueType: definition.valueType, current,
      trend: trendFor(definition, series, current), series, levels: definition.valueType === "ordinal" ? definition.ordinalOptions : [] };
  });
}
