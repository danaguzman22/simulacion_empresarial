"use client";
import { useActionState,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { publishSituationAction,type SituationActionState } from "../application/situation-actions";
import type { readSituations } from "../repositories/situation.repository";
type Data=Awaited<ReturnType<typeof readSituations>>;
const field="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2";
export function SituationForm({gameId,data}:{gameId:string;data:Data}){
  const router=useRouter(),busy=useRef(false),operationId=useRef<string|null>(null),nextRow=useRef(0);
  const [rows,setRows]=useState<number[]>([]);
  const [state,action,pending]=useActionState(async(previous:SituationActionState,form:FormData)=>{
    try{return await publishSituationAction(previous,form);}finally{busy.current=false;}
  },{});
  return <form action={action} className="mt-4 space-y-4" onChange={()=>{if(!busy.current)operationId.current=null;}} onSubmit={event=>{
    if(busy.current||pending){event.preventDefault();return;}
    busy.current=true;operationId.current??=crypto.randomUUID();
    (event.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value=operationId.current;
  }}>
    <input type="hidden" name="gameId" value={gameId}/><input type="hidden" name="revision" value={data.revision}/><input type="hidden" name="operationId" defaultValue=""/>
    <fieldset disabled={pending} className="space-y-4">
      <label className="block">Título<input name="title" required maxLength={160} className={field}/></label>
      <label className="block">Descripción<textarea name="description" maxLength={5000} className={field}/></label>
      <h3 className="font-bold">Efectos</h3>
      {!rows.length&&<p className="text-slate-400">Aviso informativo, sin efectos sobre indicadores.</p>}
      {rows.map(row=><div key={row} className="grid gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-3">
        <label>KPI<select name="kpiId" required defaultValue="" className={field}><option value="">Seleccionar indicador</option>{data.kpis.map(k=><option key={k.id} value={k.id}>{k.name} ({k.unit})</option>)}</select></label>
        <label>Sumar / restar<input name="amount" required maxLength={64} inputMode="decimal" placeholder="Ej.: +100000 o -5000" className={field}/></label>
        <button type="button" onClick={()=>{operationId.current=null;setRows(old=>old.filter(id=>id!==row));}} className="underline">Quitar efecto</button>
      </div>)}
      <p className="text-sm text-slate-400">Usá coma o punto decimal, sin separadores de miles. Cada indicador puede aparecer una sola vez.</p>
      <button type="button" disabled={!data.kpis.length||rows.length>=data.kpis.length} onClick={()=>{operationId.current=null;setRows(old=>[...old,nextRow.current++]);}} className="mr-4 underline disabled:opacity-50">+ Agregar efecto</button>
      <button disabled={pending} className="rounded-xl bg-sky-200 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending?"Publicando...":"Publicar situación"}</button>
    </fieldset>
    {state.error&&<p role="alert" className="text-red-300">{state.error} <button type="button" onClick={()=>router.refresh()} className="underline">Actualizar datos</button></p>}
    {state.success&&<p role="status" className="text-emerald-300">{state.success}</p>}
  </form>;
}
