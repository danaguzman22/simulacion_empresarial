"use client";
import { useState } from "react";
import { Megaphone, SlidersHorizontal, Workflow, Zap, type LucideIcon } from "lucide-react";
import { wallKindLabels, type WallItem, type WallKind } from "../domain/wall";
import { DashboardPanel } from "./DashboardPanel";

const icons: Record<WallKind, LucideIcon> = { notice: Megaphone, situation: Zap, rule: Workflow, master_change: SlidersHorizontal };
const time = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

// Notice wall (#35): newest first, each notice marked with its period, filterable by period.
export function NoticeWall({ items }: { items: WallItem[] }) {
  const [period, setPeriod] = useState("all");
  const periods = [...new Map(items.map(i => [i.periodId, i.periodLabel])).entries()];
  const shown = period === "all" ? items : items.filter(i => i.periodId === period);
  return <DashboardPanel eyebrow="Muro" title="Avisos de la partida">
    {periods.length > 1 && <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">Período
      <select value={period} onChange={e => setPeriod(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800">
        <option value="all">Todos</option>{periods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select></label>}
    {!shown.length && <p className="mt-3 text-sm text-slate-500">Todavía no hay avisos.</p>}
    <ol className="mt-3 space-y-2">
      {shown.map(item => { const Icon = icons[item.kind]; return <li key={item.id} className="flex gap-3 rounded-xl border border-slate-200/80 bg-white/60 p-3">
        <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-[#0b3159]" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{wallKindLabels[item.kind]} · {item.periodLabel} · <time dateTime={item.at}>{time(item.at)}</time></p>
          <p className="font-bold text-slate-800">{item.title}</p>
          {item.body && <p className="whitespace-pre-wrap text-sm text-slate-600">{item.body}</p>}
          {item.effects.length > 0 && <ul className="mt-1 text-sm text-slate-700">{item.effects.map((e, i) => <li key={i}>{e.kpi}: {e.before} → <strong>{e.after}</strong></li>)}</ul>}
        </div>
      </li>; })}
    </ol>
  </DashboardPanel>;
}
