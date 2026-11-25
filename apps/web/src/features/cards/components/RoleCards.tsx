import { RevealConfigurationForm } from "@/features/secrets/components/RevealConfigurationForm";
import { CardStructureView } from "./CardStructureView";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCards } from "../application/card-actions";
import { selectedResponsibilities, type CardScope, type CardView } from "../domain/card";
import { AddCardForm } from "./CardForm";

// Where a card is created or edited (#78): its own screen, inside the campaign or the game.
export const cardEditHref = (scope: CardScope, campaignId: string, cardId?: string) =>
  `${scope.kind === "campaign" ? `/master/campanas/${campaignId}` : `/master/partidas/${scope.id}`}/fichas/${cardId ?? "nueva"}`;

export async function RoleCards({ scope }: { scope: CardScope }) {
  const result = await getCards(scope);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const { data } = result;
  return <section id="fichas" className="mt-8 rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-black">{scope.kind === "campaign" ? "Fichas base" : "Fichas de esta partida"}</h2>
      {data.canEdit && scope.kind === "campaign" && <Link href={cardEditHref(scope, data.campaignId)} className="rounded-xl bg-sky-400 px-4 py-2 font-bold text-slate-950 hover:bg-sky-300">Nueva ficha</Link>}
    </div>
    <p className="mt-2 text-sm text-slate-400">{scope.kind === "campaign" ? "Bases de roles y departamentos. Cada partida conserva su propia copia." : "Configuración de roles independiente de las metas generales de la partida. Después del inicio queda en consulta."}</p>
    {scope.kind === "game" && <Link className="mt-3 inline-block text-sm text-sky-300" href={`/master/campanas/${data.campaignId}/fichas`}>Ver catálogo de fichas de campaña</Link>}
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
        {scope.kind === "game" && <section className="mt-4"><h4 className="font-bold">Revelaciones del objetivo secreto</h4><p className="text-sm text-slate-400">{card.secretRevealLimit == null ? "Sin configurar para esta partida." : `${card.secretRevealLimit} usos compartidos por departamento, de ${card.secretRevealSeconds} segundos.`}</p>{data.canEdit && <RevealConfigurationForm key={`${card.id}:${card.revision}:reveals`} gameId={scope.id} card={card} />}</section>}
        {data.canEdit && <Link href={cardEditHref(scope, data.campaignId, card.id)} className="mt-4 inline-block rounded-xl border border-sky-400 px-4 py-2 text-sm font-bold text-sky-300 hover:bg-sky-400/10">Editar ficha</Link>}
      </article>;
    })}</div>
    {data.canEdit && scope.kind === "game" && data.available.length > 0 && <AddCardForm gameId={scope.id} available={data.available} />}
  </section>;
}
