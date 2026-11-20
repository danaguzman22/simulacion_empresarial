"use client";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { DashboardKpi } from "../domain/kpi-series";

// One KPI: current value, trend against the previous close and a sparkline of the game so far (#33).
// The trend only states the direction; whether up is good depends on the KPI and its goals (#34).
export function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const Icon = kpi.trend?.direction === "up" ? TrendingUp : kpi.trend?.direction === "down" ? TrendingDown : Minus;
  const hasLine = kpi.series.filter(p => p.number !== null).length >= 2;
  return <article aria-label={`KPI ${kpi.name}`} className="flex flex-col rounded-2xl border border-white/70 bg-white/[0.76] p-4 text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.10)] backdrop-blur-xl">
    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500" title={kpi.name}>{kpi.name}</p>
    <p className="mt-1 text-2xl font-extrabold tabular-nums text-[#0b3159] 2xl:text-3xl">{kpi.current.display}</p>
    {kpi.trend
      ? <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-600"><Icon aria-hidden className="h-4 w-4" />{kpi.trend.display}<span className="font-normal text-slate-500">vs. {kpi.trend.against}</span></p>
      : <p className="mt-1 text-xs text-slate-500">Sin cambios todavía</p>}
    {hasLine && <div aria-hidden className="mt-3 h-12">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={kpi.series} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type={kpi.valueType === "ordinal" ? "stepAfter" : "monotone"} dataKey="number" stroke="#0b3159" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>}
  </article>;
}
