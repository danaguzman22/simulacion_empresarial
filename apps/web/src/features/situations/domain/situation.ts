import { PreparationError, UUID_PATTERN } from "@/features/preparation/domain/preparation";
export class SituationError extends PreparationError {}
export type SituationInput = {
  gameId: string; operationId: string; expectedRevision: number;
  title: string; description: string; visibility: "display" | "master_only";
  effects: Array<{ kpiId: string; amount: string }>;
};
export function validateSituation(input: SituationInput) {
  if (!UUID_PATTERN.test(input.gameId) || !UUID_PATTERN.test(input.operationId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<0 || input.expectedRevision>=2147483647) throw new SituationError("Identificador o revisión inválidos.");
  if (!input.title.trim() || input.title.trim().length>160 || input.description.length>5000) throw new SituationError("Completá un título de hasta 160 caracteres y un texto de hasta 5000.");
  if (!["display","master_only"].includes(input.visibility) || !Array.isArray(input.effects) || input.effects.length>100) throw new SituationError("La situación no es válida.");
  const ids = new Set<string>();
  for (const effect of input.effects) {
    if (!UUID_PATTERN.test(effect.kpiId) || typeof effect.amount!=="string" || effect.amount.length>64) throw new SituationError("El efecto no es válido.");
    if (ids.has(effect.kpiId)) throw new SituationError("No repitas el mismo KPI dentro de una situación.");
    ids.add(effect.kpiId);
  }
}
