"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { restartCompletedGameAction } from "../application/game-lifecycle-actions";

export function RestartCompletedGameForm({ gameId }: { gameId: string }) {
  const [state, action, pending] = useActionState(restartCompletedGameAction, {});
  const operationId = useRef<string | null>(null);
  return <form action={action} className="mt-3" onSubmit={(event) => {
    if (!window.confirm("¿Reiniciar esta partida? Se creará una nueva partida desde su snapshot final y la histórica permanecerá intacta.")) { event.preventDefault(); return; }
    operationId.current ??= crypto.randomUUID();
    (event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="operationId" defaultValue="" />
    <button type="submit" disabled={pending} className="rounded-xl border border-sky-300/60 px-4 py-2 font-bold text-sky-200 disabled:opacity-50">{pending ? "Creando…" : "Reiniciar partida"}</button>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
    {state.success && <p role="status" className="mt-3 text-sm text-emerald-300">{state.success} {state.gameId && <Link className="underline" href={`/master/partidas/${state.gameId}`}>Abrir nueva partida</Link>}</p>}
  </form>;
}
