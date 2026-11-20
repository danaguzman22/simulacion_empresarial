export type RequirementSection = "goals" | "rules";

export function isRequirementSection(value: unknown): value is RequirementSection {
  return value === "goals" || value === "rules";
}

// D-33: an empty required section blocks the start. Goals count any goal; rules count only enabled rules.
export function sectionRequirementMissing(input: { goalsRequired: boolean; rulesRequired: boolean; goals: number; enabledRules: number }) {
  const missing: string[] = [];
  if (input.goalsRequired && input.goals === 0) missing.push("Metas: cargá al menos una meta o marcá Metas como opcional.");
  if (input.rulesRequired && input.enabledRules === 0) missing.push("Reglas: activá al menos una regla o marcá Reglas como opcional.");
  return missing;
}
