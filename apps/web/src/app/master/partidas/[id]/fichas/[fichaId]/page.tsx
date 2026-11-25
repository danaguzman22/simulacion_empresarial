import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { requireGameTab } from "@/features/games/application/game-tab";
import { CardEditor, loadCardEditor } from "@/features/cards/components/CardEditor";

export const dynamic = "force-dynamic";

// #78: a card of this game in its own screen, inside the game's Fichas tab. Same checks as the list (readCards).
export default async function GameCardPage({ params }: { params: Promise<{ id: string; fichaId: string }> }) {
  const { id, fichaId } = await params;
  const game = await requireGameTab(id, "fichas");
  const scope = { kind: "game", id: game.id } as const;
  const editor = await loadCardEditor(scope, fichaId);
  const list = `/master/partidas/${game.id}/fichas`;
  return <div className="mt-8 space-y-4">
    <Breadcrumbs items={[{ label: "Fichas de la partida", href: list }, { label: editor.card?.name ?? "Ficha" }]} />
    <h2 className="text-2xl font-black">{`${editor.card?.visualIdentity ?? ""} ${editor.card?.name ?? ""}`.trim()}</h2>
    <CardEditor scope={scope} {...editor} doneHref={list} />
  </div>;
}
