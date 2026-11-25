import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { requireGameTab } from "@/features/games/application/game-tab";
import { CardEditor, loadCardEditor } from "@/features/cards/components/CardEditor";

export const dynamic = "force-dynamic";

// #78: a card of this game in its edit screen, inside the game's Fichas tab. Same checks as the list (readCards).
export default async function GameCardEditPage({ params }: { params: Promise<{ id: string; fichaId: string }> }) {
  const { id, fichaId } = await params;
  const game = await requireGameTab(id, "fichas");
  const scope = { kind: "game", id: game.id } as const;
  const editor = await loadCardEditor(scope, fichaId);
  const list = `/master/partidas/${game.id}/fichas`, view = `${list}/${fichaId}`;
  return <div className="mt-8 space-y-4">
    <Breadcrumbs items={[{ label: "Fichas de la partida", href: list }, { label: editor.card?.name ?? "Ficha", href: view }, { label: "Editar" }]} />
    <h2 className="text-2xl font-black">Editar: {editor.card?.name}</h2>
    <CardEditor scope={scope} {...editor} doneHref={view} />
  </div>;
}
