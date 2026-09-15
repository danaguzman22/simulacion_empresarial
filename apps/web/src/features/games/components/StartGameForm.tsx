"use client";
import { useActionState, useRef } from "react";
import { startGameAction } from "../application/start-game";
export function StartGameForm({ gameId, revision, catalogToken, periodRevision }: { gameId: string; revision: number; catalogToken: string; periodRevision: number }) {
  const [state, action, pending] = useActionState(startGameAction, {});
  const operationId = useRef<string | null>(null);
  return <form action={action} className="mt-5 space-y-4" onSubmit={e => {
    operationId.current ??= crypto.randomUUID();
    (e.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="operationId" defaultValue="" />
    <input type="hidden" name="periodRevision" value={periodRevision} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="catalogToken" value={catalogToken} />
    <fieldset disabled={pending} className="space-y-4">
      <p className="text-sm text-slate-300">Se usarán los valores guardados. Guardá primero cualquier cambio pendiente en la preparación.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmed" required />Confirmo iniciar y dejar la preparación en solo lectura.</label>
      <button disabled={pending} className="rounded-xl bg-sky-300 px-5 py-3 font-bold text-slate-950 disabled:opacity-50">{pending ? "Iniciando…" : "Iniciar partida"}</button>
    </fieldset>
    {state.error && <div role="alert" className="text-sm text-red-300"><p>{state.error}</p><button type="button" className="mt-2 underline" onClick={() => window.location.reload()}>Recargar datos</button></div>}
    {state.success && <p role="status" className="text-emerald-300">{state.success}</p>}
  </form>;
}
