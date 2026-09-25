import { PreparationError } from "@/features/preparation/domain/preparation";
export class InstitutionError extends PreparationError {}
export function validId(value: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new InstitutionError("Identificador inválido.");
}
export function canCreateSimulation(role: string) { return role === "admin" || role === "teacher"; }
