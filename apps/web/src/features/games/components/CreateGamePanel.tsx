"use client";
import { useState } from "react";
import { CreateGameForm } from "./CreateGameForm";

// #78: "Crear partida" is a button; the form opens below it and can be closed without creating anything.
export function CreateGamePanel({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  return <div className="w-full sm:w-auto">
    {!open && <div className="flex justify-end"><button type="button" onClick={() => setOpen(true)} className="rounded-xl bg-sky-400 px-4 py-2 font-bold text-slate-950 hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-sky-200">Crear partida</button></div>}
    {open && <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 sm:w-[380px]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-black">Crear partida</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-300 hover:text-white">Cerrar</button>
      </div>
      <div className="mt-6"><CreateGameForm campaignId={campaignId} /></div>
    </div>}
  </div>;
}
