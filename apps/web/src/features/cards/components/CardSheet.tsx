import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RevealConfigurationForm } from "@/features/secrets/components/RevealConfigurationForm";
import { getCards } from "../application/card-actions";
import { selectedResponsibilities, type CardScope, type CardView } from "../domain/card";
import { RoleCardView } from "./RoleCardView";
import { SecretCover } from "./SecretCover";

// #106: a card in view mode. Same read as the list (readCards): every staff role can open it, and it only shows
// what that role receives (private information and the secret objective only reach the Master).
export async function loadCardView(scope: CardScope, cardId: string) {
  const result = await getCards(scope);
  if (result.status === "unauthenticated") redirect("/login/master");
  if (result.status === "not-found") notFound();
  const card: CardView | undefined = result.data.cards.find(c => c.id === cardId);
  if (!card) notFound();
  return { data: result.data, card };
}

export function CardSheet({ scope, data, card, editHref }: Awaited<ReturnType<typeof loadCardView>> & { scope: CardScope; editHref: string }) {
  const details: [string, string | undefined][] = [
    ["Descripción", card.description], ["Información pública", card.publicInformation],
    ...(data.canReadPrivate ? [["Información privada · Solo Master", card.privateInformation] as [string, string | undefined]] : []),
  ];
  return <div className="grid gap-6 md:grid-cols-[22rem_1fr]">
    <RoleCardView card={card} secret={card.secretObjective ? <SecretCover text={card.secretObjective} /> : null}
      actions={data.canEdit ? <Link href={editHref} className="rounded-lg border border-sky-400 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-400/10">Editar ficha</Link> : undefined} />
    <div className="space-y-5">
      <section><h2 className="text-lg font-bold">Responsabilidades</h2>
        {selectedResponsibilities(card).length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{selectedResponsibilities(card).map(label => <li key={label} className="whitespace-pre-wrap break-words">{label}</li>)}</ul> : <p className="mt-2 text-sm text-slate-400">Sin responsabilidades.</p>}
      </section>
      {details.map(([label, value]) => value ? <section key={label}><h2 className="text-lg font-bold">{label}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-300">{value}</p></section> : null)}
      {scope.kind === "game" && <section className="rounded-xl border border-white/10 p-4"><h2 className="text-lg font-bold">Revelaciones del objetivo secreto</h2>
        <p className="mt-1 text-sm text-slate-400">{card.secretRevealLimit == null ? "Sin configurar para esta partida." : `${card.secretRevealLimit} usos compartidos por departamento, de ${card.secretRevealSeconds} segundos.`}</p>
        {data.canEdit && <RevealConfigurationForm key={`${card.id}:${card.revision}:reveals`} gameId={scope.id} card={card} />}
      </section>}
    </div>
  </div>;
}
