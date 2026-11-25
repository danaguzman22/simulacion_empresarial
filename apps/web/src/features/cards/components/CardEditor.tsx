import { notFound, redirect } from "next/navigation";
import { getCards } from "../application/card-actions";
import type { CardScope, CardView } from "../domain/card";
import { CardForm } from "./CardForm";

// #78: loads what the card screen needs with the same permission checks as the list (readCards). Only whoever can
// edit cards gets the form; a card id that is not in this campaign or game is "not found".
export async function loadCardEditor(scope: CardScope, cardId: string | null) {
  const result = await getCards(scope);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found" || !result.data.canEdit) notFound();
  const card: CardView | undefined = cardId ? result.data.cards.find(c => c.id === cardId) : undefined;
  if (cardId && !card) notFound();
  return { data: result.data, card };
}

export function CardEditor({ scope, data, card, doneHref }: Awaited<ReturnType<typeof loadCardEditor>> & { scope: CardScope; doneHref: string }) {
  return <section className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 md:p-8">
    {!card && scope.kind === "campaign" && <p className="mb-4 text-sm text-slate-400">Ejemplos: Dirección 🦉 · Comercial 🦊 · Ingeniería 🦫 · Producción 🐂 · Finanzas 🐿️. Podés definir otros roles.</p>}
    <CardForm key={card ? `${card.id}:${card.revision}` : "new"} scope={scope} card={card} catalogue={data.responsibilityCatalogue} modifierCatalogue={data.modifierCatalogue} doneHref={doneHref} />
  </section>;
}
