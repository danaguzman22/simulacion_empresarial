"use client";
import { useRef } from "react";
import { StartGameForm } from "./StartGameForm";

type FormProps = { gameId: string; revision: number; catalogToken: string; periodRevision: number };

// One compact "Iniciar partida" button at the end of the tab bar. It is enabled only when nothing is missing;
// the confirmation, the missing items and the non-blocking warnings open in a dialog.
export function StartGameControl({ form, missing, warnings }: { form: FormProps; missing: string[]; warnings: string[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const ready = missing.length === 0;
  const open = () => dialog.current?.showModal();
  return <div className="flex items-center gap-3 pb-2">
    {warnings.length > 0 && <button type="button" onClick={open} className="text-sm text-amber-200 underline-offset-2 hover:underline">⚠ {warnings.length === 1 ? "1 aviso" : `${warnings.length} avisos`}</button>}
    {!ready && <button type="button" onClick={open} className="text-sm text-slate-300 underline-offset-2 hover:underline">Falta ({missing.length})</button>}
    <button type="button" onClick={open} disabled={!ready} className="rounded-xl bg-sky-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">Iniciar partida</button>
    <dialog ref={dialog} aria-labelledby="start-game-title" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-slate-900 p-6 text-white backdrop:bg-slate-950/70">
      <h2 id="start-game-title" className="text-xl font-black">Iniciar partida</h2>
      {!ready && <><p className="mt-4 font-bold text-slate-200">Falta para iniciar:</p>
        <ul className="mt-1 list-inside list-disc text-sm text-slate-300">{missing.map(item => <li key={item}>{item}</li>)}</ul></>}
      {warnings.length > 0 && <ul aria-label="Avisos" className="mt-4 space-y-1 text-sm text-amber-200">{warnings.map(item => <li key={item}>⚠ {item}</li>)}</ul>}
      {ready && <StartGameForm key={`${form.revision}:${form.catalogToken}:${form.periodRevision}`} {...form} />}
      <form method="dialog" className="mt-5 text-right"><button className="rounded-xl px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/10">Cerrar</button></form>
    </dialog>
  </div>;
}
