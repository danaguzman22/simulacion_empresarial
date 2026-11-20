"use client";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { gameTabLabels, type GameTab } from "../domain/game-tabs";

export function GameTabs({ gameId, tabs, defaultTab, complete, notes }: { gameId: string; tabs: GameTab[]; defaultTab: GameTab; complete?: Partial<Record<GameTab, boolean>>; notes?: Partial<Record<GameTab, string>> }) {
  const segment = useSelectedLayoutSegment();
  const current = segment ?? defaultTab;
  return <nav aria-label="Secciones de la partida" className="mt-8 overflow-x-auto">
    <ul className="flex min-w-max gap-2 border-b border-white/10 pb-2">
      {tabs.map(tab => {
        const active = tab === current, done = complete?.[tab], note = notes?.[tab];
        return <li key={tab}>
          <Link href={`/master/partidas/${gameId}/${tab}`} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${active ? "bg-sky-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
            {gameTabLabels[tab]}
            {done && <span aria-label="completa" className={active ? "text-emerald-800" : "text-emerald-300"}>✓</span>}
            {!done && note && <span className={`text-xs font-normal ${active ? "text-slate-800" : "text-slate-400"}`}>{note}</span>}
          </Link>
        </li>;
      })}
    </ul>
  </nav>;
}
