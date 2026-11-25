import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCards } from "../application/card-actions";
import type { CardScope, CardView } from "../domain/card";
import { AddCardForm } from "./CardForm";
import { RoleCardView } from "./RoleCardView";

// Where a card is seen and edited (#78, #106): its own screens, inside the campaign or the game.
export const cardHref = (scope: CardScope, campaignId: string, cardId?: string) =>
  `${scope.kind === "campaign" ? `/master/campanas/${campaignId}` : `/master/partidas/${scope.id}`}/fichas/${cardId ?? "nueva"}`;
export const cardEditHref = (scope: CardScope, campaignId: string, cardId?: string) =>
  cardId ? `${cardHref(scope, campaignId, cardId)}/editar` : cardHref(scope, campaignId);

// #106: the Fichas tab of the campaign and the game, as a grid of cards. Clicking a card opens it (view); "Editar"
// opens the #78 screen with sections. Each card only carries what readCards lets this person see.
export async function RoleCards({ scope }: { scope: CardScope }) {
  const result = await getCards(scope);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const { data } = result;
  return <section id="fichas" className="mt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-black">{scope.kind === "campaign" ? "Fichas base" : "Fichas de esta partida"}</h2>
      {data.canEdit && scope.kind === "campaign" && <Link href={cardEditHref(scope, data.campaignId)} className="rounded-xl bg-sky-400 px-4 py-2 font-bold text-slate-950 hover:bg-sky-300">Nueva ficha</Link>}
    </div>
    <p className="mt-2 text-sm text-slate-400">{scope.kind === "campaign" ? "Bases de roles y departamentos. Cada partida conserva su propia copia." : "Configuración de roles independiente de las metas generales de la partida. Después del inicio queda en consulta."}</p>
    {scope.kind === "game" && <Link className="mt-3 inline-block text-sm text-sky-300" href={`/master/campanas/${data.campaignId}/fichas`}>Ver catálogo de fichas de campaña</Link>}
    {!data.cards.length && <p className="mt-5 text-slate-400">Todavía no hay fichas configuradas. La partida puede funcionar sin fichas.</p>}
    <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.cards.map(raw => {
      const card: CardView = raw;
      const view = cardHref(scope, data.campaignId, card.id);
      return <div key={card.id} className="relative">
        <RoleCardView card={card} actions={<>
          <Link href={view} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10">Ver</Link>
          {data.canEdit && <Link href={cardEditHref(scope, data.campaignId, card.id)} className="rounded-lg border border-sky-400 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-400/10">Editar ficha</Link>}
        </>} />
        {/* The whole card opens it; the buttons stay clickable above this layer. */}
        <Link href={view} aria-label={`Ver ${card.name}`} className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-sky-400" />
      </div>;
    })}</div>
    {data.canEdit && scope.kind === "game" && data.available.length > 0 && <AddCardForm gameId={scope.id} available={data.available} />}
  </section>;
}
