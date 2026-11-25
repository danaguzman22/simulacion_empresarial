"use client";
import { useActionState, useState } from "react";
import { cardAction } from "../application/card-actions";

type BaseCard = { id: string; name: string; department: string; visualIdentity: string };

// "Traer fichas de la campaña" (game in preparation, Master only): the base cards this game does not have yet, to
// bring all or some. The server checks everything again; the cards already in the game are never touched.
export function BringCampaignCards({ gameId, available }: { gameId: string; available: BaseCard[] }) {
  const [state, action, pending] = useActionState(cardAction, {});
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(available.map(c => c.id)));
  if (!available.length) return <p className="mt-4 text-sm text-slate-400">La partida ya tiene todas las fichas de la campaña.{state.success ? ` ${state.success}` : ""}</p>;
  const all = chosen.size === available.length;
  return <div className="mt-4 rounded-xl border border-white/10 p-4">
    {!open ? <button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-sky-400 px-4 py-2 font-bold text-slate-950 hover:bg-sky-300">Traer fichas de la campaña ({available.length})</button>
      : <form action={action} className="space-y-3">
        <input type="hidden" name="kind" value="game" /><input type="hidden" name="scopeId" value={gameId} /><input type="hidden" name="operation" value="add_many" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">Fichas de la campaña que esta partida todavía no tiene</p>
          <button type="button" onClick={() => setChosen(all ? new Set() : new Set(available.map(c => c.id)))} className="text-sm text-sky-300 hover:underline">{all ? "Quitar todas" : "Elegir todas"}</button>
        </div>
        <ul className="space-y-1">{available.map(c => <li key={c.id}><label className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
          <input type="checkbox" name="sourceId" value={c.id} checked={chosen.has(c.id)} onChange={e => setChosen(old => { const next = new Set(old); if (e.target.checked) next.add(c.id); else next.delete(c.id); return next; })} />
          <span>{c.visualIdentity && <span className="mr-1">{c.visualIdentity}</span>}<b>{c.name}</b>{c.department && <span className="text-slate-400"> · {c.department}</span>}</span>
        </label></li>)}</ul>
        <p className="text-xs text-slate-400">Se copian como están en la campaña. Las fichas que la partida ya tiene no se tocan.</p>
        {state.error && <p role="alert" className="text-sm text-red-300">{state.error}</p>}
        <div className="flex gap-2">
          <button disabled={pending || !chosen.size} className="rounded-xl bg-sky-400 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending ? "Trayendo…" : `Traer ${chosen.size} ${chosen.size === 1 ? "ficha" : "fichas"}`}</button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200">Cancelar</button>
        </div>
      </form>}
    {state.success && !open && <p role="status" className="mt-2 text-sm text-emerald-300">{state.success}</p>}
  </div>;
}
