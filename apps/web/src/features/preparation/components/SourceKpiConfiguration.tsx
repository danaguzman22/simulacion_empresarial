"use client";
import { useActionState,useRef,useState } from "react";
import { configureSourceKpiAction } from "../application/configure-source-kpi";
import type { PreparationData } from "./PreparationForm";
type Source=PreparationData["predecessor"][number];
const field="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2";
function SourceForm({gameId,data,kpi}:{gameId:string;data:PreparationData;kpi:Source}){
 const [state,action,pending]=useActionState(configureSourceKpiAction,{}),operationId=useRef<string|null>(null);
 const [included,setIncluded]=useState(kpi.included),[origin,setOrigin]=useState(kpi.origin);
 const finalValue=kpi.value??kpi.ordinalKey;
 const shown=kpi.valueType==="ordinal"?kpi.ordinalOptions.find(o=>o.key===finalValue)?.label??"Sin configurar":finalValue===null?"Sin configurar":`${finalValue} ${kpi.unit}`;
 return <form action={action} className="rounded-xl border border-white/10 p-4 space-y-3" onChange={()=>{operationId.current=null;}} onSubmit={event=>{operationId.current??=crypto.randomUUID();(event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value=operationId.current;}}>
  <h4 className="font-bold">{kpi.name}</h4><p>Final anterior: {shown}</p>
  <input type="hidden" name="gameId" value={gameId}/><input type="hidden" name="kpiId" value={kpi.id}/><input type="hidden" name="operationId" defaultValue=""/><input type="hidden" name="revision" value={data.revision}/><input type="hidden" name="catalogToken" value={data.catalogToken}/>
  <fieldset disabled={pending||!data.canEdit} className="space-y-3">
   <label className="flex gap-2"><input type="checkbox" name="included" checked={included} onChange={e=>{setIncluded(e.target.checked);if(!kpi.included)setOrigin("inherited");}}/>Incluir en esta partida</label>
   <input type="hidden" name="origin" value={origin}/>
   {included && <>
    <p className="text-sm text-sky-300">{origin==="inherited"?"Heredado":"Redefinido"}</p>
    {kpi.included ? <><label className="flex gap-2"><input type="radio" checked={origin==="inherited"} onChange={()=>setOrigin("inherited")}/>Heredar valor anterior</label><label className="flex gap-2"><input type="radio" checked={origin==="redefined"} onChange={()=>setOrigin("redefined")}/>Definir otro valor</label></> : <p className="text-sm">Se reincorporará con el valor anterior. Después podés redefinirlo.</p>}
    {origin==="inherited"?<p>Valor inicial: {shown}</p>:<label className="block">Nuevo valor inicial{kpi.valueType==="ordinal"?<select name="value" defaultValue={data.values.find(v=>v.kpiId===kpi.id)?.value??""} className={field}><option value="">Sin configurar</option>{kpi.ordinalOptions.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select>:<input name="value" inputMode="decimal" maxLength={64} defaultValue={data.values.find(v=>v.kpiId===kpi.id)?.value??""} className={field}/>}</label>}
   </>}
   {data.canEdit&&<button disabled={pending} className="rounded-xl bg-sky-200 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending?"Guardando...":"Guardar configuración"}</button>}
  </fieldset>
  {state.error&&<p role="alert" className="text-red-300">{state.error} <button type="button" onClick={()=>window.location.reload()} className="underline">Recargar datos</button></p>}{state.success&&<p role="status" className="text-emerald-300">{state.success}</p>}
 </form>;
}
export function SourceKpiConfiguration({gameId,data}:{gameId:string;data:PreparationData}){
 if(!data.predecessor.length)return null;
 return <section className="mt-5 space-y-4" aria-label="KPIs de la partida anterior"><h3 className="text-xl font-bold">KPIs de la partida anterior</h3>{data.predecessor.map(kpi=><SourceForm key={`${kpi.id}:${data.revision}:${data.catalogToken}`} gameId={gameId} data={data} kpi={kpi}/>)}</section>;
}
