"use client";

import { useActionState, useRef } from "react";
import { finishGameAction } from "../application/game-lifecycle-actions";

export function GameFinishForm({ gameId }: { gameId: string }) {
  const [state, action, pending] = useActionState(finishGameAction, {});
  const operationId = useRef<string | null>(null);
  return <form action={action} className="mt-5" onSubmit={(event) => {
    if (!window.confirm("¿Finalizar esta partida? Se creará el snapshot final y el estado actual quedará bloqueado.")) { event.preventDefault(); return; }
    operationId.current ??= crypto.randomUUID();
    (event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="operationId" defaultValue="" />
    <button type="submit" disabled={pending} className="rounded-xl bg-amber-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending ? "Finalizando…" : "Finalizar partida"}</button>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
    {state.success && <p role="status" className="mt-3 text-sm text-emerald-300">{state.success}</p>}
  </form>;
}
