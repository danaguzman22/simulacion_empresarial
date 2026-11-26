import Link from "next/link";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { requireGameTab } from "@/features/games/application/game-tab";
import { CardSheet, loadCardView } from "@/features/cards/components/CardSheet";

export const dynamic = "force-dynamic";

// #106: a card of this game as a card (view mode), inside the game's Fichas tab. Same checks as the list (readCards).
export default async function GameCardPage({ params }: { params: Promise<{ id: string; fichaId: string }> }) {
  const { id, fichaId } = await params;
  const game = await requireGameTab(id, "fichas");
  const scope = { kind: "game", id: game.id } as const;
  const view = await loadCardView(scope, fichaId);
  const list = `/master/partidas/${game.id}/fichas`;
  return <div className="mt-8 space-y-4">
    <Link href={list} className="inline-flex items-center gap-1 rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-400">← Volver a Fichas</Link>
    <Breadcrumbs items={[{ label: "Fichas de la partida", href: list }, { label: view.card.name }]} />
    <CardSheet scope={scope} {...view} editHref={`${list}/${view.card.id}/editar`} />
  </div>;
}
