import { remainingMilliseconds, roundLabels } from "@/features/rounds/domain/round";
import type { DashboardData } from "../repositories/dashboard.repository";

const format = (ms: number) => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

// Period and countdown for the dashboard header. `now` comes from the server clock (see GameDashboard).
export function DashboardClock({ data, now }: { data: DashboardData; now: number }) {
  const period = data.periods.find(p => p.status === "active" || p.status === "paused");
  if (!period) {
    const done = data.periods.length > 0 && data.periods.every(p => p.status === "completed");
    return <div className="text-right"><p className="text-sm font-semibold text-slate-500">{done ? "Todos los períodos finalizaron" : "Ningún período en curso"}</p></div>;
  }
  const remaining = remainingMilliseconds(period, now), expired = period.status === "active" && remaining <= 0;
  return <div className="text-right">
    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">{data.periodLabel} {period.sequence}{period.name ? ` · ${period.name}` : ""}</p>
    <p role="timer" aria-label="Tiempo restante del período" className="font-mono text-4xl font-bold tabular-nums text-[#0b3159] 2xl:text-5xl">{format(remaining)}</p>
    <p className="text-xs font-semibold text-slate-500">{expired ? "Tiempo cumplido" : roundLabels[period.status]}</p>
  </div>;
}
