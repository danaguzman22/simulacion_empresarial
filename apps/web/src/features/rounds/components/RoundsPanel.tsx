"use client";
import { useRouter } from "next/navigation";
import { useActionState,useEffect,useRef,useState,type ReactNode } from "react";
import { getRounds,roundAction } from "../application/round-actions";
import { remainingMilliseconds,roundLabels } from "../domain/round";
type Data=Awaited<ReturnType<typeof getRounds>>;
function Action({gameId,round,operation,label,confirmText,remainingText,children}:{gameId:string;round?:Data["rounds"][number];operation:string;label:string;confirmText?:string;remainingText?:string;children?:ReactNode}){
 const [state,action,pending]=useActionState(roundAction,{});const operationId=useRef<string|null>(null);
 return <form action={action} className="mt-3 space-y-2" onChange={()=>{operationId.current=null;}} onSubmit={e=>{if(operation==="finish"&&!window.confirm(`¿Finalizar ${confirmText}? Quedan ${remainingText} y este tiempo se descartará.`)){e.preventDefault();return;}operationId.current??=crypto.randomUUID();(e.currentTarget.elements.namedItem("operationId") as HTMLInputElement).value=operationId.current;}}>
 <input type="hidden" name="gameId" value={gameId}/><input type="hidden" name="roundId" value={round?.id??""}/><input type="hidden" name="revision" value={round?.revision??0}/><input type="hidden" name="operation" value={operation}/><input type="hidden" name="operationId" defaultValue=""/>
 <fieldset disabled={pending} className="space-y-2">{children}<button disabled={pending} className="rounded-xl bg-sky-300 px-4 py-2 font-bold text-slate-950 disabled:opacity-50">{pending?"Guardando…":label}</button></fieldset>
 {state.error&&<p role="alert" className="text-sm text-red-300">{state.error}</p>}{state.success&&<p role="status" className="text-sm text-emerald-300">{state.success}</p>}
 </form>;
}
export function RoundsPanel({gameId,initial}:{gameId:string;initial:Data}){
 const router=useRouter();const gameStatus=useRef(initial.gameStatus);
 const [data,setData]=useState(initial),[now,setNow]=useState(Date.parse(initial.serverNow)),[error,setError]=useState(false);
 const allPeriodsCompleted=(data.gameStatus==="active"||data.gameStatus==="evaluation")&&data.rounds.length>0&&data.rounds.every(round=>round.status==="completed");
 const clock=useRef({server:Date.parse(initial.serverNow),client:0});
 useEffect(()=>{let stopped=false,busy=false;clock.current.client=performance.now();
 const refresh=async()=>{if(busy)return;busy=true;const sent=performance.now();try{const next=await getRounds(gameId);if(!stopped){const received=performance.now();clock.current={server:Date.parse(next.serverNow)+(received-sent)/2,client:received};setNow(clock.current.server);setData(next);setError(false);if(gameStatus.current!==next.gameStatus){gameStatus.current=next.gameStatus;router.refresh();}}}catch{if(!stopped)setError(true);}finally{busy=false;}};
 void refresh();const poll=setInterval(()=>{void refresh();},3000);const tick=setInterval(()=>setNow(clock.current.server+performance.now()-clock.current.client),1000);const visible=()=>{if(document.visibilityState==="visible")void refresh();};document.addEventListener("visibilitychange",visible);
 return()=>{stopped=true;clearInterval(poll);clearInterval(tick);document.removeEventListener("visibilitychange",visible);};
 },[gameId,router]);
 return <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6" aria-labelledby="rounds-title"><h2 id="rounds-title" className="text-2xl font-black">Períodos</h2>
 {error&&<p role="alert" className="mt-3 text-amber-300">No se pudo sincronizar. El reloj sigue calculándose desde el último dato del servidor; las acciones se validarán nuevamente.</p>}
 <div className="mt-4 space-y-4">{data.rounds.map(r=>{const expired=r.status==="active"&&remainingMilliseconds(r,now)<=0;const seconds=Math.ceil(remainingMilliseconds(r,now)/1000);const earlierDone=data.rounds.filter(x=>x.sequence<r.sequence).every(x=>x.status==="completed");const otherBusy=data.rounds.some(x=>x.id!==r.id&&(x.status==="active"||x.status==="paused"));return <article key={r.id} className="rounded-2xl border border-white/10 p-5">
 <h3 className="text-xl font-bold">{data.periodLabel} {r.sequence}</h3><p>{expired?"Finalizada (sincronizando)":roundLabels[r.status]}</p><p className="text-sm text-slate-400">Duración: {String(Math.floor(r.durationSeconds/60)).padStart(2,"0")}:{String(r.durationSeconds%60).padStart(2,"0")}</p>
 {(r.status==="active"||r.status==="paused")&&<p className="my-3 font-mono text-4xl tabular-nums" aria-label="Tiempo restante">{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</p>}
 {r.completedAt&&<p className="text-sm text-slate-400">Finalizada: <time dateTime={r.completedAt}>{new Date(r.completedAt).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"})}</time></p>}
 {data.canManage&&<div key={r.revision}>{r.status==="pending"&&<>{earlierDone&&!otherBusy?<Action gameId={gameId} round={r} operation="start" label={`Iniciar ${data.periodLabel} ${r.sequence}`}/>:<p className="mt-3 text-sm text-slate-400">Esperando que finalicen las rondas anteriores y quede libre la ejecución.</p>}</>}
 {r.status==="active"&&!expired&&<Action gameId={gameId} round={r} operation="pause" label="Pausar"/>}{r.status==="paused"&&<Action gameId={gameId} round={r} operation="resume" label="Reanudar"/>}{(r.status==="active"&&!expired||r.status==="paused")&&<Action gameId={gameId} round={r} operation="finish" label={`Finalizar ${data.periodLabel}`} confirmText={`${data.periodLabel} ${r.sequence}`} remainingText={`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`}/>}</div>}
 </article>;})}</div>
 {allPeriodsCompleted&&<div className="mt-5 rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-5" role="status">
 <h3 className="text-xl font-black text-emerald-200">Simulación finalizada</h3>
 <p className="mt-2 text-slate-200">Todos los períodos finalizaron.</p>
 <p className="text-slate-300">La partida está pendiente de evaluación final por el Master.</p>
 <p className="mt-4 font-bold text-sky-200">Evaluación final — próximamente</p>
 </div>}
 {!allPeriodsCompleted&&<p className="mt-4 text-sm text-slate-400">Los períodos nunca comienzan automáticamente. {data.canManage?"Iniciá cada uno cuando corresponda.":"Solo lectura."}</p>}
 </section>;
}
