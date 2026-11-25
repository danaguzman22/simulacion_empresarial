// Portal of the participant: a game with their card that did not start yet (draft or ready). The "Mis partidas"
// card and the screen for someone who opens the game's URL anyway say exactly the same.
export type PendingPeriods = { periodCount: number | null; periodLabel: string | null; periodDurationSeconds: number | null };

export const pendingGameTitle = "La partida todavía no empezó";

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return [h && `${h} h`, m && `${m} min`, s && `${s} s`].filter(Boolean).join(" ");
}

// "Programada: 4 períodos (Ronda) de 20 min." Only when the Master already set the periods; otherwise null.
export function pendingPeriodText({ periodCount, periodLabel, periodDurationSeconds }: PendingPeriods) {
  if (!periodCount || periodCount < 1 || !periodDurationSeconds || periodDurationSeconds < 1) return null;
  const label = periodLabel?.trim();
  return `Programada: ${periodCount} ${periodCount === 1 ? "período" : "períodos"}${label ? ` (${label})` : ""} de ${duration(periodDurationSeconds)}.`;
}
