import { canWritePreparation, isPreparationEditable, normalizeValue, PreparationError, type OrdinalOption } from "@/features/preparation/domain/preparation";

type SelectedKpi = {
  id: string; name: string; required: boolean; valueType: "numeric" | "ordinal";
  precision: number; allowsNegative: boolean; ordinalOptions: OrdinalOption[];
};
type PreparedValue = { kpiDefinitionId: string; value: string | null; ordinalKey: string | null };
export function canStartGame(role: string, status: string) {
  return canWritePreparation(role) && isPreparationEditable(status, null);
}
export function validateStartValues(definitions: SelectedKpi[], values: PreparedValue[]) {
  const missing = definitions.filter(d => d.required && !values.some(v => v.kpiDefinitionId === d.id));
  if (missing.length) throw new PreparationError(`Completá los KPIs obligatorios: ${missing.map(d => d.name).join(", ")}.`);
  for (const row of values) {
    const definition = definitions.find(d => d.id === row.kpiDefinitionId);
    if (!definition) throw new PreparationError("La preparación contiene un KPI no seleccionado.");
    if (definition.valueType === "numeric" ? row.value === null || row.ordinalKey !== null : row.ordinalKey === null || row.value !== null) {
      throw new PreparationError(`El valor de ${definition.name} no coincide con su tipo.`);
    }
    const raw = definition.valueType === "numeric" ? row.value! : row.ordinalKey!;
    if (normalizeValue(raw, definition) === null) throw new PreparationError(`Falta el valor de ${definition.name}.`);
  }
}
