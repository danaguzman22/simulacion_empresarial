"use client";
import { useState } from "react";

// #106: the Master already receives the secret objective (readCards only selects it for the Master); on the card it
// starts covered and is uncovered with a click, without consuming anything. Participants use SecretReveal instead.
export function SecretCover({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return <div className="relative overflow-hidden rounded-lg border border-white/15 bg-slate-900/70">
    <p className={`p-2.5 text-xs text-slate-300 transition ${open ? "" : "select-none opacity-50 blur-sm"}`} aria-hidden={!open}>
      <b className="uppercase tracking-wider text-amber-300">Secreto</b> — {text}
    </p>
    <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
      className={`absolute inset-0 grid place-items-center bg-slate-950/90 text-[11px] font-black uppercase tracking-[0.14em] text-amber-300 transition focus-visible:outline-2 focus-visible:outline-amber-300 ${open ? "pointer-events-none opacity-0" : ""}`}>
      🂠 Objetivo secreto · Solo Master — tocar para ver
    </button>
    {open && <button type="button" onClick={() => setOpen(false)} className="absolute right-1 top-1 rounded px-1.5 text-[10px] text-slate-400 hover:text-white">Tapar</button>}
  </div>;
}
