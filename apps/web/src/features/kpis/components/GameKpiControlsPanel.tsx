"use client";

import { useActionState, useRef, useState } from "react";
import { updateGameKpiAction, type GameKpiActionState } from "../application/game-kpi-actions";
import type { GameKpiControl, GameKpiControls } from "../repositories/game-kpi.repository";

type Data = NonNullable<GameKpiControls>;
const initialState: GameKpiActionState = {};
const inputClass = "w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white";

function normalizedIdentity(kpi: GameKpiControl) {
  return `${kpi.key} ${kpi.name}`.toLocaleLowerCase("es").replace(/[áéíóú]/g, (letter) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" })[letter] ?? letter);
}

function isLeadTime(kpi: GameKpiControl) {
  return /(^|\s|_)(lead[_ -]?time)(\s|_|$)/.test(normalizedIdentity(kpi));
}

function isFunds(kpi: GameKpiControl) {
  return /(^|\s|_)(budget|presupuesto|fondos|funds|cash)(\s|_|$)/.test(normalizedIdentity(kpi));
}

function KpiControl({ gameId, data, kpi }: { gameId: string; data: Data; kpi: GameKpiControl }) {
  const valueInput = useRef<HTMLInputElement>(null);
  const [currentValue, setCurrentValue] = useState(kpi.value ?? "");
  const [currentRevision, setCurrentRevision] = useState(data.revision);
  const [percentage, setPercentage] = useState("10");
  const [amount, setAmount] = useState("");
  const [state, action, pending] = useActionState(async (previous: GameKpiActionState, form: FormData) => {
    const result = await updateGameKpiAction(previous, form);
    if (result.success && result.revision !== undefined && result.value !== undefined) {
      setCurrentRevision(result.revision);
      setCurrentValue(result.value);
    }
    return result;
  }, initialState);
  const operationId = useRef<string | null>(null);
  const leadTime = kpi.valueType === "numeric" && isLeadTime(kpi);
  const funds = kpi.valueType === "numeric" && isFunds(kpi);
  const currentNumber = Number(currentValue || 0);
  const percentageNumber = Number(percentage) || 0;
  const percentageChange = Math.round(currentNumber * (percentageNumber / 100));
  const decreasedLeadTime = Math.max(0, currentNumber - percentageChange);
  const increasedLeadTime = currentNumber + percentageChange;
  const amountNumber = Number(amount) || 0;
  const ordinalLabel = kpi.ordinalOptions.find((option) => option.key === currentValue)?.label;
  const currentDisplay = kpi.valueType === "ordinal" ? (ordinalLabel ?? (currentValue || "Sin configurar")) : (currentValue || "Sin configurar");
  return <form action={action} className="rounded-2xl border border-white/10 p-5" onChange={() => { operationId.current = null; }} onSubmit={(event) => {
    operationId.current ??= crypto.randomUUID();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (valueInput.current && submitter?.dataset.adjustment) {
      const nextValue = submitter.dataset.adjustment === "lead-decrease"
        ? decreasedLeadTime
        : submitter.dataset.adjustment === "lead-increase"
          ? increasedLeadTime
          : submitter.dataset.adjustment === "funds-subtract"
            ? currentNumber - amountNumber
            : currentNumber + amountNumber;
      valueInput.current.value = String(nextValue);
    }
    (event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId} />
    <input type="hidden" name="kpiDefinitionId" value={kpi.id} />
    <input type="hidden" name="roundId" value={data.activeRoundId ?? ""} />
    <input type="hidden" name="revision" value={currentRevision} readOnly />
    <input type="hidden" name="roundRevision" value={data.activeRoundRevision ?? ""} />
    <input type="hidden" name="operationId" defaultValue="" />
    {(leadTime || funds) && <input ref={valueInput} type="hidden" name="value" value={currentValue} readOnly />}
    <h3 className="font-bold">{kpi.name}</h3>
    <p className="mt-2 text-sm text-slate-400">Actual: <span className="font-semibold text-slate-200">{currentDisplay}{kpi.unit ? ` ${kpi.unit}` : ""}</span></p>
    {data.canEdit ? <>
      {leadTime ? <>
        <label className="mt-4 block text-sm font-semibold text-slate-200" htmlFor={`percentage-${kpi.id}`}>Porcentaje de modificación</label>
        <div className="mt-2 flex items-center gap-2"><input id={`percentage-${kpi.id}`} type="number" min="0" step="any" value={percentage} onChange={(event) => setPercentage(event.target.value)} className={inputClass} /><span className="font-bold">%</span></div>
        <div className="mt-4 rounded-xl border border-sky-300/15 bg-white/[0.05] p-4 text-sm text-slate-300">
          <p>Cambio calculado: <strong className="text-white">{percentageChange} {kpi.unit}</strong></p>
          <p className="mt-1">Si disminuye: <strong className="text-white">{currentNumber} → {decreasedLeadTime} {kpi.unit}</strong></p>
          <p>Si aumenta: <strong className="text-white">{currentNumber} → {increasedLeadTime} {kpi.unit}</strong></p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3"><button type="submit" data-adjustment="lead-decrease" disabled={pending} className="rounded-xl border border-sky-400/60 bg-sky-400/10 px-3 py-3 font-bold text-sky-200 disabled:opacity-50">↓ Disminuir {percentageNumber}%</button><button type="submit" data-adjustment="lead-increase" disabled={pending} className="rounded-xl bg-sky-300 px-3 py-3 font-bold text-slate-950 disabled:opacity-50">↑ Aumentar {percentageNumber}%</button></div>
      </> : funds ? <>
        <label className="mt-4 block text-sm font-semibold text-slate-200" htmlFor={`amount-${kpi.id}`}>Monto</label>
        <input id={`amount-${kpi.id}`} type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className={`${inputClass} mt-2`} aria-label={`Monto de ${kpi.name}`} />
        <div className="mt-4 grid grid-cols-2 gap-3"><button type="submit" data-adjustment="funds-subtract" disabled={pending} className="rounded-xl border border-red-400/70 bg-red-600/20 px-3 py-3 font-bold text-red-200 disabled:opacity-50">− Restar</button><button type="submit" data-adjustment="funds-add" disabled={pending} className="rounded-xl border border-emerald-400/70 bg-emerald-500/20 px-3 py-3 font-bold text-emerald-200 disabled:opacity-50">+ Sumar</button></div>
      </> : kpi.valueType === "ordinal" ? <select name="value" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} className={`${inputClass} mt-4`} aria-label={`Nuevo valor de ${kpi.name}`}>
        {kpi.ordinalOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      </select> : <><input name="value" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} inputMode="decimal" className={`${inputClass} mt-4`} aria-label={`Nuevo valor de ${kpi.name}`} /><button type="submit" disabled={pending} className="mt-3 rounded-xl bg-sky-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending ? "Guardando…" : "Guardar cambio"}</button></>}
      {!leadTime && !funds && kpi.valueType === "ordinal" && <button type="submit" disabled={pending} className="mt-3 rounded-xl bg-sky-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending ? "Guardando…" : "Guardar cambio"}</button>}
      {state.error && <p role="alert" className="mt-3 text-sm text-red-300">{state.error}</p>}
      {state.success && <p role="status" className="mt-3 text-sm text-emerald-300">{state.success}</p>}
    </> : null}
  </form>;
}

export function GameKpiControlsPanel({ gameId, data }: { gameId: string; data: Data }) {
  return <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8" aria-labelledby="game-kpi-controls-title">
    <h2 id="game-kpi-controls-title" className="text-2xl font-black">Controles de la partida</h2>
    {data.kpis.length === 0 ? <p className="mt-4 text-sm text-slate-400">No hay KPIs seleccionados para esta partida.</p> : <>
      <p className="mt-2 text-sm text-slate-400">Estado actual de los indicadores seleccionados.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{data.kpis.map((kpi) => <KpiControl key={kpi.id} gameId={gameId} data={data} kpi={kpi} />)}</div>
    </>}
    {!data.canEdit && data.allCompleted && <p className="mt-5 text-sm text-slate-400">Todos los períodos finalizaron. Los controles quedan en solo lectura durante la evaluación final.</p>}
    {!data.canEdit && !data.allCompleted && !data.hasActiveRound && <p className="mt-5 text-sm text-slate-400">Iniciá un período para registrar cambios operativos.</p>}
    {!data.canEdit && !data.allCompleted && data.hasActiveRound && <p className="mt-5 text-sm text-slate-400">Solo lectura.</p>}
  </section>;
}
