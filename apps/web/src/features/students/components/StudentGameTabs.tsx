"use client";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { defaultStudentTab, studentTabs } from "../domain/student-tabs";

export function StudentGameTabs({ gameId }: { gameId: string }) {
  const current = useSelectedLayoutSegment() ?? defaultStudentTab;
  return <nav aria-label="Secciones de la partida" className="mt-6 overflow-x-auto">
    <ul className="flex min-w-max gap-2 border-b border-white/10 pb-2">
      {studentTabs.map(({ tab, label }) => <li key={tab}>
        <Link href={`/alumno/partidas/${gameId}/${tab}`} aria-current={tab === current ? "page" : undefined}
          className={`block rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-sky-400 ${tab === current ? "bg-sky-300 text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>{label}</Link>
      </li>)}
    </ul>
  </nav>;
}
