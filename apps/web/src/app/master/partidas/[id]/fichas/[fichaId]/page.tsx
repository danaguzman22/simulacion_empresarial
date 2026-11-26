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
    <CardSheet scope={scope} {...view} editHref={`${list}/${view.card.id}/editar`} />
  </div>;
}
