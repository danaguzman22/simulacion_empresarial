"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { filterRecords, type RecordKind, type RecordsData } from "../domain/record";

const categories: Record<RecordKind, { label: string; color: string }> = {
  manual: { label: "Cambio manual", color: "border-sky-400/50 bg-sky-400/10 text-sky-200" },
  situation: { label: "Situación", color: "border-violet-400/50 bg-violet-400/10 text-violet-200" },
  rule: { label: "Regla automática", color: "border-amber-400/50 bg-amber-400/10 text-amber-200" },
  rule_change: { label: "Edición de regla", color: "border-orange-400/50 bg-orange-400/10 text-orange-200" },
  round: { label: "Período", color: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200" },
  game: { label: "Partida", color: "border-slate-400/50 bg-slate-400/10 text-slate-200" },
};
const time = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" });
const select = "mt-2 w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-sky-400";

export function RecordsTimeline({ data }: { data: RecordsData }) {
  const router = useRouter();
  const [period, setPeriod] = useState("all");
  const [execution, setExecution] = useState("all");
  const [limit, setLimit] = useState(50);
  // A Reset removes period IDs. Do not leave the filter pointing at a deleted run.
  const selectedPeriod = period === "none" || data.periods.some(p => p.id === period) ? period : "all";
  const events = useMemo(() => filterRecords(data, selectedPeriod, execution), [data, selectedPeriod, execution]);
  const labels = new Map(data.periods.map(p => [p.id, p.label]));
  return <section aria-labelledby="records-title" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-black uppercase tracking-[0.3em] text-sky-400">Memoria de la simulación</p><h2 id="records-title" className="mt-2 text-2xl font-black">Records / Historial</h2><p className="mt-2 text-sm text-slate-400">Decisiones y consecuencias, desde el primer registro. Horarios de Argentina.</p></div>
      <button type="button" onClick={() => router.refresh()} className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400">Actualizar historial</button>
    </header>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Período<select className={select} value={selectedPeriod} onChange={e => { setPeriod(e.target.value); setLimit(50); }}><option value="all">Historial completo de la partida</option>{data.periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}<option value="none">Sin período registrado</option></select></label>
      <label className="text-sm font-semibold">Ejecución<select className={select} value={execution} onChange={e => { setExecution(e.target.value); setLimit(50); }}><option value="all">Todos los registros disponibles</option><option value="current">No descartados</option><option value="discarded">Descartados por Reset</option></select></label>
    </div>
    {data.hasResets && <p className="mt-4 rounded-xl border border-orange-400/20 bg-orange-400/5 p-3 text-sm text-orange-100">Hubo un Reset. Las situaciones, cambios de KPI y operaciones de períodos descartados ya no se conservan. Aquí se muestran únicamente los registros disponibles; los cambios de reglas y los inicios descartados están identificados.</p>}
    <p role="status" className="mt-5 text-sm text-slate-400">{events.length} {events.length === 1 ? "acontecimiento" : "acontecimientos"}</p>
    {!events.length ? <p className="mt-4 rounded-2xl border border-dashed border-white/15 p-6 text-slate-300">{data.events.length ? "No hay acontecimientos para estos filtros." : "Todavía no hay acontecimientos registrados en esta partida."}</p> : <ol className="mt-5 space-y-5 border-l border-white/15 pl-4 sm:pl-6">
      {events.slice(0, limit).map(event => {
        const category = categories[event.kind];
        return <li key={event.id} className={`relative rounded-2xl border p-4 sm:p-5 ${event.discardedByResetId ? "border-dashed border-orange-300/40 bg-orange-950/10" : "border-white/10 bg-slate-950/40"}`}>
          <span aria-hidden="true" className={`absolute -left-[22px] top-6 h-3 w-3 rounded-full border sm:-left-[30px] ${category.color}`} />
          <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full border px-2 py-1 font-semibold ${category.color}`}>{category.label}</span><time dateTime={event.occurredAt} className="text-slate-400">{time.format(new Date(event.occurredAt))}</time><span className="text-slate-400">· {event.periodId ? labels.get(event.periodId) : "Sin período registrado"}</span></div>
          {event.discardedByResetId && <p className="mt-3 text-sm font-semibold text-orange-200">Ejecución descartada por Reset · No vigente</p>}
          <h3 className="mt-3 break-words text-lg font-bold">{event.title}</h3>
          <p className="mt-1 text-sm text-slate-400">{event.automatic ? "Automático / Sistema" : event.actor ?? "Autor no registrado"}</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{event.description}</p>
          {!!event.effects.length && <p className="mt-2 text-sm text-slate-400">{event.effects.length} {event.effects.length === 1 ? "indicador" : "indicadores"}: {event.effects.map(effect => effect.name).join(" · ")}</p>}
          <details className="mt-4 border-t border-white/10 pt-3"><summary className="cursor-pointer text-sm font-semibold text-sky-200 focus-visible:outline-2 focus-visible:outline-sky-400">Ver detalles</summary>
            {event.reason && <div className="mt-4"><p className="text-xs uppercase tracking-wide text-slate-400">Motivo del cambio</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{event.reason}</p></div>}
            <div className="mt-3 space-y-3">{event.effects.map((effect, index) => <div key={index} className="rounded-xl bg-white/[0.03] p-3"><h4 className="font-semibold">{effect.name}</h4><dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-slate-400">Antes</dt><dd className="break-words">{effect.before}</dd></div><div><dt className="text-slate-400">Después</dt><dd className="break-words">{effect.after}</dd></div>{effect.variation !== null && <div><dt className="text-slate-400">Variación</dt><dd className="break-words font-semibold text-sky-200">{effect.variation}</dd></div>}</dl></div>)}</div>
            {event.note && <p className="mt-3 text-sm text-slate-400">{event.note}</p>}<p className="mt-3 text-xs text-slate-500">Origen: {event.source}</p>
          </details>
        </li>;
      })}
    </ol>}
    {events.length > limit && <button type="button" onClick={() => setLimit(n => n + 50)} className="mt-5 rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Mostrar más acontecimientos</button>}
  </section>;
}
