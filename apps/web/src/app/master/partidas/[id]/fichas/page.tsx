import { requireGameTab } from "@/features/games/application/game-tab";
import { RoleCards } from "@/features/cards/components/RoleCards";

export const dynamic = "force-dynamic";

export default async function GameCardsTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "fichas");
  return <RoleCards scope={{ kind: "game", id: game.id }} />;
}
