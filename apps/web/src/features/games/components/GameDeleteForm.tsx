"use client";

import { useActionState, useRef } from "react";
import { deleteGameAction } from "../application/game-lifecycle-actions";

export function GameDeleteForm({ gameId }: { gameId: string }) {
  const [state, action, pending] = useActionState(deleteGameAction, {});
  const operationId = useRef<string | null>(null);
  return <form action={action} className="mt-3" onSubmit={(event) => {
    if (!window.confirm("¿Eliminar esta partida?\n\nSe eliminarán permanentemente los datos de esta partida.\n\nEsta acción no se puede deshacer.")) { event.preventDefault(); return; }
    operationId.current ??= crypto.randomUUID();
    (event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="operationId" defaultValue="" />
    <button type="submit" disabled={pending} className="rounded-xl border border-red-300/60 px-4 py-2 font-bold text-red-200 disabled:opacity-50">{pending ? "Eliminando…" : "Eliminar partida"}</button>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
  </form>;
}
