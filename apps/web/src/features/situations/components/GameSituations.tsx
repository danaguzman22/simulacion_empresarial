import { getSituations } from "../application/situation-actions";
import { SituationForm } from "./SituationForm";

function decimal(value:string){
  const [whole,fraction]=value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,".")+(fraction?","+fraction:"");
}
export async function GameSituations({gameId}:{gameId:string}){
  const data=await getSituations(gameId);if(!data)return null;
  return <section aria-label="Situaciones" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
    <h2 className="text-2xl font-black">Situaciones</h2>
    {data.canPublish&&<details key={`${data.revision}:${data.situations.length}`} className="mt-4"><summary className="cursor-pointer font-bold">Publicar situación</summary><SituationForm gameId={gameId} data={data}/></details>}
    {!data.situations.length&&<p className="mt-4 text-slate-400">Todavía no hay situaciones publicadas.</p>}
    <div className="mt-4 space-y-4">{data.situations.map(s=><article key={s.id} className="rounded-xl border border-white/10 p-4">
      <h3 className="text-lg font-bold">{s.title}</h3>
      <p className="text-sm text-slate-400">{data.periodLabel} {s.sequence} · <time dateTime={s.publishedAt}>{new Date(s.publishedAt).toLocaleString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"})}</time> · {s.author}</p>
      <p className="mt-3 whitespace-pre-wrap break-words">{s.description}</p>
      {!s.effects.length?<p className="mt-3 text-slate-400">Sin efectos sobre indicadores.</p>:<ul className="mt-3 space-y-2">{s.effects.map(e=><li key={e.id}><strong>{e.name}</strong>: {decimal(e.before)} → {decimal(e.after)} {e.unit} ({e.amount.startsWith("-")?"":"+"}{decimal(e.amount)} {e.unit})</li>)}</ul>}
    </article>)}</div>
  </section>;
}
