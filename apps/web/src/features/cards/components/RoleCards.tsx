import { CardStructureView } from "./CardStructureView";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCards } from "../application/card-actions";
import { selectedResponsibilities, type CardScope, type CardView } from "../domain/card";
import { AddCardForm, CardForm } from "./CardForm";

export async function RoleCards({ scope }: { scope: CardScope }) {
  const result = await getCards(scope);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const { data } = result;
  return <section id="fichas" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
    <h2 className="text-2xl font-black">{scope.kind === "campaign" ? "Fichas de campaña" : "Fichas de esta partida"}</h2>
    <p className="mt-2 text-sm text-slate-400">{scope.kind === "campaign" ? "Bases de roles y departamentos. Cada partida conserva su propia copia." : "Configuración de roles independiente de las metas generales de la partida. Después del inicio queda en consulta."}</p>
    {scope.kind === "game" && <Link className="mt-3 inline-block text-sm text-sky-300" href={`/master/campanas/${data.campaignId}#fichas`}>Ver catálogo de fichas de campaña</Link>}
    {!data.cards.length && <p className="mt-5 text-slate-400">Todavía no hay fichas configuradas. La partida puede funcionar sin fichas.</p>}
    <div className="mt-5 grid gap-4 lg:grid-cols-2">{data.cards.map(raw => {
      const card: CardView = raw;
      return <article key={card.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-5">
        <h3 className="break-words text-xl font-bold">{card.visualIdentity} {card.name}</h3><p className="mt-1 text-sm text-sky-300">{card.department}</p>
        <dl className="mt-4 space-y-3">{([
          ["Descripción", card.description],  ["Información pública", card.publicInformation],
          
          ...(data.canReadPrivate ? [["Información privada · Solo Master", card.privateInformation]] : []),
        ]).map(([label, value]) => value ? <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{value}</dd></div> : null)}</dl>
        <h4 className="mt-4 text-sm font-bold text-sky-300">Responsabilidades</h4>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{selectedResponsibilities(card).map(label => <li key={label} className="whitespace-pre-wrap break-words">{label}</li>)}</ul>
        <CardStructureView card={card} />
        <section className="mt-4"><h4 className="font-bold">Objetivos</h4><p className="mt-2 text-xs text-slate-400">Objetivo público</p><p className="whitespace-pre-wrap text-sm">{card.individualObjective || "Sin configurar."}</p>{data.canReadPrivate&&<><p className="mt-2 text-xs text-slate-400">Objetivo secreto · Solo Master</p><p className="whitespace-pre-wrap text-sm">{card.secretObjective || "Sin configurar."}</p></>}</section>
        {data.canEdit && <details className="mt-4"><summary className="cursor-pointer text-sky-300">Editar ficha</summary><CardForm key={`${card.id}:${card.revision}`} scope={scope} card={card} catalogue={data.responsibilityCatalogue} modifierCatalogue={data.modifierCatalogue} /></details>}
      </article>;
    })}</div>
    {data.canEdit && scope.kind === "campaign" && <details className="mt-6"><summary className="cursor-pointer font-bold text-sky-300">Crear ficha base</summary><p className="mt-3 text-sm text-slate-400">Ejemplos: Dirección 🦉 · Comercial 🦊 · Ingeniería 🦫 · Producción 🐂 · Finanzas 🐿️. Podés definir otros roles.</p><CardForm scope={scope} catalogue={data.responsibilityCatalogue} modifierCatalogue={data.modifierCatalogue} /></details>}
    {data.canEdit && scope.kind === "game" && data.available.length > 0 && <AddCardForm gameId={scope.id} available={data.available} />}
  </section>;
}
