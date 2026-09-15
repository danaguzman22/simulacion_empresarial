"use client";
import { useActionState, useRef, useState } from "react";
import { getPeriodConfiguration, savePeriodsAction } from "../application/period-actions";
type Data = Awaited<ReturnType<typeof getPeriodConfiguration>>;
const inputClass = "mt-1 block w-full rounded-lg border border-white/20 bg-slate-950 p-2";
export function PeriodConfigurationForm({ gameId, data }: { gameId: string; data: Data }) {
 const [state, action, pending] = useActionState(savePeriodsAction, {});
 const [type, setType] = useState(!data.label || ["Ronda", "Semana", "Mes"].includes(data.label) ? data.label ?? "Ronda" : "custom");
 const operationId = useRef<string | null>(null);
 if (!data.canEdit) return <p className="mt-4 text-slate-300">{data.count ? `${data.count} períodos: ${data.label}. Duración: ${Math.floor(data.durationSeconds! / 60)} min ${data.durationSeconds! % 60} s.` : "Sin configuración de períodos."} Solo lectura.</p>;
 return <form action={action} className="mt-4 space-y-4" onChange={() => { operationId.current = null; }} onSubmit={e => {
  operationId.current ??= crypto.randomUUID(); (e.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value = operationId.current;
 }}>
 <input type="hidden" name="gameId" value={gameId}/><input type="hidden" name="revision" value={data.revision}/><input type="hidden" name="operationId" defaultValue=""/>
 <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
 <label>Nombre del período<select name="type" value={type} onChange={e => setType(e.target.value)} className={inputClass}><option>Ronda</option><option>Semana</option><option>Mes</option><option value="custom">Personalizado</option></select></label>
 {type === "custom" && <label>Nombre personalizado<input name="label" required maxLength={80} defaultValue={data.label ?? ""} className={inputClass}/></label>}
 <label>Cantidad de períodos<input name="count" type="number" min={1} step={1} required defaultValue={data.count ?? ""} className={inputClass}/></label>
 <label>Minutos<input name="minutes" type="number" min={0} step={1} required defaultValue={data.durationSeconds === null ? "" : Math.floor(data.durationSeconds / 60)} className={inputClass}/></label>
 <label>Segundos<input name="seconds" type="number" min={0} max={59} step={1} required defaultValue={data.durationSeconds === null ? 0 : data.durationSeconds % 60} className={inputClass}/></label>
 <button className="rounded-xl bg-sky-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-50" disabled={pending}>{pending ? "Guardando…" : "Guardar períodos"}</button>
 </fieldset>
 <p className="text-sm text-slate-400">Al iniciar la partida se crearán todos los períodos en espera. Guardá los cambios antes de iniciar.</p>
 {state.error && <p role="alert" className="text-red-300">{state.error} <button type="button" className="underline" onClick={() => window.location.reload()}>Recargar datos</button></p>}
 {state.success && <p role="status" className="text-emerald-300">{state.success}</p>}
 </form>;
}
