"use client";
import { useActionState } from "react";
import { saveRevealConfiguration } from "../application/reveal-actions";
export function RevealConfigurationForm({ gameId, card }: { gameId: string; card: { id: string; revision: number; secretRevealLimit?: number | null; secretRevealSeconds?: number | null } }) {
  const [state, action, pending] = useActionState(saveRevealConfiguration, { message: "" });
  return <form action={action} className="mt-3 space-y-3 text-sm"><input type="hidden" name="gameId" value={gameId} /><input type="hidden" name="cardId" value={card.id} /><input type="hidden" name="revision" value={card.revision} />
    <label className="block">Máximo por departamento<input className="ml-3 w-24 rounded bg-slate-900 p-2" required type="number" name="limit" min={0} max={100} defaultValue={card.secretRevealLimit ?? 2} /></label>
    <label className="block">Duración en segundos<input className="ml-3 w-24 rounded bg-slate-900 p-2" required type="number" name="seconds" min={1} max={3600} defaultValue={card.secretRevealSeconds ?? 10} /></label>
    <p className="text-slate-400">El cupo es compartido por toda la ficha. Cero deshabilita nuevas revelaciones.</p>
    <button disabled={pending} className="rounded bg-sky-700 px-3 py-2 disabled:opacity-50">Guardar revelaciones</button><p role="status">{state.message}</p>
  </form>;
}
