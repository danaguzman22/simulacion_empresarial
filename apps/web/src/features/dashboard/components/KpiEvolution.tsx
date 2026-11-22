"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardKpi, KpiPoint } from "../domain/kpi-series";

function EvolutionTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: KpiPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow"><p className="font-semibold text-slate-600">{point.label}{point.running ? " (en curso)" : ""}</p><p className="font-bold text-[#0b3159]">{point.display}</p></div>;
}

// Evolution of every KPI during the game: start, close of each period, and the running period (#33).
// Each chart also has a hidden table with the same values for screen readers.
export function KpiEvolution({ kpis }: { kpis: DashboardKpi[] }) {
  const charted = kpis.filter(k => k.series.filter(p => p.number !== null).length >= 2);
  if (!charted.length) return <p className="mt-3 text-sm text-slate-500">La evolución aparece cuando termina el primer período.</p>;
  return <div className="mt-3 grid gap-4 md:grid-cols-2">
    {charted.map(kpi => {
      const label = (value: number) => kpi.valueType === "ordinal" ? kpi.levels.find(l => l.position === value)?.label ?? "" : new Intl.NumberFormat("es-AR", { notation: "compact" }).format(value);
      return <figure key={kpi.id} className="rounded-xl border border-slate-200/80 bg-white/60 p-3">
        <figcaption className="text-sm font-bold text-[#0b3159]">{kpi.name}{kpi.unit ? <span className="font-normal text-slate-500"> · {kpi.unit}</span> : null}</figcaption>
        <div aria-hidden className="mt-2 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={kpi.series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#cbd5e1" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#475569" }} tickLine={false} axisLine={false} />
              <YAxis width={56} tick={{ fontSize: 11, fill: "#475569" }} tickLine={false} axisLine={false} tickFormatter={label}
                {...(kpi.valueType === "ordinal" ? { ticks: kpi.levels.map(l => l.position), domain: [Math.min(...kpi.levels.map(l => l.position)), Math.max(...kpi.levels.map(l => l.position))] } : { domain: ["auto", "auto"] as const })} />
              <Tooltip content={<EvolutionTooltip />} />
              <Line type={kpi.valueType === "ordinal" ? "stepAfter" : "monotone"} dataKey="number" stroke="#0b3159" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only"><caption>Evolución de {kpi.name}</caption><tbody>{kpi.series.map(p => <tr key={p.label}><th scope="row">{p.label}{p.running ? " (en curso)" : ""}</th><td>{p.display}</td></tr>)}</tbody></table>
      </figure>;
    })}
  </div>;
}
