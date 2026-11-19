import { requireGameTab } from "@/features/games/application/game-tab";
import { GameRules } from "@/features/rules/components/GameRules";

export const dynamic = "force-dynamic";

export default async function GameRulesTab({ params }: { params: Promise<{ id: string }> }) {
  const game = await requireGameTab((await params).id, "reglas");
  return <GameRules gameId={game.id} />;
}
