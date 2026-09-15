"use client";

import { useActionState, useRef } from "react";
import { resetGameAction } from "../application/game-lifecycle-actions";

export function GameResetForm({ gameId }: { gameId: string }) {
  const [state, action, pending] = useActionState(resetGameAction, {});
  const operationId = useRef<string | null>(null);
  return <form action={action} className="mt-3" onSubmit={(event) => {
    if (!window.confirm("¿Reiniciar esta partida?\n\nSe descartará esta ejecución y la partida volverá a su preparación previa al inicio. Se conservarán los KPIs incluidos/excluidos, sus modos y valores iniciales. Podrás configurar nuevamente la preparación.\n\nEsta acción no se puede deshacer.")) { event.preventDefault(); return; }
    operationId.current ??= crypto.randomUUID();
    (event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="operationId" defaultValue="" />
    <button type="submit" disabled={pending} className="rounded-xl border border-amber-300/60 px-4 py-2 font-bold text-amber-200 disabled:opacity-50">{pending ? "Reiniciando…" : "Reiniciar partida"}</button>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
    {state.success && <p role="status" className="mt-3 text-sm text-emerald-300">{state.success}</p>}
  </form>;
}
