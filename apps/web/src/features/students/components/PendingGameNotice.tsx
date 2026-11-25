import { pendingGameTitle, pendingPeriodText, type PendingPeriods } from "../domain/pending-game";

// "Mis partidas" card and the game's own URL before Start: no link to Mi ficha, just when it will be available.
export function PendingGameNotice({ periods }: { periods: PendingPeriods }) {
  const period = pendingPeriodText(periods);
  return <div className="mt-2 text-slate-400">
    <p>{pendingGameTitle}. Tu ficha va a estar disponible cuando el Master la inicie.</p>
    {period && <p className="mt-1 text-sm">{period}</p>}
  </div>;
}
