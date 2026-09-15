import type { games } from "@/db/schema";

export type GameType = typeof games.$inferSelect.type;
export type GameStatus = typeof games.$inferSelect.status;
export type GameListItem = Pick<
  typeof games.$inferSelect,
  "id" | "sequence" | "name" | "description" | "type" | "status"
>;

export const gameTypeLabels: Record<GameType, string> = {
  onboarding: "Preparación",
  development: "Desarrollo",
  final: "Final",
  custom: "Personalizada",
};

export const gameStatusLabels: Record<GameStatus, string> = {
  draft: "Borrador",
  ready: "Lista",
  active: "Activa",
  paused: "Pausada",
  evaluation: "Pendiente de evaluación",
  completed: "Completada",
  cancelled: "Cancelada",
};

export function isGameType(value: string): value is GameType {
  return Object.prototype.hasOwnProperty.call(gameTypeLabels, value);
}

export function validateGameName(name: string): string | null {
  return name.trim() ? null : "Ingresá un nombre para la partida.";
}

export function nextGameSequence(maxSequence: number | null): number {
  const next = maxSequence === null ? 0 : maxSequence + 1;
  if (!Number.isInteger(next) || next < 0 || next > 2147483647) {
    throw new Error("No se puede asignar una nueva secuencia de partida.");
  }
  return next;
}
