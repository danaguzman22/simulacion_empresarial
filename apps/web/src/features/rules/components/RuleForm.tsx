"use client";
import { useActionState,useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { ruleAction,type RuleActionState } from "../application/rule-actions";
import type { readRules } from "../repositories/rule.repository";
type Data=Awaited<ReturnType<typeof readRules>>;
const field="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2";
export function RuleForm({data,rule,remove=false}:{data:Data;rule?:Data["rules"][number];remove?:boolean}){
 const router=useRouter(),busy=useRef(false),id=useRef<string|null>(rule?.id??null),nextRow=useRef(rule?.effects.length??0);
 const [effects,setEffects]=useState((rule?.effects??[]).map((e,i)=>({...e,key:i})));
 const [state,action,pending]=useActionState(async(previous:RuleActionState,form:FormData)=>{try{return await ruleAction(previous,form);}finally{busy.current=false;}},{});
 return <form action={action} className="mt-4 space-y-3" onChange={()=>{if(!busy.current&&!rule)id.current=null;}} onSubmit={e=>{
  if(busy.current||pending){e.preventDefault();return;}busy.current=true;id.current??=crypto.randomUUID();(e.currentTarget.elements.namedItem("ruleId") as HTMLInputElement).value=id.current;
 }}>
  <input type="hidden" name="gameId" value={data.gameId}/><input type="hidden" name="ruleId" defaultValue={rule?.id??""}/><input type="hidden" name="operation" value={remove?"delete":rule?"update":"create"}/>{rule&&<input type="hidden" name="revision" value={rule.revision}/>}
  <fieldset disabled={pending} className="space-y-3">
   {remove?<label className="flex gap-2"><input type="checkbox" name="confirmed" required/>Confirmo eliminar esta regla.</label>:<>
    <label className="block">Nombre<input name="name" required maxLength={160} defaultValue={rule?.name} className={field}/></label>
    <label className="block">Descripción<textarea name="description" maxLength={5000} defaultValue={rule?.description??""} className={field}/></label>
    <label className="block">Momento<select name="triggerType" className={field}><option value="round_end">Al finalizar cada período</option></select></label>
    <label className="block">Orden de aplicación<input name="position" type="number" min={0} max={2147483647} required defaultValue={rule?.position??data.rules.length} className={field}/></label>
    <label className="block">Mensaje público<textarea name="displayMessage" maxLength={5000} defaultValue={rule?.displayMessage??""} className={field}/></label>
    <label className="flex gap-2"><input type="checkbox" name="visible" defaultChecked={!rule||rule.visibility==="display"}/>Visible en Display</label>
    <label className="flex gap-2"><input type="checkbox" name="enabled" defaultChecked={rule?.enabled??true}/>Habilitada</label>
    <h4 className="font-bold">Efectos</h4>
    {effects.map(e=><div key={e.key} className="grid gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-3"><label>KPI<select name="kpiId" required defaultValue={e.kpiId} className={field}><option value="">Seleccionar indicador</option>{data.kpis.map(k=><option key={k.id} value={k.id}>{k.name} ({k.unit})</option>)}</select></label><label>Cambio<input name="amount" required maxLength={64} inputMode="decimal" defaultValue={e.amount} placeholder="Ej.: -5000" className={field}/></label><button type="button" className="underline" onClick={()=>{if(!rule)id.current=null;setEffects(old=>old.filter(v=>v.key!==e.key));}}>Quitar efecto</button></div>)}
    <button type="button" disabled={!data.kpis.length||effects.length>=data.kpis.length} className="underline disabled:opacity-50" onClick={()=>{if(!rule)id.current=null;const key=nextRow.current++;setEffects(old=>[...old,{key,kpiId:"",amount:""}]);}}>+ Agregar efecto</button>
    <p className="text-sm text-slate-400">Sumas o restas, sin separadores de miles. No se aplican ahora: se ejecutan al cerrar cada período.</p>
   </>}
   <button disabled={pending} className="rounded-xl bg-sky-200 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending?"Guardando...":remove?"Eliminar regla":"Guardar regla"}</button>
  </fieldset>
  {state.error&&<p role="alert" className="text-red-300">{state.error} <button type="button" className="underline" onClick={()=>router.refresh()}>Actualizar datos</button></p>}{state.success&&<p role="status" className="text-emerald-300">{state.success}</p>}
 </form>;
}
