export class AssignmentError extends Error {}
export const canReadAssignedCard = (status: string) => ["active", "paused", "evaluation", "completed"].includes(status);
export const canManageAssignments = (role: string, status: string) => role === "master" && ["draft", "ready", "active", "paused"].includes(status);
export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export type AssignmentCommand = { gameId: string; cardId: string; email: string; assignmentId: string; expectedRevision: number; operation: "add" | "move" | "remove" };
export function validateAssignment(c: AssignmentCommand) {
  if (!isUuid(c.gameId) || !["add", "move", "remove"].includes(c.operation) || (c.operation !== "remove" && !isUuid(c.cardId))) throw new AssignmentError("Revisá la partida y el departamento.");
  if (c.operation === "add" && (typeof c.email !== "string" || c.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim()))) throw new AssignmentError("Ingresá el correo registrado del alumno.");
  if (c.operation !== "add" && (!isUuid(c.assignmentId) || !Number.isSafeInteger(c.expectedRevision) || c.expectedRevision < 0)) throw new AssignmentError("Recargá los integrantes antes de continuar.");
}
