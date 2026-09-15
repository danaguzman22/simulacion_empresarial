export class GoalError extends Error {}
export const operators = [">=", "<=", "=", ">", "<", "!="] as const;
export type Operator = typeof operators[number];
export const resultLabels = {
  epic_victory: "Victoria épica", partial_victory: "Victoria parcial", balanced: "Resultado equilibrado",
  partial_failure: "Fracaso parcial", epic_failure: "Fracaso épico",
};
export function classifyResult(fulfilled: number, evaluated: number) {
  if (!Number.isSafeInteger(fulfilled) || !Number.isSafeInteger(evaluated) || fulfilled < 0 || evaluated < fulfilled) throw new GoalError("Counts inválidos.");
  if (!evaluated) return null;
  const numerator = BigInt(fulfilled) * BigInt(100), denominator = BigInt(evaluated);
  return numerator >= BigInt(80) * denominator ? "epic_victory" : numerator >= BigInt(60) * denominator ? "partial_victory" : numerator >= BigInt(40) * denominator ? "balanced" : numerator >= BigInt(20) * denominator ? "partial_failure" : "epic_failure";
}
export function decimal(raw: string) {
  const value = raw.trim().replace(",", ".");
  if (!/^-?\d{1,24}(?:\.\d{1,12})?$/.test(value)) throw new GoalError("Ingresá un número decimal válido, sin separadores de miles (hasta 12 decimales).");
  return value;
}
function scaled(value: string) { const [whole, fraction = ""] = decimal(value).split("."); return BigInt(whole.replace("-", "") + fraction.padEnd(12, "0")) * BigInt(whole.startsWith("-") ? -1 : 1); }
export function suggest(goal: { goalType: string; operator: string | null; numericTarget: string | null; ordinalTargetKey: string | null }, current: { value: string | null; ordinalKey: string | null } | undefined) {
  if (goal.goalType === "generic" || !current) return null;
  if (goal.ordinalTargetKey !== null) return current.ordinalKey === null ? null : current.ordinalKey === goal.ordinalTargetKey;
  if (goal.numericTarget === null || current.value === null) return null;
  const a = scaled(current.value), b = scaled(goal.numericTarget);
  switch (goal.operator) { case ">=": return a >= b; case "<=": return a <= b; case "=": return a === b; case ">": return a > b; case "<": return a < b; case "!=": return a !== b; default: throw new GoalError("Operador inválido."); }
}
export type GoalDefinition = { title: string; description: string | null; goalType: "kpi" | "generic"; kpiDefinitionId: string | null; operator: Operator | null; numericTarget: string | null; ordinalTargetKey: string | null };
export function validateGoal(input: GoalDefinition) {
  if (!input.title.trim() || input.title.trim().length > 160 || (input.description?.length ?? 0) > 4000) throw new GoalError("Ingresá un título de hasta 160 caracteres y una descripción de hasta 4000.");
  if (!["generic", "kpi"].includes(input.goalType)) throw new GoalError("Tipo de meta inválido.");
  if (input.goalType === "generic") return { ...input, title: input.title.trim(), kpiDefinitionId: null, operator: null, numericTarget: null, ordinalTargetKey: null };
  if (!input.kpiDefinitionId || !operators.includes(input.operator as Operator) || (input.numericTarget === null) === (input.ordinalTargetKey === null)) throw new GoalError("Seleccioná un KPI y una condición válida.");
  if (input.ordinalTargetKey !== null && input.operator !== "=") throw new GoalError("Los niveles se comparan por igualdad.");
  return { ...input, title: input.title.trim(), numericTarget: input.numericTarget === null ? null : decimal(input.numericTarget) };
}
