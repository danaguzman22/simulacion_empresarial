"use client";

import { useActionState } from "react";
import { createGameAction, type CreateGameState } from "../application/create-game";
import { gameTypeLabels } from "../domain/game";

const initialState: CreateGameState = {};

export function CreateGameForm({ campaignId }: { campaignId: string }) {
  const [state, formAction, pending] = useActionState(createGameAction, initialState);
  const inputClass = "w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3.5 text-white outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div>
        <label htmlFor="game-name" className="mb-2 block text-sm font-bold text-slate-200">Nombre de la partida</label>
        <input id="game-name" name="name" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="game-description" className="mb-2 block text-sm font-bold text-slate-200">Descripción (opcional)</label>
        <textarea id="game-description" name="description" rows={3} className={inputClass} />
      </div>
      <div>
        <label htmlFor="game-type" className="mb-2 block text-sm font-bold text-slate-200">Tipo</label>
        <select id="game-type" name="type" defaultValue="development" className={inputClass}>
          {Object.entries(gameTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      {state.error && <p role="alert" className="rounded-2xl bg-red-500/10 p-3 text-sm text-red-200">{state.error}</p>}
      {state.success && <p role="status" className="rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-200">{state.success}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-2xl bg-white px-5 py-3.5 font-black text-slate-950 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-400 disabled:cursor-wait disabled:opacity-50"
      >
        {pending ? "Creando..." : "Crear partida"}
      </button>
    </form>
  );
}
