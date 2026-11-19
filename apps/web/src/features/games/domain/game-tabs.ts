import type { GameStatus } from "./game";

export type GameTab = "kpis" | "tiempos" | "metas" | "reglas" | "fichas" | "equipos" | "dashboard" | "control" | "registros" | "evaluacion";

export const gameTabLabels: Record<GameTab, string> = {
  kpis: "KPIs",
  tiempos: "Tiempos",
  metas: "Metas",
  reglas: "Reglas",
  fichas: "Fichas",
  equipos: "Equipos",
  dashboard: "Dashboard",
  control: "Control",
  registros: "Registros",
  evaluacion: "Evaluación",
};

const preparationTabs: GameTab[] = ["kpis", "tiempos", "metas", "reglas", "fichas", "equipos"];
const playingTabs: GameTab[] = ["dashboard", "control", "metas", "reglas", "fichas", "equipos", "registros"];

export function isPreparationStatus(status: GameStatus) {
  return status === "draft" || status === "ready";
}

// Which tabs exist depends only on the game status; each tab's component still applies its own server rules.
export function gameTabsFor(status: GameStatus): GameTab[] {
  if (isPreparationStatus(status)) return preparationTabs;
  if (status === "active" || status === "paused") return playingTabs;
  if (status === "evaluation" || status === "completed") return [...playingTabs, "evaluacion"];
  return ["registros"];
}

export function defaultGameTab(status: GameStatus): GameTab {
  if (status === "evaluation" || status === "completed") return "evaluacion";
  return gameTabsFor(status)[0];
}

export function isGameTab(value: string): value is GameTab {
  return Object.prototype.hasOwnProperty.call(gameTabLabels, value);
}
