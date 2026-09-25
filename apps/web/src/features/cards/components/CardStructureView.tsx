import { type CardView } from "../domain/card";
import { abilityTypes, effectiveModifiers } from "../domain/card-structure";
export function CardStructureView({ card, privateAudience = "Solo Master" }: { card: CardView; privateAudience?: "Solo Master" | "Equipo" }) {
  const modifiers=effectiveModifiers(card);
  return <div className="mt-4 space-y-3">
    <section><h4 className="text-sm font-bold text-sky-300">Modificadores</h4>{!modifiers.length?<p className="text-sm text-slate-400">Sin modificadores seleccionados.</p>:<dl className="mt-2 grid grid-cols-2 gap-2 text-sm">{modifiers.map(m=><div key={m.key}><dt>{m.abbreviation} — {m.name}</dt><dd className="font-bold">{m.value>0?`+${m.value}`:m.value}</dd></div>)}</dl>}</section>
    <details><summary className="cursor-pointer font-semibold">Habilidades ({card.abilities.length})</summary>{card.abilities.map((a,i)=><article key={i} className="mt-3 space-y-1 rounded-xl bg-white/5 p-3 text-sm"><h5 className="font-bold">{a.name} · {abilityTypes[a.type]}</h5><p className="whitespace-pre-wrap">{a.description}</p>{a.condition&&<p>Condición: {a.condition}</p>}<p>{a.useLimit===null?'Sin límite configurado':`${a.useLimit} ${a.useLimit===1?'uso':'usos'} por ${a.useScope==='round'?'ronda':'partida'}`}</p></article>)}</details>
    <details><summary className="cursor-pointer font-semibold">Debilidades ({card.weaknesses.length})</summary>{card.weaknesses.map((w,i)=><article key={i} className="mt-3 space-y-1 rounded-xl bg-white/5 p-3 text-sm"><h5 className="font-bold">{w.name}</h5><p className="whitespace-pre-wrap">{w.description}</p>{w.condition&&<p>Condición: {w.condition}</p>}<p>Consecuencia: {w.consequence}</p></article>)}</details>
    <details><summary className="cursor-pointer font-semibold">Restricciones ({card.restrictions.length})</summary>{card.restrictions.map((r,i)=><article key={i} className="mt-3 space-y-1 rounded-xl bg-white/5 p-3 text-sm"><h5 className="font-bold">{r.name} · {r.visibility==='private'?`Privada · ${privateAudience}`:'Pública'}</h5><p className="whitespace-pre-wrap">{r.description}</p>{r.condition&&<p>Condición / excepción: {r.condition}</p>}</article>)}</details>
  </div>;
}
