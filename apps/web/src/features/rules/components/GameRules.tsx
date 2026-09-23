import { getRules } from "../application/rule-actions";
import { RuleForm } from "./RuleForm";
export async function GameRules({gameId}:{gameId:string}){
 const data=await getRules(gameId);if(!data)return null;
 return <section aria-label="Reglas automáticas" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
  <h2 className="text-2xl font-black">Reglas automáticas</h2><p className="mt-2 text-slate-400">Se ejecutan en orden al finalizar cada período, incluido el último.</p>
  {!data.rules.length&&<p className="mt-4">Sin reglas configuradas.</p>}
  <div className="mt-4 space-y-4">{data.rules.map(r=><article key={`${r.id}:${r.revision}`} className="rounded-xl border border-white/10 p-4"><h3 className="font-bold">{r.name} · {r.enabled?"Habilitada":"Deshabilitada"}</h3><p className="text-sm">Orden: {r.position} · Al finalizar cada período</p><p className="whitespace-pre-wrap">{r.description}</p>{r.effects.map(e=>{const k=data.kpis.find(k=>k.id===e.kpiId);return <p key={e.kpiId}>{k?.name}: {e.amount.startsWith("-")?"":"+"}{e.amount} {k?.unit}</p>;})}<p className="mt-2 text-sm text-slate-400">{r.visibility==="display"?"Aviso público":"Solo panel de gestión"}: {r.displayMessage||"Sin mensaje"}</p>
   {data.canEditEffects&&<details><summary className="mt-3 cursor-pointer">Editar efectos</summary><RuleForm data={data} rule={r}/></details>}
   {data.canEdit&&<><details><summary className="mt-3 cursor-pointer">Editar / activar o desactivar</summary><RuleForm data={data} rule={r}/></details><details><summary className="mt-3 cursor-pointer text-red-300">Eliminar</summary><RuleForm data={data} rule={r} remove/></details></>}
  </article>)}</div>
  {data.canEdit&&<details key={data.rules.map(r=>`${r.id}:${r.revision}`).join(",")} className="mt-4"><summary className="cursor-pointer font-bold">Agregar regla</summary><RuleForm data={data}/></details>}
  {!!data.executions.length&&<div className="mt-6 space-y-3"><h3 className="text-xl font-bold">Ejecuciones de reglas</h3>{data.executions.map(e=><article key={e.id} className="rounded-xl border border-white/10 p-4"><h4 className="font-bold">{data.periodLabel} {e.sequence} · {e.name}</h4><p className="text-sm text-slate-400">Automático / Regla · {e.reason==="timer"?"Vencimiento del período":"Cierre manual"}</p><p className="whitespace-pre-wrap">{e.message}</p>{e.effects.map(v=><p key={v.id}>{v.name}: {v.before} → {v.after} {v.unit} ({v.amount.startsWith("-")?"":"+"}{v.amount})</p>)}</article>)}</div>}
 </section>;
}
