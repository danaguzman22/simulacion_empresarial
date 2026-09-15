"use client";
import { useActionState, useRef, useState } from "react";
import { goalAction, type GoalActionState } from "../application/goal-actions";
import { operators } from "../domain/goal";
import type { readGoals } from "../repositories/goal.repository";
type Data = Awaited<ReturnType<typeof readGoals>>;
type Goal = Data["goals"][number];
const field = "w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2";
export function GoalForm({data,goal,operation}:{data:Data;goal?:Goal;operation:"create"|"update"|"delete"|"evaluate"}) {
  const busy = useRef(false), operationId = useRef<string | null>(null);
  const [state,action,pending] = useActionState(async(previous:GoalActionState,form:FormData) => {
    try { return await goalAction(previous,form); } finally { busy.current=false; }
  },{});
  const [type,setType] = useState(goal?.goalType ?? "generic");
  const [kpiId,setKpiId] = useState(goal?.kpiDefinitionId ?? data.definitions[0]?.id ?? "");
  const kpi = data.definitions.find(k => k.id === kpiId);
  return <form action={action} className="mt-4 space-y-3" onChange={() => { if(!busy.current) operationId.current=null; }} onSubmit={event => {
    if(busy.current || pending) {event.preventDefault();return;}
    busy.current=true;operationId.current ??= crypto.randomUUID();
    (event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value=operationId.current;
  }}>
    <input type="hidden" name="gameId" value={data.gameId}/><input type="hidden" name="operation" value={operation}/><input type="hidden" name="operationId" defaultValue=""/>
    {goal && <><input type="hidden" name="goalId" value={goal.id}/><input type="hidden" name="revision" value={goal.revision}/></>}
    <fieldset disabled={pending} className="space-y-3">
      {(operation === "create" || operation === "update") && <>
        <label className="block">Título *<input name="title" required maxLength={160} defaultValue={goal?.title} className={field}/></label>
        <label className="block">Descripción<textarea name="description" maxLength={4000} defaultValue={goal?.description ?? ""} className={field}/></label>
        <label className="block">Tipo<select name="goalType" value={type} onChange={e=>setType(e.target.value)} className={field}><option value="generic">Genérica</option><option value="kpi" disabled={!data.definitions.length}>Vinculada a KPI</option></select></label>
        {type === "kpi" && <>
          <label className="block">KPI<select name="kpiDefinitionId" value={kpiId} onChange={e=>setKpiId(e.target.value)} required className={field}>{data.definitions.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
          <input type="hidden" name="valueType" value={kpi?.valueType ?? ""}/>
          {kpi?.valueType === "ordinal" ? <label className="block">Nivel objetivo<select key={kpiId} name="target" required defaultValue={goal?.ordinalTargetKey ?? ""} className={field}><option value="">Seleccionar nivel...</option>{kpi.ordinalOptions.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select></label> : <>
            <label className="block">Operador<select name="operator" defaultValue={goal?.operator ?? ">="} className={field}>{operators.map(op=><option key={op}>{op}</option>)}</select></label>
            <label className="block">Valor objetivo {kpi?.unit}<input key={kpiId} name="target" inputMode="decimal" required maxLength={40} defaultValue={goal?.numericTarget ?? ""} className={field}/></label>
          </>}
        </>}
      </>}
      {operation === "delete" && <label className="flex gap-2"><input type="checkbox" name="confirmed" required/>Confirmo eliminar esta meta de la partida.</label>}
      {operation === "evaluate" && <>
        <label className="block">Evaluación del Master<select name="fulfilled" defaultValue={goal?.fulfilled === null ? "" : String(goal?.fulfilled)} required className={field}><option value="">Seleccionar...</option><option value="true">Cumplida</option><option value="false">No cumplida</option></select></label>
        <label className="block">Observación<textarea name="observation" maxLength={4000} defaultValue={goal?.observation ?? ""} className={field}/></label>
      </>}
      <button disabled={pending} className="rounded-xl bg-sky-200 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending ? "Guardando..." : operation === "delete" ? "Eliminar meta" : operation === "evaluate" ? "Guardar evaluación" : "Guardar meta"}</button>
    </fieldset>
    {state.error && <p role="alert" className="text-red-300">{state.error} <button type="button" className="underline" onClick={()=>window.location.reload()}>Recargar datos</button></p>}
    {state.success && <p role="status" className="text-emerald-300">{state.success}</p>}
  </form>;
}
